import { css, Frame } from 'remix/component'
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { assets } from '../assets.ts'
import { ActionError, appendAction, buildAction, readActions } from '../data/actions.ts'
import { changes } from '../data/changes.ts'
import { adrTitle, getFileText, getIssue, getPull, listDir, pullIsOpen } from '../data/github.ts'
import { renderMarkdown } from '../data/markdown.ts'
import { parseRef, readTable } from '../data/table.ts'
import { githubOrg } from '../config.ts'
import { routes } from '../routes.ts'
import { AdrPage } from './adr-page.tsx'
import { Board, BOARD_FRAME } from './board.tsx'
import { DetailsError, IssuePanel, PullPanel } from './details.tsx'
import { Document } from './document.tsx'
import { LiveUpdates } from './public/live.tsx'

const noStore = { 'Cache-Control': 'no-store' }
const REPO = /^[A-Za-z0-9_.-]+$/

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
    },

    home(context) {
      return context.render(
        <Document title="Manager">
          <main mix={css({ maxWidth: '1040px', margin: '0 auto', padding: '20px 16px 60px' })}>
            <div mix={css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' })}>
              <h1 mix={css({ margin: 0, fontSize: '20px' })}>Manager</h1>
              <LiveUpdates eventsHref={routes.events.href()} frame={BOARD_FRAME} />
            </div>
            <Frame name={BOARD_FRAME} src={routes.board.href()} />
          </main>
        </Document>,
        { headers: noStore },
      )
    },

    async board(context) {
      let [table, actions] = await Promise.all([readTable(), readActions()])
      // Whether each row's PR is open, for its merge button; null (unknown) still shows the button.
      let prOpen: Record<string, boolean | null> = {}
      await Promise.all(
        table.rows.map(async (row) => {
          let ref = parseRef(row.pr)
          if (ref) prOpen[row.key] = await pullIsOpen(ref)
        }),
      )
      return context.render(<Board table={table} actions={actions} prOpen={prOpen} renderedAt={Date.now()} />, {
        headers: noStore,
      })
    },

    events(context) {
      let signal = context.request.signal
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
          signal.addEventListener('abort', cleanup, { once: true })
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

    async details(context) {
      let { repo, kind, number } = context.params
      if (!/^[A-Za-z0-9_.-]+$/.test(repo) || !/^\d+$/.test(number) || (kind !== 'pull' && kind !== 'issues')) {
        return new Response('Not Found', { status: 404 })
      }
      let ref = { repo, fullName: `${githubOrg}/${repo}`, number: Number(number) }
      let label = `${repo === 'discobox' ? '' : repo + ' '}#${number}`
      try {
        let body =
          kind === 'pull' ? (
            <PullPanel pull={await getPull(ref)} label={label} />
          ) : (
            <IssuePanel issue={await getIssue(ref)} label={label} />
          )
        return context.render(body, { headers: { 'Cache-Control': 'private, max-age=30' } })
      } catch (error: any) {
        console.error(error)
        // 200 so the frame shows the message in place of the panel.
        return context.render(
          <DetailsError what={`${kind === 'pull' ? 'PR' : 'issue'} ${label}`} message={error?.message ?? String(error)} />,
          { headers: noStore },
        )
      }
    },

    async adr(context) {
      let { repo, name } = context.params
      let file = `${name}.md`
      if (!REPO.test(repo) || !/^[\w.-]+\.md$/.test(file)) return new Response('Not Found', { status: 404 })
      let ref = context.url.searchParams.get('ref') || undefined
      try {
        let markdown = await getFileText(`${githubOrg}/${repo}`, `docs/adr/${file}`, ref)
        let html = renderMarkdown(markdown, { repo, ref, dir: 'docs/adr' })
        return context.render(<AdrPage repo={repo} ref={ref} file={file} title={adrTitle(markdown, file)} html={html} />, {
          headers: { 'Cache-Control': 'private, max-age=30' },
        })
      } catch (error: any) {
        return context.render(<AdrPage repo={repo} ref={ref} file={file} title={file} html={null} error={error?.message ?? String(error)} />, {
          status: error?.status === 404 ? 404 : 502,
          headers: noStore,
        })
      }
    },

    async adrIndex(context) {
      let { repo } = context.params
      if (!REPO.test(repo)) return new Response('Not Found', { status: 404 })
      let ref = context.url.searchParams.get('ref') || undefined
      let full = `${githubOrg}/${repo}`
      let [listing, readme] = await Promise.allSettled([
        listDir(full, 'docs/adr', ref),
        getFileText(full, 'docs/adr/README.md', ref),
      ])
      let entries =
        listing.status === 'fulfilled'
          ? listing.value.filter((e) => e.type === 'file' && /\.md$/.test(e.name) && e.name !== 'README.md').map((e) => e.name)
          : []
      let html = readme.status === 'fulfilled' ? renderMarkdown(readme.value, { repo, ref, dir: 'docs/adr' }) : null
      let error = listing.status === 'rejected' ? String(listing.reason?.message ?? listing.reason) : undefined
      return context.render(
        <AdrPage repo={repo} ref={ref} title="ADR index" html={html} entries={entries} error={error} />,
        { headers: { 'Cache-Control': 'private, max-age=30' } },
      )
    },

    async record(context) {
      let form = context.formData
      let wantsJson = (context.headers.get('Accept') ?? '').includes('application/json')
      let fail = (status: number, error: string) =>
        wantsJson ? Response.json({ error }, { status }) : new Response(error, { status })
      let key = String(form.get('key') ?? '')
      let table = await readTable()
      let row = table.rows.find((r) => r.key === key)
      if (!row) return fail(404, `No row ${JSON.stringify(key)} in the table.`)
      try {
        let action = buildAction(form, row)
        await appendAction(action)
        return wantsJson ? Response.json({ ok: true, action }) : redirect(routes.home.href(), 303)
      } catch (error) {
        if (error instanceof ActionError) return fail(400, error.message)
        throw error
      }
    },
  },
})
