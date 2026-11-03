import type { Handle } from 'remix/component'

import type { ActionView } from '../store/index.ts'
import { utc } from './time.ts'

export function describeAction(a: ActionView): string {
  let repo = String(a.repo ?? '').replace(/^discobox-ai\//, '')
  let target = (kind: string, n: number | null) => `${kind} ${repo}#${n}`
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
      return String((a as { kind: string }).kind)
  }
}

/** One recorded action: its status pill, what it asks, its id and times, and the manager's note. */
export function ActionLine(handle: Handle<{ action: ActionView; showKey?: boolean }>) {
  return () => {
    let { action: a, showKey } = handle.props
    return (
      <li>
        <span class={`pill ${a.status}`}>{a.status}</span>{' '}
        {showKey ? (
          <>
            <span class="mono">{a.key}</span> ·{' '}
          </>
        ) : null}
        {describeAction(a)}{' '}
        <span class="meta">
          <span class="mono">{a.id}</span> · {utc(a.at)}
          {a.status !== 'pending' && a.doneAt ? ` · ${a.status} ${utc(a.doneAt)}` : ''}
        </span>
        {a.note ? <span class={a.status === 'refused' ? 'error' : 'note'}> — {a.note}</span> : null}
      </li>
    )
  }
}
