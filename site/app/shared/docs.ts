// The documents both views read. The box's API serves them; sync.ts writes the same shapes to the
// artifact's database (collections meta, rows, details, actions, actionsDone).
import type { Row } from './refs.ts'

/** meta/state */
export interface MetaDoc {
  postedAt: number | null
  rowCount: number
  needYou: number
  links: { label: string; url: string }[]
  /** Worker slots: the most allowed, and the workers running now, one line each. */
  slots?: { max: number; boxes: { id: string; label: string }[] }
  /** When the box last sent this (the artifact); when this answer was built (the box). */
  syncedAt?: number
  /** The table couldn't be read. */
  error?: string
}

/** rows/<id>: one table row, its place in the table, and whether its PR is open (null: unknown). */
export interface RowDoc extends Row {
  rank: number
  prOpen: boolean | null
}

export type ActionKind = 'close-pr' | 'close-issue' | 'prioritize' | 'instruct'

/** actions/<id>, and one line of actions.jsonl. */
export interface ActionDoc {
  id: string
  at: string
  kind: ActionKind
  key: string
  repo?: string | null
  issue: number | null
  pr: number | null
  reason?: string
  stateReason?: 'completed' | 'not_planned'
  priority?: 'priority/high' | 'priority/critical'
  text?: string
}

/** actionsDone/<id> */
export interface DoneDoc {
  id: string
  done: true
  at: string | null
  note: string | null
  /** The box refused an action the artifact recorded; note says why. */
  rejected?: boolean
}

export interface Label {
  name: string
  color: string
}

export interface CommentDoc {
  author: string
  at: string
  url: string
  html: string
}

export interface Check {
  name: string
  status: string
  conclusion: string | null
  url: string | null
}

export interface FileDoc {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface AdrDoc {
  path: string
  filename: string
  status: string
  title: string
  html: string
  patch?: string
  error?: string
}

export interface IssueDoc {
  kind: 'issue'
  repo: string
  number: number
  title: string
  state: string
  stateReason: string | null
  author: string
  url: string
  labels: Label[]
  bodyHtml: string
  comments: CommentDoc[]
  truncated?: boolean
}

export interface PullDoc extends Omit<IssueDoc, 'kind'> {
  kind: 'pull'
  draft: boolean
  merged: boolean
  mergeable: boolean | null
  mergeableState: string
  headSha: string
  headRef: string
  baseRef: string
  checks: Check[]
  files: FileDoc[]
  filesTruncated: boolean
  additions: number
  deletions: number
  adrs: AdrDoc[]
}

export interface DetailsErrorDoc {
  kind: 'issue' | 'pull'
  repo: string
  number: number
  error: string
}

/** details/<repo~kind~n> */
export type DetailsDoc = IssueDoc | PullDoc | DetailsErrorDoc

/** What the ADR viewer shows: one file, or a repository's index. */
export interface AdrFileView {
  title: string
  html: string
}

export interface AdrIndexView {
  html: string | null
  entries: string[]
  error?: string
}
