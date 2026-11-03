import type { ActionDoc, ActionKind, AdrFileView, AdrIndexView, DetailsDoc, DiffDoc, DiffErrorDoc, DiffPartDoc, MetaDoc, RowDoc } from '../shared/docs.ts'

/** A recorded action with what became of it. */
export interface ActionView extends ActionDoc {
  status: 'pending' | 'done' | 'refused'
  doneAt?: string | null
  note?: string | null
}

/** A problem reading the data, shown above the board. */
export interface Notice {
  lead: string
  text: string
}

export interface BoardState {
  /** The first answer has arrived. */
  loaded: boolean
  meta: MetaDoc | null
  rows: RowDoc[]
  actions: ActionView[]
  notice: Notice | null
  /** Changes arrive as they happen (box: the event stream is connected). */
  live: boolean
}

/** A document the view watches: still coming, not there (yet), or here. */
export type Loadable<T> = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; doc: T }

export type DetailsState = Loadable<DetailsDoc>
export type DiffState = Loadable<DiffDoc | DiffErrorDoc>
/** A part that couldn't be read is "ready" with an error. */
export type DiffPartState = Loadable<DiffPartDoc | { error: string }>

/** What the owner asked for, before an id is given to it. */
export interface ActionInput {
  key: string
  kind: ActionKind
  issue: { repo: string; fullName: string; number: number } | null
  pr: { repo: string; fullName: string; number: number } | null
  reason?: string
  stateReason?: 'completed' | 'not_planned'
  priority?: 'priority/high' | 'priority/critical'
  text?: string
}

/** How old the data may get before the strip says "stale", and which time it measures. */
export interface Staleness {
  field: 'postedAt' | 'syncedAt'
  afterMs: number
  title: string
}

/**
 * Where the board's data comes from. The box reads its own files over HTTP; the artifact reads
 * the documents the box's sync sends to the artifact's database. Both give the same shapes.
 */
export interface Store {
  readonly host: 'box' | 'artifact'
  readonly staleness: Staleness
  /** Whether "synced N ago" means something here (only when data arrives by sync). */
  readonly showsSync: boolean
  board(): BoardState
  /** Calls listener whenever board() changes; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Watches one issue's or PR's details (id: "vm~pull~38"). */
  details(id: string, listener: (state: DetailsState) => void): () => void
  /** Watches one PR's diff (id: "vm~pull~38"), and one file's part of it (by file index). */
  diff(id: string, listener: (state: DiffState) => void): () => void
  diffPart(id: string, index: number, listener: (state: DiffPartState) => void): () => void
  /** false once a write was refused: the viewer can only look. */
  canRecord(): boolean
  /** Records an action for the manager; resolves with its id. Rejects with a readable message. */
  record(input: ActionInput): Promise<string>
  /** The ADR viewer, where this host has one. */
  adr?: {
    file(repo: string, file: string, ref?: string): Promise<AdrFileView>
    index(repo: string, ref?: string): Promise<AdrIndexView>
  }
}
