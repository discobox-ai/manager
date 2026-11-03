import type { Handle, RemixNode } from 'remix/component'

import { hasMove } from '../shared/refs.ts'
import type { BoardState, Store } from '../store/index.ts'
import { ActionLine } from './actions.tsx'
import { RowCard } from './row-card.tsx'
import { Page } from './shell.tsx'
import { ago, stamp } from './time.ts'

/**
 * The status board: a sticky strip with the table's age and what needs the owner, then the rows
 * ranked as the table ranks them: the owner's moves first, in a warm band, everything else below.
 */
export function BoardPage(handle: Handle<{ store: Store }>) {
  let { store } = handle.props
  let now = Date.now()
  let unsubscribe = store.subscribe(() => handle.update())
  // Relative times tick even when nothing else changes.
  let timer = setInterval(() => {
    now = Date.now()
    handle.update()
  }, 15_000)
  handle.signal.addEventListener('abort', () => {
    unsubscribe()
    clearInterval(timer)
  })

  return () => {
    let state = store.board()
    now = Math.max(now, Date.now())
    let finished = state.rows.filter((r) => r.key === 'finished')
    let rest = state.rows.filter((r) => r.key !== 'finished')
    let mine = rest.filter(hasMove)
    let others = rest.filter((r) => !hasMove(r))
    let pending = state.actions.filter((a) => a.status === 'pending').length
    let recent = [...state.actions].reverse().slice(0, 10)
    let card = (row: BoardState['rows'][number]) => (
      <RowCard key={row.key} row={row} actions={state.actions.filter((a) => a.key === row.key)} store={store} />
    )

    return (
      <Page title="Manager status">
        <header class="strip">
          <h1>Manager status</h1>
          <When state={state} store={store} now={now} />
          {state.loaded ? (
            <span class="need">
              <strong>{mine.length}</strong> {mine.length === 1 ? 'row needs' : 'rows need'} you · {state.rows.length} rows
              {pending ? ` · ${pending} pending for the manager` : ''}
            </span>
          ) : null}
        </header>
        {state.meta?.slots ? (
          <section class="slots" aria-label="Worker slots">
            <strong>
              {state.meta.slots.boxes.length}/{state.meta.slots.max} running
            </strong>
            <ul>
              {state.meta.slots.boxes.map((b) => (
                <li key={b.id}>
                  {b.label} <code>{b.id}</code>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {state.notice ? (
          <div class="notice" role="status">
            <strong>{state.notice.lead}</strong> {state.notice.text}
          </div>
        ) : null}

        <Section id="mine" title="Your move" count={mine.length} loaded={state.loaded} empty="Rows that need you appear here, with the move in the band on top.">
          {mine.map(card)}
        </Section>
        <Section id="rest" title="In progress" count={others.length} loaded={state.loaded} empty="Work the manager's workers are doing appears here.">
          {others.map(card)}
        </Section>
        {finished.length ? (
          <Section id="finished" title="Finished boxes" count={finished.length} loaded={state.loaded} empty="">
            {finished.map(card)}
          </Section>
        ) : null}

        <section aria-labelledby="h-recent">
          <h2 id="h-recent">
            Recent actions <span class="count">({recent.length})</span>
          </h2>
          {recent.length ? (
            <ul class="recorded">
              {recent.map((a) => (
                <ActionLine key={a.id} action={a} showKey />
              ))}
            </ul>
          ) : (
            <p class="empty">
              Nothing recorded yet. A button on a row records an action; the manager carries it out and marks it done here.
            </p>
          )}
        </section>

        {state.meta?.links.length ? (
          <footer class="links">
            {state.meta.links.map((l) => (
              <div key={l.label}>
                {l.label}:{' '}
                {/^https?:\/\//.test(l.url) ? (
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.url}
                  </a>
                ) : (
                  l.url
                )}
              </div>
            ))}
          </footer>
        ) : null}
      </Page>
    )
  }
}

function When(handle: Handle<{ state: BoardState; store: Store; now: number }>) {
  return () => {
    let { state, store, now } = handle.props
    let meta = state.meta
    if (!meta) {
      return <span class="when">{state.loaded ? "Waiting for the first sync from the manager's box." : 'Loading…'}</span>
    }
    let measured = meta[store.staleness.field]
    let stale = measured == null || now - measured > store.staleness.afterMs
    return (
      <span class="when">
        <span class={`dot${state.live ? ' on' : ''}`} title={state.live ? 'Live: updates as the table changes' : 'Not connected; retrying'} />
        {meta.postedAt ? (
          <span title={new Date(meta.postedAt).toISOString()}>
            Table updated {ago(now - meta.postedAt)} ({stamp(meta.postedAt)})
          </span>
        ) : (
          <span>Table never posted</span>
        )}
        {store.showsSync && meta.syncedAt ? (
          <>
            {' · '}
            <span title={new Date(meta.syncedAt).toISOString()}>synced {ago(now - meta.syncedAt)}</span>
          </>
        ) : null}
        {stale ? (
          <span class="stale" title={store.staleness.title}>
            stale
          </span>
        ) : null}
      </span>
    )
  }
}

function Section(
  handle: Handle<{ id: string; title: string; count: number; loaded: boolean; empty: string; children?: RemixNode }>,
) {
  return () => {
    let { id, title, count, loaded, empty, children } = handle.props
    return (
      <section aria-labelledby={`h-${id}`}>
        <h2 id={`h-${id}`}>
          {title} <span class="count">({count})</span>
        </h2>
        {count ? <div class="cards">{children}</div> : loaded && empty ? <p class="empty">{empty}</p> : null}
      </section>
    )
  }
}
