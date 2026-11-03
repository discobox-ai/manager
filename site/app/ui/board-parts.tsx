// The board's pieces: a row's parts, where its work stands (its mark in the list), the header line,
// and a row's body in the pane.
import { on, type Handle, type RemixNode } from 'remix/component'

import type { RowDoc } from '../shared/docs.ts'
import { hasMove, parseRef, refUrl } from '../shared/refs.ts'
import { routes } from '../routes.ts'
import { href } from '../routing.ts'
import type { ActionView, BoardState, Store } from '../store/index.ts'
import { ActionLine } from './actions.tsx'
import { RowControls, type RefInfo } from './row-controls.tsx'
import { ago, stamp } from './time.ts'

export interface BoardProps {
  state: BoardState
  store: Store
  now: number
}

export interface Parts {
  issue: RefInfo | null
  pr: RefInfo | null
  diff: string | null
  mine: boolean
}

function refInfo(value: string, kind: 'issue' | 'pr'): RefInfo | null {
  let ref = parseRef(value)
  return ref ? { ...ref, label: value.trim(), href: refUrl(ref, kind) } : null
}

export function parts(row: RowDoc): Parts {
  let pr = refInfo(row.pr, 'pr')
  return {
    issue: refInfo(row.issue, 'issue'),
    pr,
    diff: pr ? href(routes.diff.href({ repo: pr.repo, number: String(pr.number) })) : null,
    mine: row.key !== 'finished' && hasMove(row),
  }
}

export function present(value: string | undefined | null): string {
  let v = (value ?? '').trim()
  return v === '-' || v === '–' || v === '—' ? '' : v
}

/** Where a row's work stands, from what its agent is doing. */
export type Stage = 'yours' | 'review' | 'working' | 'blocked' | 'queued' | 'done'

export const STAGE_LABEL: Record<Stage, string> = {
  yours: 'Your move',
  working: 'Working',
  review: 'Checks and review',
  blocked: 'Blocked',
  queued: 'Queued',
  done: 'Done',
}

export const STAGE_GLYPH: Record<Stage, string> = {
  yours: '●',
  working: '◐',
  review: '◌',
  blocked: '⊘',
  queued: '○',
  done: '✓',
}

export function stage(row: RowDoc): Stage {
  if (row.key === 'finished') return 'done'
  if (hasMove(row)) return 'yours'
  let d = row.doing.toLowerCase()
  if (/blocked|waits on|waiting on/.test(d)) return 'blocked'
  if (/checks? (running|failing)|rebas|green|review|pr \d+ open|pr open/.test(d)) return 'review'
  if (/^ready|filed|triage|starts on|queued|waits for/.test(d)) return 'queued'
  if (!present(row.doing)) return 'queued'
  return 'working'
}

export function actionsFor(state: BoardState, row: RowDoc): ActionView[] {
  return state.actions.filter((a) => a.key === row.key)
}

/** The board's one header line: name, freshness, what needs you and the worker slots. */
export function Topline(handle: Handle<BoardProps & { children?: RemixNode }>) {
  return () => {
    let { state, store, now, children } = handle.props
    let meta = state.meta
    let measured = meta?.[store.staleness.field]
    let stale = meta && (measured == null || now - measured > store.staleness.afterMs)
    let slots = meta?.slots
    return (
      <header class="topline">
        <h1>Manager status</h1>
        <span class="tl-meta">
          <span class={`dot${state.live ? ' on' : ''}`} title={state.live ? 'Live' : 'Not connected; retrying'} />
          {meta?.postedAt ? <span title={stamp(meta.postedAt)}>updated {ago(now - meta.postedAt)}</span> : <span>{state.loaded ? 'never posted' : 'loading…'}</span>}
          {store.showsSync && meta?.syncedAt ? <span> · synced {ago(now - meta.syncedAt)}</span> : null}
          {stale ? <span class="stale" title={store.staleness.title}>stale</span> : null}
        </span>
        {slots ? (
          <span class="tl-slots" title={slots.boxes.map((b) => `${b.label}  ${b.id}`).join('\n')}>
            {slots.boxes.length}/{slots.max} workers
          </span>
        ) : null}
        {children}
      </header>
    )
  }
}

