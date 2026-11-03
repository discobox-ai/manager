import type { Handle } from 'remix/component'
import { css, unsafeHTML } from 'remix/component'

import type { Check, Comment, IssueDetails, PullDetails } from '../data/github.ts'

// body_html comes from GitHub's own renderer, which sanitizes it. Links open in a new tab.
function githubHtml(html: string): ReturnType<typeof unsafeHTML> {
  let cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<a (?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer" ')
  return unsafeHTML(cleaned || '<p><em>No description.</em></p>')
}

export function DetailsError(handle: Handle<{ what: string; message: string }>) {
  return () => (
    <div mix={panelStyle}>
      <p mix={css({ margin: 0, color: 'var(--danger)' })}>
        Couldn't load {handle.props.what} from GitHub: {handle.props.message}
      </p>
    </div>
  )
}

export function IssuePanel(handle: Handle<{ issue: IssueDetails; label: string }>) {
  return () => {
    let { issue, label } = handle.props
    return (
      <div mix={panelStyle}>
        <Head kind="Issue" label={label} title={issue.title} url={issue.url} />
        <Meta>
          <StateBadge state={issue.state} detail={issue.stateReason ?? undefined} />
          <span>by {issue.author}</span>
          <Labels labels={issue.labels} />
        </Meta>
        <div class="md" innerHTML={githubHtml(issue.bodyHtml)} />
        <Comments comments={issue.comments} />
      </div>
    )
  }
}

export function PullPanel(handle: Handle<{ pull: PullDetails; label: string }>) {
  return () => {
    let { pull, label } = handle.props
    let state = pull.merged ? 'merged' : pull.state
    let mergeable =
      pull.mergeable === null
        ? `mergeability ${pull.mergeableState} (GitHub is computing)`
        : pull.mergeable
          ? `mergeable (${pull.mergeableState})`
          : `not mergeable (${pull.mergeableState})`
    return (
      <div mix={panelStyle}>
        <Head kind="PR" label={label} title={pull.title} url={pull.url} />
        <Meta>
          <StateBadge state={state} />
          {pull.draft ? <StateBadge state="draft" /> : null}
          <span>by {pull.author}</span>
          <span class="mono">
            {pull.headRef} → {pull.baseRef}
          </span>
          <span>{mergeable}</span>
          <Labels labels={pull.labels} />
        </Meta>

        <h4 mix={subhead}>
          Checks on <span class="mono">{pull.headSha.slice(0, 8)}</span> ({pull.checks.length})
        </h4>
        {pull.checks.length ? (
          <ul mix={listStyle}>
            {pull.checks.map((c, i) => (
              <li key={c.name + i}>
                <CheckLine check={c} />
              </li>
            ))}
          </ul>
        ) : (
          <p mix={muted}>No checks reported on the head commit.</p>
        )}

        <h4 mix={subhead}>
          Files ({pull.files.length}
          {pull.filesTruncated ? '+' : ''}) <span mix={css({ color: 'var(--ok)' })}>+{pull.additions}</span>{' '}
          <span mix={css({ color: 'var(--danger)' })}>−{pull.deletions}</span>
        </h4>
        <ul mix={listStyle}>
          {pull.files.map((f) => (
            <li key={f.filename} class="mono" mix={css({ display: 'flex', gap: '10px' })}>
              <span mix={css({ minWidth: '5.5em', textAlign: 'right', whiteSpace: 'nowrap' })}>
                <span mix={css({ color: 'var(--ok)' })}>+{f.additions}</span>{' '}
                <span mix={css({ color: 'var(--danger)' })}>−{f.deletions}</span>
              </span>
              <span mix={css({ overflowWrap: 'anywhere' })}>
                {f.filename}
                {f.status !== 'modified' ? <span mix={muted}> ({f.status})</span> : null}
              </span>
            </li>
          ))}
        </ul>

        <h4 mix={subhead}>Description</h4>
        <div class="md" innerHTML={githubHtml(pull.bodyHtml)} />
        <Comments comments={pull.comments} />
      </div>
    )
  }
}

function Head(handle: Handle<{ kind: string; label: string; title: string; url: string }>) {
  return () => {
    let { kind, label, title, url } = handle.props
    return (
      <h3 mix={css({ margin: 0, fontSize: '15px' })}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {kind} {label}
        </a>
        : {title}
      </h3>
    )
  }
}

function Meta(handle: Handle<{ children?: any }>) {
  return () => (
    <div mix={css({ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center', color: 'var(--muted)' })}>
      {handle.props.children}
    </div>
  )
}

const STATE_COLORS: Record<string, [string, string]> = {
  open: ['var(--ok)', 'var(--ok-bg)'],
  closed: ['var(--danger)', 'var(--danger-bg)'],
  merged: ['#8250df', 'rgba(130,80,223,0.15)'],
  draft: ['var(--muted)', 'var(--code-bg)'],
}

function StateBadge(handle: Handle<{ state: string; detail?: string }>) {
  return () => {
    let { state, detail } = handle.props
    let [fg, bg] = STATE_COLORS[state] ?? ['var(--muted)', 'var(--code-bg)']
    return (
      <span mix={badge} style={{ color: fg, background: bg }}>
        {state}
        {detail && state === 'closed' ? ` (${detail.replace('_', ' ')})` : ''}
      </span>
    )
  }
}

function Labels(handle: Handle<{ labels: { name: string; color: string }[] }>) {
  return () => (
    <>
      {handle.props.labels.map((l) => (
        <span
          key={l.name}
          mix={css({ fontSize: '12px', borderRadius: '999px', padding: '0 8px', border: '1px solid' })}
          style={{ borderColor: `#${l.color}`, background: `#${l.color}33` }}
        >
          {l.name}
        </span>
      ))}
    </>
  )
}

function CheckLine(handle: Handle<{ check: Check }>) {
  return () => {
    let c = handle.props.check
    let result = c.conclusion ?? c.status
    let color =
      result === 'success'
        ? 'var(--ok)'
        : ['failure', 'error', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(result)
          ? 'var(--danger)'
          : c.conclusion === null
            ? 'var(--warn)'
            : 'var(--muted)'
    let icon = result === 'success' ? '✓' : color === 'var(--danger)' ? '✗' : c.conclusion === null ? '…' : '–'
    return (
      <span>
        <span style={{ color }}>
          {icon} {result.replace('_', ' ')}
        </span>{' '}
        {c.url ? (
          <a href={c.url} target="_blank" rel="noopener noreferrer">
            {c.name}
          </a>
        ) : (
          c.name
        )}
      </span>
    )
  }
}

function Comments(handle: Handle<{ comments: Comment[] }>) {
  return () => {
    let { comments } = handle.props
    if (!comments.length) return <p mix={muted}>No comments.</p>
    return (
      <>
        <h4 mix={subhead}>Last {comments.length} comments</h4>
        {comments.map((c) => (
          <div key={c.url} mix={css({ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'grid', gap: '4px' })}>
            <div mix={muted}>
              <strong mix={css({ color: 'var(--fg)' })}>{c.author}</strong> ·{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {new Date(c.at).toISOString().replace('T', ' ').slice(0, 16)}Z
              </a>
            </div>
            <div class="md" innerHTML={githubHtml(c.bodyHtml)} />
          </div>
        ))}
      </>
    )
  }
}

const panelStyle = css({
  display: 'grid',
  gap: '8px',
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderLeft: '3px solid var(--accent)',
  borderRadius: '8px',
  background: 'var(--bg)',
  minWidth: 0,
})
const subhead = css({ margin: '6px 0 0', fontSize: '13px' })
const listStyle = css({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '2px' })
const muted = css({ margin: 0, color: 'var(--muted)' })
const badge = css({ fontSize: '12px', fontWeight: 600, borderRadius: '999px', padding: '0 8px' })
