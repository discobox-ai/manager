import { CHAT_KIND, type ActionDoc, type ChatDoc, type DoneDoc } from '../shared/docs.ts'
import type { ActionView, ChatView } from './types.ts'

/** Recorded actions joined with their done records, oldest first. */
export function mergeActions(actions: Iterable<ActionDoc>, done: Map<string, DoneDoc>): ActionView[] {
  return [...actions]
    .filter((a) => (a.kind as string) !== CHAT_KIND)
    .map((a) => {
      let d = done.get(a.id)
      let status: ActionView['status'] = d ? (d.rejected ? 'refused' : d.unresolved ? 'reopened' : 'done') : 'pending'
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

/**
 * The owner's resolve for each row it still applies to: the newest one whose move is the row's move
 * as it reads now, unless the manager reopened it. A changed move is a new ask.
 */
export function resolutions(rows: Iterable<{ key: string; yourMove: string }>, actions: ActionView[]): Map<string, ActionView> {
  let out = new Map<string, ActionView>()
  for (let row of rows) {
    let move = row.yourMove.trim()
    let last = actions.filter((a) => a.kind === 'resolve' && a.key === row.key && (a.move ?? '').trim() === move).at(-1)
    if (last && last.status !== 'reopened' && last.status !== 'refused') out.set(row.key, last)
  }
  return out
}

/** The manager's reopening of a row's resolve, while the move is unchanged: why it still needs the owner. */
export function reopening(row: { key: string; yourMove: string }, actions: ActionView[]): ActionView | null {
  let move = row.yourMove.trim()
  let last = actions.filter((a) => a.kind === 'resolve' && a.key === row.key && (a.move ?? '').trim() === move).at(-1)
  return last?.status === 'reopened' ? last : null
}
