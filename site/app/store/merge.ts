import type { ActionDoc, DoneDoc } from '../shared/docs.ts'
import type { ActionView } from './types.ts'

/** Recorded actions joined with their done records, oldest first. */
export function mergeActions(actions: Iterable<ActionDoc>, done: Map<string, DoneDoc>): ActionView[] {
  return [...actions]
    .map((a) => {
      let d = done.get(a.id)
      let status: ActionView['status'] = d ? (d.rejected ? 'refused' : 'done') : 'pending'
      return { ...a, status, doneAt: d?.at ?? null, note: d?.note ?? null }
    })
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
}
