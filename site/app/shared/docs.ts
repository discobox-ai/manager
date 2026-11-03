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
  /** The box only: batches waiting for the sync agent to send to the artifact, and since when. */
  relay?: RelayStatus
}

/** artifact-sync/relay.json, written by sync.ts each cycle. */
export interface RelayStatus {
  waiting: number
  /** Since when nothing has been sent (ms): the oldest batch's queueing, or when it last moved; null when nothing waits. */
  oldestAt: number | null
  checkedAt: number
  /** Nothing sent for longer than the alarm (10 minutes). */
  stalled: boolean
}

/** rows/<id>: one table row, its place in the table, and whether its PR is open (null: unknown). */
export interface RowDoc extends Row {
  rank: number
  prOpen: boolean | null
}

export type ActionKind = 'close-pr' | 'close-issue' | 'prioritize' | 'instruct' | 'resolve'

/** An actions/<id> document the artifact writes for a chat message; the sync carries it to chat.jsonl. */
export const CHAT_KIND = 'chat'

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
  /** resolve: the move the owner says is handled, as the row said it then. */
  move?: string
}

/** chat/<id>, and one line of chat.jsonl (the owner's) or chat-replies.jsonl (the manager's). */
export interface ChatDoc {
  id: string
  at: string
  from: 'owner' | 'manager'
  text: string
  /** The owner's message a reply answers. */
  replyTo?: string
}

/** actionsDone/<id> */
export interface DoneDoc {
  id: string
  done: true
  at: string | null
  note: string | null
  /** The box refused an action the artifact recorded; note says why. */
  rejected?: boolean
  /** A resolve the manager reopened (scripts/action unresolve): it still needs the owner; note says why. */
  unresolved?: boolean
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

/** A declaration that differs between a PR's base and head (server/diff/). */
export interface DeclChangeDoc {
  key: string
  kind: 'func' | 'method' | 'type' | 'interface' | 'class' | 'enum' | 'const' | 'var' | 'field'
  name: string
  container?: string
  status: 'added' | 'removed' | 'changed' | 'moved'
  /** What callers see changed: the declaration is new, gone, or its signature differs. */
  signatureChanged: boolean
  /** Only the body differs (or differs as well). */
  bodyChanged: boolean
  /** The signature at the base and at the head, as written. */
  before?: string
  after?: string
  /** Its line at the head (at the base, when removed). */
  line: number
  /** The file it was in at the base, when it moved. */
  movedFrom?: string
  exported: boolean
  /** The file's part (DiffPartDoc) has the body's diff under this change's key. */
  hasBodyPatch?: boolean
}

export interface DiffFileDoc {
  filename: string
  previousFilename?: string
  status: string
  additions: number
  deletions: number
  /** code: has declarations (when parsed); docs: markdown; other: lines only. */
  kind: 'code' | 'docs' | 'other'
  language?: string
  generated?: boolean
  /** Test code: under Lines only. */
  test?: boolean
  decls?: DeclChangeDoc[]
  /** There's a part document (diffParts/<id>~<index>) with its lines, docs or body diffs. */
  hasPart: boolean
  /** Why a view of this file is missing (too large, couldn't be read or parsed). */
  note?: string
}

/**
 * diffParts/<repo~pull~n>~<file index>: one file's bulky views, read when the viewer opens it, so
 * the PR's own document stays small.
 */
export interface DiffPartDoc {
  headSha: string
  filename: string
  /** GitHub's patch for the file; missing for binary files and very large diffs. */
  patch?: string
  /** Markdown at the head, rendered, with <ins> and <del> where it changed. */
  docHtml?: string
  /** Unified diffs of changed bodies, by declaration key, with the file's own line numbers. */
  bodyPatches?: Record<string, string>
  truncated?: boolean
}

/** diffs/<repo~pull~n>: a PR's changes, for the diff viewer's tabs. */
export interface DiffDoc {
  kind: 'diff'
  repo: string
  number: number
  title: string
  url: string
  /** The merge base: what GitHub's own diff compares against. */
  baseSha: string
  headSha: string
  files: DiffFileDoc[]
  filesTruncated: boolean
  truncated?: boolean
}

export interface DiffErrorDoc {
  kind: 'diff'
  repo: string
  number: number
  error: string
}
