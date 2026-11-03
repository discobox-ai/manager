import { css, Frame } from 'remix/component'
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { assets } from '../assets.ts'
import { ActionError, appendAction, buildAction, readActions } from '../data/actions.ts'
import { changes } from '../data/changes.ts'
import { getIssue, getPull } from '../data/github.ts'
import { readTable } from '../data/table.ts'
import { githubOrg } from '../config.ts'
import { routes } from '../routes.ts'
import { Board, BOARD_FRAME } from './board.tsx'
import { DetailsError, IssuePanel, PullPanel } from './details.tsx'
import { Document } from './document.tsx'
import { LiveUpdates } from './public/live.tsx'

const noStore = { 'Cache-Control': 'no-store' }

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
      return context.render(<Board table={table} actions={actions} renderedAt={Date.now()} />, {
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
