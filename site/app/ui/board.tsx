import { on, type Handle } from 'remix/component'

import type { RowDoc } from '../shared/docs.ts'
import type { Store } from '../store/index.ts'
import { groups, Notice, parts, RecentLine, RowBody, stage, STAGE_GLYPH, STAGE_LABEL, Topline } from './board-parts.tsx'
import { ChatPanel, hasUnread } from './chat.tsx'
import { Page } from './shell.tsx'

const CHAT = '\u0000chat'

/**
 * The status board as an inbox: the chat with the manager and the table's rows down the left
 * (what needs the owner first), and whatever is chosen on the right, in full.
 */
export function BoardPage(handle: Handle<{ store: Store }>) {
  let { store } = handle.props
  let now = Date.now()
  let selected: string | null = null
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

  function choose(key: string) {
    selected = key
    handle.update()
    // On a narrow screen the pane is below the list: bring it into view.
    if (matchMedia('(max-width: 760px)').matches) queueMicrotask(() => document.querySelector('.inbox-pane')?.scrollIntoView({ behavior: 'smooth' }))
  }

  return () => {
    let state = store.board()
    now = Math.max(now, Date.now())
    let { mine, others, finished } = groups(state)
    let all = [...mine, ...others, ...finished]
    let row = selected === CHAT ? null : (all.find((r) => r.key === selected) ?? (selected === null ? all[0] : null))
    let chatOpen = selected === CHAT || !row
    let last = state.chat.at(-1)
    let item = (r: RowDoc) => {
      let s = stage(r)
      return (
        <li key={r.key}>
          <button
            type="button"
            class={`inbox-item${r === row ? ' selected' : ''}`}
            aria-current={r === row}
            mix={on('click', () => choose(r.key))}
          >
            <span class={`glyph ${s}`} title={STAGE_LABEL[s]}>
              {STAGE_GLYPH[s]}
            </span>
            <span class="title">{r.item}</span>
          </button>
        </li>
      )
    }
    return (
      <Page title="Manager status">
        <div class="layout layout-inbox">
          <Topline state={state} store={store} now={now} />
          <Notice state={state} />
          <div class="inbox">
            <nav class="inbox-list" aria-label="Rows">
              <ul>
                <li>
                  <button
                    type="button"
                    class={`inbox-item chat-item${chatOpen ? ' selected' : ''}`}
                    aria-current={chatOpen}
                    mix={on('click', () => choose(CHAT))}
                  >
                    <span class={`glyph${hasUnread(state.chat) ? ' yours' : ''}`}>{hasUnread(state.chat) ? '●' : '›'}</span>
                    <span class="title">
                      Chat with the manager
                      {last ? <span class="preview">{(last.from === 'owner' ? 'you: ' : '') + last.text}</span> : null}
                    </span>
                  </button>
                </li>
              </ul>
              <h2>Your move · {mine.length}</h2>
              <ul>{mine.map(item)}</ul>
              <h2>In progress · {others.length + finished.length}</h2>
              <ul>{[...others, ...finished].map(item)}</ul>
            </nav>
            <article class="inbox-pane">
              {chatOpen ? (
                <>
                  <h2 class="pane-title">Chat with the manager</h2>
                  <ChatPanel chat={state.chat} store={store} now={now} />
                </>
              ) : (
                <>
                  {parts(row!).mine ? <div class="move">→ {row!.yourMove}</div> : null}
                  <h2 class="pane-title">{row!.item}</h2>
                  <RowBody key={row!.key} row={row!} state={state} store={store} detailsOpen={Boolean(parts(row!).pr || parts(row!).issue)} />
                </>
              )}
            </article>
          </div>
          <RecentLine state={state} />
        </div>
      </Page>
    )
  }
}
