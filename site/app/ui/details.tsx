import type { Handle } from 'remix/component'

import type { AdrDoc, Check, CommentDoc, DetailsDoc, IssueDoc, PullDoc } from '../shared/docs.ts'
import type { DetailsState, Store } from '../store/index.ts'
import { Markdown } from './html.tsx'
import { utc } from './time.ts'

/** An issue's or PR's details from GitHub, as the store has them (id: "vm~pull~38"). */
export function DetailsPanel(handle: Handle<{ id: string; store: Store }>) {
  let state: DetailsState = { status: 'loading' }
  let unsubscribe = handle.props.store.details(handle.props.id, (next) => {
    state = next
    handle.update()
  })
  handle.signal.addEventListener('abort', () => unsubscribe())

  return () => {
    let [repo, kind, n] = handle.props.id.split('~')
    let label = `${kind === 'pull' ? 'PR' : 'Issue'} ${repo === 'discobox' ? '' : repo + ' '}#${n}`
    if (state.status === 'loading') {
      return (
        <div class="panel">
          <p class="empty">Loading {label}…</p>
        </div>
      )
    }
    if (state.status === 'missing') {
      return (
        <div class="panel">
          <p class="empty">No details for {label} yet; they arrive with the next sync.</p>
        </div>
      )
    }
    return <DocPanel doc={state.doc} label={label} />
  }
}

function DocPanel(handle: Handle<{ doc: DetailsDoc; label: string }>) {
  return () => {
    let { doc: d, label } = handle.props
    if ('error' in d) {
      return (
        <div class="panel">
          <p class="error">
            Couldn't load {label} from GitHub: {d.error}
          </p>
        </div>
      )
    }
    let state = d.kind === 'pull' && d.merged ? 'merged' : d.state
    return (
      <div class="panel">
        <h4>
          <a href={d.url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
          : {d.title}
        </h4>
        <div class="facts">
          <span class={`state ${state}`}>
            {state}
            {d.stateReason && state === 'closed' ? ` (${d.stateReason.replace('_', ' ')})` : ''}
          </span>
          {d.kind === 'pull' && d.draft ? <span class="state draft">draft</span> : null}
          <span>by {d.author}</span>
          {d.kind === 'pull' ? (
            <>
              <span class="mono">
                {d.headRef} → {d.baseRef}
              </span>
              <span>
                {d.mergeable == null
                  ? `mergeability ${d.mergeableState} (computing)`
                  : d.mergeable
                    ? `mergeable (${d.mergeableState})`
                    : `not mergeable (${d.mergeableState})`}
              </span>
            </>
          ) : null}
          {d.labels.map((l) => (
            <span key={l.name} class="label">
              {l.name}
            </span>
          ))}
        </div>
        {d.kind === 'pull' ? <PullParts pull={d} /> : null}
        <h5>Description</h5>
        <Markdown html={d.bodyHtml || '<p><em>No description.</em></p>'} />
        <Comments comments={d.comments} />
        {d.truncated ? <p class="empty">Some long text here was shortened; the full text is on GitHub.</p> : null}
      </div>
    )
  }
}

function PullParts(handle: Handle<{ pull: PullDoc }>) {
  return () => {
    let d = handle.props.pull
    return (
      <>
        <h5>
          Checks on <span class="mono">{d.headSha.slice(0, 8)}</span> ({d.checks.length})
        </h5>
        {d.checks.length ? (
          <ul class="list">
            {d.checks.map((c, i) => (
              <CheckLine key={c.name + i} check={c} />
            ))}
          </ul>
        ) : (
          <p class="empty">No checks reported on the head commit.</p>
        )}
        <h5>
          Files ({d.files.length}
          {d.filesTruncated ? '+' : ''}) <span class="plus">+{d.additions}</span> <span class="minus">−{d.deletions}</span>
        </h5>
        <ul class="list files">
          {d.files.map((f) => (
            <li key={f.filename}>
              <span class="n">
                <span class="plus">+{f.additions}</span> <span class="minus">−{f.deletions}</span>
              </span>
              <span>
                {f.filename}
                {f.status !== 'modified' ? <span class="neutral"> ({f.status})</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {d.adrs.length ? (
          <>
            <h5>ADRs in this PR ({d.adrs.length})</h5>
            {d.adrs.map((a) => (
              <AdrBox key={a.path} adr={a} />
            ))}
          </>
        ) : null}
      </>
    )
  }
}

const FAILED = new Set(['failure', 'error', 'timed_out', 'cancelled', 'action_required', 'startup_failure'])

function CheckLine(handle: Handle<{ check: Check }>) {
  return () => {
    let c = handle.props.check
    let result = c.conclusion ?? c.status
    let cls = result === 'success' ? 'ok' : FAILED.has(result) ? 'fail' : c.conclusion == null ? 'run' : 'neutral'
    let icon = cls === 'ok' ? '✓' : cls === 'fail' ? '✗' : cls === 'run' ? '…' : '–'
    return (
      <li>
        <span class={cls}>
          {icon} {result.replace('_', ' ')}
        </span>{' '}
        {c.url && /^https:\/\//.test(c.url) ? (
          <a href={c.url} target="_blank" rel="noopener noreferrer">
            {c.name}
          </a>
        ) : (
          c.name
        )}
      </li>
    )
  }
}

function AdrBox(handle: Handle<{ adr: AdrDoc }>) {
  return () => {
    let a = handle.props.adr
    return (
      <details class="adr">
        <summary>
          <strong>{a.title}</strong>{' '}
          <span class="sub">
            <span class="mono">{a.filename}</span> ({a.status})
          </span>
        </summary>
        {a.patch ? (
          <details class="diff">
            <summary>diff</summary>
            <Patch patch={a.patch} />
          </details>
        ) : null}
        {a.error ? <p class="error">Couldn't read the file: {a.error}</p> : <Markdown html={a.html} />}
      </details>
    )
  }
}

function Patch(handle: Handle<{ patch: string }>) {
  return () => (
    <pre class="patch">
      {handle.props.patch.split('\n').map((line, i) => (
        <span key={i} class={line.startsWith('@@') ? 'h' : line.startsWith('+') ? 'a' : line.startsWith('-') ? 'd' : undefined}>
          {line || ' '}
        </span>
      ))}
    </pre>
  )
}

function Comments(handle: Handle<{ comments: IssueDoc['comments'] }>) {
  return () => {
    let { comments } = handle.props
    if (!comments.length) return null
    return (
      <>
        <h5>Last {comments.length} comments</h5>
        {comments.map((c: CommentDoc) => (
          <div key={c.url} class="comment">
            <div class="who">
              <strong>{c.author}</strong> ·{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {utc(c.at)}
              </a>
            </div>
            <Markdown html={c.html} />
          </div>
        ))}
      </>
    )
  }
}
