import { createController } from 'remix/router'

import type { AdrFileView, AdrIndexView, ChatDoc, DetailsDoc } from '../app/shared/docs.ts'
import { ActionError, appendAction, buildAction, readActions } from './actions.ts'
import { api } from './api.ts'
import { changes } from './changes.ts'
import { appendOwnerMessage, ChatError, readChat } from './chat.ts'
import { githubOrg } from './config.ts'
import { actionDoc, detailsDoc, doneDoc, metaDoc, rowDocs } from './docs.ts'
import { diffFor } from './diff/index.ts'
import { adrTitle, getFileText, listDir } from './github.ts'
import { renderMarkdown } from './markdown.ts'
import { readTable } from './table.ts'

const noStore = { 'Cache-Control': 'no-store' }
const REPO = /^[A-Za-z0-9_.-]+$/
const DETAILS_ID = /^([A-Za-z0-9_.-]+)~(pull|issues)~(\d+)$/

/** The box's state, in the artifact database's collections. */
export interface StateResponse {
  meta: ReturnType<typeof metaDoc> & { syncedAt: number }
  rows: Awaited<ReturnType<typeof rowDocs>>
  actions: ReturnType<typeof actionDoc>[]
  actionsDone: NonNullable<ReturnType<typeof doneDoc>>[]
  chat: ChatDoc[]
}

export default createController(api, {
  actions: {
    async state() {
      let [table, actions, chat] = await Promise.all([readTable(), readActions(), readChat()])
      let body: StateResponse = {
        meta: { ...metaDoc(table), syncedAt: Date.now() },
        rows: await rowDocs(table),
        actions: actions.map(actionDoc),
        actionsDone: actions.map(doneDoc).filter((d) => d !== null),
        chat,
      }
      return Response.json(body, { headers: noStore })
    },

    async details({ params }) {
      let m = params.id.match(DETAILS_ID)
      if (!m) return Response.json({ error: 'Not found' }, { status: 404 })
      let doc: DetailsDoc = await detailsDoc(m[1], m[2] as 'pull' | 'issues', Number(m[3]), 'viewer')
      return Response.json(doc, { headers: { 'Cache-Control': 'private, max-age=30' } })
    },

    async diff({ params }) {
      let m = params.id.match(DETAILS_ID)
      if (!m || m[2] !== 'pull') return Response.json({ error: 'Not found' }, { status: 404 })
      let built = await diffFor(m[1], Number(m[3]), 'viewer')
      let doc = 'error' in built ? built : built.doc
      return Response.json(doc, { headers: { 'Cache-Control': 'private, max-age=30' } })
    },

    async diffPart({ params }) {
      let m = params.id.match(DETAILS_ID)
      let index = Number(params.index)
      if (!m || m[2] !== 'pull' || !Number.isInteger(index)) return Response.json({ error: 'Not found' }, { status: 404 })
      let built = await diffFor(m[1], Number(m[3]), 'viewer')
      if ('error' in built) return Response.json({ error: built.error }, { status: 502 })
      let part = built.parts[index]
      if (!part) return Response.json({ error: 'Not found' }, { status: 404 })
      return Response.json(part, { headers: { 'Cache-Control': 'private, max-age=300' } })
    },

    events({ request }) {
      let encoder = new TextEncoder()
      let cleanup = () => {}
      let stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let send = (text: string) => {
            try {
              controller.enqueue(encoder.encode(text))
            } catch {
              cleanup()
            }
          }
          let onChange = () => send(`event: change\ndata: ${Date.now()}\n\n`)
          let heartbeat = setInterval(() => send(`: ping\n\n`), 25_000)
          changes.addEventListener('change', onChange)
          cleanup = () => {
            clearInterval(heartbeat)
            changes.removeEventListener('change', onChange)
            try {
              controller.close()
            } catch {}
          }
          request.signal.addEventListener('abort', cleanup, { once: true })
          send(`retry: 3000\n: connected\n\n`)
        },
        cancel() {
          cleanup()
        },
      })
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' },
      })
    },

    async chat({ request }) {
      let input: Record<string, unknown>
      try {
        input = await request.json()
      } catch {
        return Response.json({ error: 'Send the message as JSON.' }, { status: 400 })
      }
      try {
        let message = await appendOwnerMessage(input.text)
        return Response.json({ ok: true, message })
      } catch (error) {
        if (error instanceof ChatError) return Response.json({ error: error.message }, { status: 400 })
        throw error
      }
    },

    async record({ request }) {
      let input: Record<string, unknown>
      try {
        input = await request.json()
      } catch {
        return Response.json({ error: 'Send the action as JSON.' }, { status: 400 })
      }
      let key = String(input.key ?? '')
      let table = await readTable()
      let row = table.rows.find((r) => r.key === key)
      if (!row) return Response.json({ error: `No row ${JSON.stringify(key)} in the table.` }, { status: 404 })
      let form = new FormData()
      for (let name of ['kind', 'reason', 'stateReason', 'priority', 'text']) {
        if (input[name] != null) form.set(name, String(input[name]))
      }
      try {
        let action = buildAction(form, row)
        await appendAction(action)
        return Response.json({ ok: true, action })
      } catch (error) {
        if (error instanceof ActionError) return Response.json({ error: error.message }, { status: 400 })
        throw error
      }
    },

    async adr({ params, url }) {
      let { repo, name } = params
      let file = `${name}.md`
      if (!REPO.test(repo) || !/^[\w.-]+\.md$/.test(file)) return Response.json({ error: 'Not found' }, { status: 404 })
      let ref = url.searchParams.get('ref') || undefined
      try {
        let markdown = await getFileText(`${githubOrg}/${repo}`, `docs/adr/${file}`, ref)
        let body: AdrFileView = {
          title: adrTitle(markdown, file),
          html: renderMarkdown(markdown, { repo, ref, dir: 'docs/adr' }),
        }
        return Response.json(body, { headers: { 'Cache-Control': 'private, max-age=30' } })
      } catch (error: any) {
        return Response.json({ error: error?.message ?? String(error) }, { status: error?.status === 404 ? 404 : 502 })
      }
    },

    async adrIndex({ params, url }) {
      let { repo } = params
      if (!REPO.test(repo)) return Response.json({ error: 'Not found' }, { status: 404 })
      let ref = url.searchParams.get('ref') || undefined
      let full = `${githubOrg}/${repo}`
      let [listing, readme] = await Promise.allSettled([
        listDir(full, 'docs/adr', ref),
        getFileText(full, 'docs/adr/README.md', ref),
      ])
      let body: AdrIndexView = {
        entries:
          listing.status === 'fulfilled'
            ? listing.value
                .filter((e) => e.type === 'file' && /\.md$/.test(e.name) && e.name !== 'README.md')
                .map((e) => e.name)
            : [],
        html: readme.status === 'fulfilled' ? renderMarkdown(readme.value, { repo, ref, dir: 'docs/adr' }) : null,
        ...(listing.status === 'rejected' ? { error: String(listing.reason?.message ?? listing.reason) } : {}),
      }
      return Response.json(body, { headers: { 'Cache-Control': 'private, max-age=30' } })
    },
  },
})