/** A notice about the data, when there is one. */
export function Notice(handle: Handle<{ state: BoardState }>) {
  return () => {
    let n = handle.props.state.notice
    return n ? (
      <div class="notice" role="status">
        <strong>{n.lead}</strong> {n.text}
      </div>
    ) : null
  }
}

/** Recent actions, folded to one line until opened. */
export function RecentLine(handle: Handle<{ state: BoardState }>) {
  let open = false
  return () => {
    let recent = [...handle.props.state.actions].reverse().slice(0, 10)
    let pending = recent.filter((a) => a.status === 'pending').length
    return (
      <section class="recent-line" aria-label="Recent actions">
        <button
          type="button"
          class="quiet-toggle"
          aria-expanded={open}
          mix={on('click', () => {
            open = !open
            handle.update()
          })}
        >
          {open ? '▾' : '▸'} Recent actions · {recent.length}
          {pending ? ` · ${pending} pending` : ''}
        </button>
        {open ? (
          recent.length ? (
            <ul class="recorded">
              {recent.map((a) => (
                <ActionLine key={a.id} action={a} showKey />
              ))}
            </ul>
          ) : (
            <p class="empty">Nothing recorded yet.</p>
          )
        ) : null}
      </section>
    )
  }
}

/** A row's refs, as small mono links: issue, PR, diff, box. */
export function Refs(handle: Handle<{ row: RowDoc; box?: boolean }>) {
  return () => {
    let { row, box = true } = handle.props
    let p = parts(row)
    return (
      <span class="refs">
        {p.issue ? (
          <a href={p.issue.href} target="_blank" rel="noopener noreferrer">
            #{p.issue.label}
          </a>
        ) : null}
        {p.pr ? (
          <a href={p.pr.href} target="_blank" rel="noopener noreferrer">
            PR {p.pr.label}
          </a>
        ) : null}
        {p.diff ? <a href={p.diff}>diff</a> : null}
        {box && present(row.agent) ? <span class="box">{row.agent}</span> : null}
      </span>
    )
  }
}

/** Everything about a row past its title: doing and why, recorded actions, and the buttons. */
export function RowBody(handle: Handle<{ row: RowDoc; state: BoardState; store: Store; detailsOpen?: boolean; showMove?: boolean }>) {
  return () => {
    let { row, state, store, detailsOpen, showMove } = handle.props
    let p = parts(row)
    let acts = actionsFor(state, row)
    return (
      <div class="row-body">
        {showMove && p.mine ? <div class="move">→ {row.yourMove}</div> : null}
        <div class="doing">
          {present(row.doing) || 'Nothing reported.'}
          {present(row.why) ? <span class="why"> · {row.why}</span> : null}
        </div>
        <Refs row={row} />
        {acts.length ? (
          <ul class="recorded">
            {acts.map((a) => (
              <ActionLine key={a.id} action={a} />
            ))}
          </ul>
        ) : null}
        <RowControls
          rowKey={row.key}
          issue={p.issue}
          pr={p.pr}
          merge={p.pr && row.prOpen !== false ? { href: p.pr.href, prominent: /^review and merge/i.test(row.yourMove.trim()) } : null}
          store={store}
          detailsOpen={detailsOpen}
        />
      </div>
    )
  }
}

/** The rows in the board's three groups. */
export function groups(state: BoardState) {
  let finished = state.rows.filter((r) => r.key === 'finished')
  let rest = state.rows.filter((r) => r.key !== 'finished')
  return { mine: rest.filter(hasMove), others: rest.filter((r) => !hasMove(r)), finished }
}
