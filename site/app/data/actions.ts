import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs/promises'

import { actionsDonePath, actionsPath, stateDir } from '../config.ts'
import { parseRef, type Row } from './table.ts'

export type ActionKind = 'close-pr' | 'close-issue' | 'prioritize' | 'instruct'

export interface RecordedAction {
  id: string
  at: string
  kind: ActionKind
  key: string
  repo?: string
  issue: number | null
  pr: number | null
  reason?: string
  stateReason?: 'completed' | 'not_planned'
  priority?: 'priority/high' | 'priority/critical'
  text?: string
}

export interface ActionWithStatus extends RecordedAction {
  done: boolean
  doneAt?: string
  note?: string
}

async function readJsonl(path: string): Promise<any[]> {
  let text: string
  try {
    text = await fs.readFile(path, 'utf8')
  } catch {
    return []
  }
  let out: any[] = []
  for (let line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // A torn or hand-edited line is skipped rather than failing the page.
    }
  }
  return out
}

export async function readActions(): Promise<ActionWithStatus[]> {
  let [actions, dones] = await Promise.all([readJsonl(actionsPath), readJsonl(actionsDonePath)])
  let doneById = new Map<string, any>()
  for (let d of dones) if (d && d.id && d.done) doneById.set(String(d.id), d)
  return actions
    .filter((a) => a && a.id && a.kind)
    .map((a) => {
      let d = doneById.get(String(a.id))
      return { ...a, done: Boolean(d), doneAt: d?.at, note: d?.note }
    })
}

export class ActionError extends Error {}

function clean(v: FormDataEntryValue | null, max = 4000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Builds the action line from the submitted form and the row it is about. */
export function buildAction(form: FormData, row: Row): RecordedAction {
  let kind = clean(form.get('kind')) as ActionKind
  let issue = parseRef(row.issue)
  let pr = parseRef(row.pr)
  let id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  let at = new Date().toISOString()
  // Field order is the order a person reads the line in.
  let line = <T extends object>(kind: ActionKind, repo: string | undefined, rest: T) => ({
    id,
    at,
    kind,
    key: row.key,
    ...(repo ? { repo } : {}),
    issue: issue?.number ?? null,
    pr: pr?.number ?? null,
    ...rest,
  })
  let reason = clean(form.get('reason'))
  switch (kind) {
    case 'close-pr': {
      if (!pr) throw new ActionError('This row has no PR.')
      return line(kind, pr.fullName, reason ? { reason } : {})
    }
    case 'close-issue': {
      if (!issue) throw new ActionError('This row has no issue.')
      let stateReason = clean(form.get('stateReason'))
      if (stateReason !== 'completed' && stateReason !== 'not_planned')
        throw new ActionError('Choose completed or not planned.')
      return line(kind, issue.fullName, { stateReason, ...(reason ? { reason } : {}) })
    }
    case 'prioritize': {
      if (!issue) throw new ActionError('This row has no issue.')
      let priority = clean(form.get('priority'))
      if (priority !== 'priority/high' && priority !== 'priority/critical')
        throw new ActionError('Choose priority/high or priority/critical.')
      return line(kind, issue.fullName, { priority })
    }
    case 'instruct': {
      let text = clean(form.get('text'), 20000)
      if (!text) throw new ActionError('Write the instruction.')
      let repo = (issue ?? pr)?.fullName
      return line(kind, repo, { text })
    }
    default:
      throw new ActionError(`Unknown action kind ${JSON.stringify(kind)}.`)
  }
}

/** One write of one full line to a file opened O_APPEND, so concurrent appends never interleave. */
export async function appendAction(action: RecordedAction): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true })
  let fh = await fs.open(actionsPath, 'a')
  try {
    await fh.write(Buffer.from(JSON.stringify(action) + '\n'))
  } finally {
    await fh.close()
  }
}
