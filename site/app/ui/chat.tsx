import { on, ref, type Handle } from 'remix/component'

import type { ChatView, Store } from '../store/index.ts'
import { ago, utc } from './time.ts'

const SEEN_KEY = 'manager-chat-seen'

/** The id of the newest manager reply the owner has had open. */
export function seenReply(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function markSeen(chat: ChatView[]) {
  let last = [...chat].reverse().find((m) => m.from === 'manager')
  if (!last) return
  try {
    localStorage.setItem(SEEN_KEY, last.id)
  } catch {}
}

/** Whether the newest message is a manager reply the owner hasn't opened. */
export function hasUnread(chat: ChatView[]): boolean {
  let last = chat.at(-1)
  return Boolean(last && last.from === 'manager' && last.id !== seenReply())
}

/**
 * The owner's one thread with the manager. A message lands in chat.jsonl, which wakes the manager
 * (the site-chat monitor); its reply comes back into the thread.
 */
export function ChatPanel(handle: Handle<{ chat: ChatView[]; store: Store; now: number }>) {
  let draft = ''
  let sending = false
  let error: string | null = null
  let thread: HTMLElement | null = null
  let box: HTMLTextAreaElement | null = null
  let lastCount = -1

  async function send() {
    let text = draft.trim()
    if (!text || sending) return
    sending = true
    error = null
    handle.update()
    try {
      await handle.props.store.sendChat(text)
      draft = ''
      if (box) box.value = ''
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    sending = false
    handle.update()
    box?.focus()
  }

  return () => {
    let { chat, store, now } = handle.props
    markSeen(chat)
    if (chat.length !== lastCount) {
      lastCount = chat.length
      queueMicrotask(() => thread?.scrollTo({ top: thread.scrollHeight }))
    }
    let last = chat.at(-1)
    let waiting = last?.from === 'owner'
    let canSend = store.canRecord()
    return (
      <section class="chat" aria-label="Chat with the manager">
        <div class="chat-thread" mix={ref((el: HTMLElement) => (thread = el))}>
          {chat.length ? (
            chat.map((m) => (
              <div key={m.id} class={`msg ${m.from}${m.status ? ' ' + m.status : ''}`}>
                <div class="who">
                  {m.from === 'owner' ? 'you' : 'manager'}
                  <span title={utc(m.at)}> · {ago(now - Date.parse(m.at))}</span>
                  {m.status === 'sending' ? <span> · waiting for the next sync</span> : null}
                </div>
                <div class="text">{m.text}</div>
              </div>
            ))
          ) : (
            <p class="empty">
              Ask the manager anything, or tell it what to do. It’s woken by your message and replies here.
            </p>
          )}
          {waiting && last?.status !== 'sending' ? <p class="chat-waiting">The manager has it; its reply appears here.</p> : null}
        </div>
        {canSend ? (
          <form
            class="composer"
            mix={on('submit', (event) => {
              event.preventDefault()
              void send()
            })}
          >
            <textarea
              id="chat-input"
              rows={2}
              placeholder="Message the manager · Enter sends, Shift+Enter for a new line"
              aria-label="Message the manager"
              disabled={sending}
              mix={[
                ref((el: HTMLTextAreaElement) => {
                  box = el
                  el.value = draft
                }),
                on('input', (event) => {
                  draft = (event.currentTarget as HTMLTextAreaElement).value
                }),
                on('keydown', (event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                    event.preventDefault()
                    void send()
                  }
                }),
              ]}
            />
            <button type="submit" class="send" disabled={sending}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        ) : (
          <p class="empty">This view can only look; it can’t send messages.</p>
        )}
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    )
  }
}
