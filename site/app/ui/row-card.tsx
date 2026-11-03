import type { Handle } from 'remix/component'

import type { RowDoc } from '../shared/docs.ts'
import { hasMove, parseRef, refUrl } from '../shared/refs.ts'
import type { ActionView, Store } from '../store/index.ts'
import { ActionLine } from './actions.tsx'
import { RowControls, type RefInfo } from './row-controls.tsx'

function refInfo(value: string, kind: 'issue' | 'pr'): RefInfo | null {
  let ref = parseRef(value)
  return ref ? { ...ref, label: value.trim(), href: refUrl(ref, kind) } : null
}

/** One table row: its move (when it's the owner's), what's going on, its actions and controls. */
export function RowCard(handle: Handle<{ row: RowDoc; actions: ActionView[]; store: Store }>) {
  return () => {
    let { row, actions, store } = handle.props
    let mine = row.key !== 'finished' && hasMove(row)
    let issue = refInfo(row.issue, 'issue')
    let pr = refInfo(row.pr, 'pr')
    return (
      <article class={mine ? 'card mine' : 'card'}>
        {mine ? <div class="move">→ {row.yourMove}</div> : null}
        <div class="body">
          <div class="head">
            <h3>{row.item}</h3>
            <span class="refs">
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
              {row.agent && row.agent !== '-' ? <span class="mono box">{row.agent}</span> : null}
            </span>
          </div>
          <div class="doing">
            {row.doing}
            {row.why && row.why !== '-' ? <span class="why"> · {row.why}</span> : null}
          </div>
          {actions.length ? (
            <ul class="recorded">
              {actions.map((a) => (
                <ActionLine key={a.id} action={a} />
              ))}
            </ul>
          ) : null}
          <RowControls
            rowKey={row.key}
            issue={issue}
            pr={pr}
            merge={pr && row.prOpen !== false ? { href: pr.href, prominent: /^review and merge/i.test(row.yourMove.trim()) } : null}
            store={store}
          />
        </div>
      </article>
    )
  }
}
