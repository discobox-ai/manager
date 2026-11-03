import type { Handle } from 'remix/component'
import { css } from 'remix/component'

import type { ActionWithStatus } from '../data/actions.ts'
import { hasMove, parseRef, refUrl, type Row, type Table } from '../data/table.ts'
import { routes } from '../routes.ts'
import { UpdatedAt } from './public/live.tsx'
import { RowControls, type RefProps } from './public/row-controls.tsx'

export const BOARD_FRAME = 'board'

export interface BoardProps {
  table: Table
  actions: ActionWithStatus[]
  prOpen: Record<string, boolean | null>
  renderedAt: number
}

export function Board(handle: Handle<BoardProps>) {
  return () => {
    let { table, actions, prOpen, renderedAt } = handle.props
    let finished = table.rows.filter((r) => r.key === 'finished')
    let rest = table.rows.filter((r) => r.key !== 'finished')
    let mine = rest.filter(hasMove)
    let others = rest.filter((r) => !hasMove(r))
    let byKey = new Map<string, ActionWithStatus[]>()
    for (let a of actions) byKey.set(a.key, [...(byKey.get(a.key) ?? []), a])
    let pendingCount = actions.filter((a) => !a.done).length
    let recent = actions.slice(-10).reverse()

    return (
      <div mix={css({ display: 'grid', gap: '20px' })}>
        <header
          mix={css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 20px',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          })}
        >
          <UpdatedAt postedAt={table.postedAt} renderedAt={renderedAt} />
          <span>
            <strong mix={css({ fontSize: '16px' })} style={{ color: mine.length ? 'var(--move)' : undefined }}>
              {mine.length}
            </strong>{' '}
            {mine.length === 1 ? 'row needs you' : 'rows need you'} · {table.rows.length} rows ·{' '}
            {pendingCount} {pendingCount === 1 ? 'action' : 'actions'} pending for the manager
          </span>
        </header>
        {table.error ? <p mix={css({ color: 'var(--danger)' })}>Can't read the table: {table.error}</p> : null}

        <Section title="Your move" count={mine.length} empty="Nothing needs you right now.">
          {mine.map((row) => (
            <RowCard key={row.key} row={row} actions={byKey.get(row.key) ?? []} prOpen={prOpen[row.key]} highlight />
          ))}
        </Section>
        <Section title="In progress" count={others.length} empty="No other rows.">
          {others.map((row) => (
            <RowCard key={row.key} row={row} actions={byKey.get(row.key) ?? []} prOpen={prOpen[row.key]} />
          ))}
        </Section>
        {finished.length ? (
          <Section title="Finished boxes" count={finished.length} empty="">
            {finished.map((row) => (
              <RowCard key={row.key} row={row} actions={byKey.get(row.key) ?? []} prOpen={prOpen[row.key]} />
            ))}
          </Section>
        ) : null}

        <Section title="Recent actions" count={recent.length} empty="No actions recorded yet.">
          <ul mix={css({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' })}>
            {recent.map((a) => (
              <li key={a.id} data-rmx-key={`recent:${a.id}`}>
                <ActionLine action={a} showKey />
              </li>
            ))}
          </ul>
        </Section>

        {table.links.length ? (
          <footer mix={css({ color: 'var(--muted)', fontSize: '13px' })}>
            {table.links.map((l) => (
              <div key={l.label}>
                {l.label}:{' '}
                {l.url.startsWith('http') ? (
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
      </div>
    )
  }
}

function Section(handle: Handle<{ title: string; count: number; empty: string; children?: any }>) {
  return () => {
    let { title, count, empty, children } = handle.props
    return (
      <section data-rmx-key={`section:${title}`} mix={css({ display: 'grid', gap: '10px' })}>
        <h2
          mix={css({
            margin: 0,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--muted)',
          })}
        >
          {title} <span mix={css({ fontWeight: 'normal' })}>({count})</span>
        </h2>
        {count === 0 ? <p mix={css({ margin: 0, color: 'var(--muted)' })}>{empty}</p> : children}
      </section>
    )
  }
}

function refProps(value: string, kind: 'issue' | 'pr'): RefProps | null {
  let ref = parseRef(value)
  if (!ref) return null
  return {
    label: value.trim(),
    fullName: ref.fullName,
    number: ref.number,
    href: refUrl(ref, kind),
    detailsSrc: routes.details.href({ repo: ref.repo, kind: kind === 'pr' ? 'pull' : 'issues', number: String(ref.number) }),
  }
}

// data-rmx-key: a frame reload diffs the DOM by this attribute, not by JSX key, so a row's
// expanded details and half-typed form stay with that row when rows above it come or go.
function RowCard(
  handle: Handle<{ row: Row; actions: ActionWithStatus[]; prOpen?: boolean | null; highlight?: boolean }>,
) {
  return () => {
    let { row, actions, prOpen, highlight } = handle.props
    let issue = refProps(row.issue, 'issue')
    let pr = refProps(row.pr, 'pr')
    return (
      <article data-rmx-key={`row:${row.key}`} mix={cardStyle} style={highlight ? { borderColor: 'var(--move-border)' } : undefined}>
        {highlight ? (
          <div
            mix={css({
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--move)',
              background: 'var(--move-bg)',
              margin: '-12px -14px 0',
              padding: '8px 14px',
              borderRadius: '9px 9px 0 0',
              borderBottom: '1px solid var(--move-border)',
            })}
          >
            → {row.yourMove}
          </div>
        ) : null}
        <div mix={css({ display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' })}>
          <h3 mix={css({ margin: 0, fontSize: '15px', flex: '1 1 20rem' })}>{row.item}</h3>
          <span mix={css({ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' })}>
            {issue ? (
              <a href={issue.href} target="_blank" rel="noopener noreferrer">
                issue {issue.label}
              </a>
            ) : null}
            {pr ? (
              <a href={pr.href} target="_blank" rel="noopener noreferrer">
                PR {pr.label}
              </a>
            ) : null}
            {row.agent && row.agent !== '-' ? (
              <span class="mono" mix={css({ color: 'var(--muted)' })}>
                {row.agent}
              </span>
            ) : null}
          </span>
        </div>
        <div>
          {row.doing}
          {row.why && row.why !== '-' ? <span mix={css({ color: 'var(--muted)' })}> · {row.why}</span> : null}
        </div>
        {actions.length ? (
          <ul mix={css({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '2px' })}>
            {actions.map((a) => (
              <li key={a.id} data-rmx-key={`action:${a.id}`}>
                <ActionLine action={a} />
              </li>
            ))}
          </ul>
        ) : null}
        <RowControls
          rowKey={row.key}
          issue={issue}
          pr={pr}
          merge={
            pr && prOpen !== false
              ? { href: pr.href, prominent: /^review and merge/i.test(row.yourMove.trim()) }
              : null
          }
          recordHref={routes.record.href()}
          boardFrame={BOARD_FRAME}
        />
      </article>
    )
  }
}

export function describeAction(a: ActionWithStatus): string {
  let target = (kind: string, n: number | null) => `${kind} ${a.repo?.replace(/^discobox-ai\//, '') ?? ''}#${n}`
  switch (a.kind) {
    case 'close-pr':
      return `Close ${target('PR', a.pr)}${a.reason ? ` — “${a.reason}”` : ''}`
    case 'close-issue':
      return `Close ${target('issue', a.issue)} as ${a.stateReason === 'not_planned' ? 'not planned' : 'completed'}${a.reason ? ` — “${a.reason}”` : ''}`
    case 'prioritize':
      return `${a.priority} on ${target('issue', a.issue)}`
    case 'instruct':
      return `Instruction: “${a.text}”`
    default:
      return String((a as any).kind)
  }
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return ''
  let d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

function ActionLine(handle: Handle<{ action: ActionWithStatus; showKey?: boolean }>) {
  return () => {
    let { action: a, showKey } = handle.props
    return (
      <span mix={css({ fontSize: '13px' })}>
        <span
          mix={badgeStyle}
          style={
            a.done
              ? { color: 'var(--ok)', background: 'var(--ok-bg)' }
              : { color: 'var(--warn)', background: 'var(--warn-bg)' }
          }
        >
          {a.done ? 'done' : 'pending'}
        </span>{' '}
        {showKey ? <span class="mono">{a.key}</span> : null}
        {showKey ? ' · ' : null}
        {describeAction(a)}{' '}
        <span mix={css({ color: 'var(--muted)' })}>
          <span class="mono">{a.id}</span> · {fmtTime(a.at)}
          {a.done ? ` · done ${fmtTime(a.doneAt)}` : ''}
        </span>
        {a.done && a.note ? <span mix={css({ color: 'var(--ok)' })}> — {a.note}</span> : null}
      </span>
    )
  }
}

const cardStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '8px',
  padding: '12px 14px',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
})

const badgeStyle = css({
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderRadius: '4px',
  padding: '0 5px',
})
