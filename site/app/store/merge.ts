import { CHAT_KIND, type ActionDoc, type ChatDoc, type DoneDoc } from '../shared/docs.ts'
import type { ActionView, ChatView } from './types.ts'

/** Recorded actions joined with their done records, oldest first. */
export function mergeActions(actions: Iterable<ActionDoc>, done: Map<string, DoneDoc>): ActionView[] {
  return [...actions]
    .filter((a) => (a.kind as string) !== CHAT_KIND)
    .map((a) => {
      let d = done.get(a.id)
      let status: ActionView['status'] = d ? (d.rejected ? 'refused' : 'done') : 'pending'
      return { ...a, status, doneAt: d?.at ?? null, note: d?.note ?? null }
    })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

/**
 * The thread: what the box has, plus the artifact's own messages the sync hasn't carried over yet
 * (actions documents of kind chat), shown as sending.
 */
export function mergeChat(thread: Iterable<ChatDoc>, outgoing: Iterable<ActionDoc>): ChatView[] {
  let have = new Map<string, ChatView>()
  for (let m of thread) have.set(m.id, m)
  for (let a of outgoing) {
    if ((a.kind as string) !== CHAT_KIND || have.has(a.id) || !a.text) continue
    have.set(a.id, { id: a.id, at: a.at, from: 'owner', text: a.text, status: 'sending' })
  }
  return [...have.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}
