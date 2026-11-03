import { CHAT_KIND, type ActionDoc, type ChatDoc, type DetailsDoc, type DoneDoc, type MetaDoc, type RowDoc } from '../shared/docs.ts'
import { mergeActions, mergeChat } from './merge.ts'
import type { ActionInput, BoardState, DetailsState, Loadable, Notice, Store } from './types.ts'

// The parts of the artifact runtime's db and user capabilities this page uses (contract 0.2.96).
interface DbError {
  code: string
  message: string
}
interface SnapshotMetadata {
  fromCache: boolean
}
interface DocumentSnapshot {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
  metadata: SnapshotMetadata
}
interface QuerySnapshot {
  docs: DocumentSnapshot[]
  metadata: SnapshotMetadata
}
interface DocumentReference {
  set(data: Record<string, unknown>): Promise<void>
  onSnapshot(next: (snap: DocumentSnapshot) => void, error?: (e: DbError) => void): () => void
}
interface CollectionReference {
  doc(id: string): DocumentReference
  onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: DbError) => void): () => void
}
interface Db {
  doc(path: string): DocumentReference
  collection(path: string): CollectionReference
}
interface User {
  can(name: string): Promise<boolean | null>
}
declare global {
  interface Window {
    claude?: { use(name: 'db'): Promise<Db | null>; use(name: 'user'): Promise<User | null> }
  }
}

function newId(): string {
  let bytes = crypto.getRandomValues(new Uint8Array(3))
  return Date.now().toString(36) + '-' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The artifact on claude.ai: the database the box's sync agent fills (meta/state, rows, details,
 * actionsDone). A button press writes an actions document with status "pending"; the sync agent
 * carries it to the box, and its actionsDone document comes back when the manager has done it.
 */
export function createArtifactStore(): Store {
  let state: BoardState = { loaded: false, meta: null, rows: [], actions: [], chat: [], notice: null, live: false }
  let listeners = new Set<() => void>()
  let db: Db | null = null
  let dbReady: Promise<Db | null> | null = null
  let writable = true
  let actions = new Map<string, ActionDoc>()
  let done = new Map<string, DoneDoc>()

  function set(patch: Partial<BoardState>) {
    state = { ...state, ...patch }
    for (let l of listeners) l()
  }

  function connect(): Promise<Db | null> {
    dbReady ??= (async () => {
      db = (await window.claude?.use('db')) ?? null
      if (!db) {
        set({
          notice: {
            lead: "This view can't read the status data.",
            text: "Open the page on claude.ai while signed in to see the manager's rows.",
          },
        })
        return null
      }
      void window.claude?.use('user').then(async (user) => {
        if (user && (await user.can('data.write')) === false) {
          writable = false
          set({})
        }
      })
      watchBoard(db)
      return db
    })()
    return dbReady
  }

  function watchBoard(db: Db) {
    let notice = (n: Notice | null) => set({ notice: n })
    let timer = setTimeout(() => {
      notice({
        lead: "The status data can't be reached yet.",
        text: state.loaded ? "What's shown may be out of date." : 'It appears here as soon as it loads.',
      })
    }, 10_000)
    let settled = (snap: { metadata: SnapshotMetadata }) => {
      if (snap.metadata.fromCache) return
      clearTimeout(timer)
      if (!state.loaded || state.notice?.lead.startsWith("The status data can't")) set({ loaded: true, live: true, notice: null })
    }
    let failed = (what: string) => (e: DbError) => {
      clearTimeout(timer)
      set({ live: false })
      notice({ lead: `Couldn't read ${what} (${e.code}).`, text: 'Reload the page to try again.' })
    }
    let thread = new Map<string, ChatDoc>()
    let actionsChanged = () => set({ actions: mergeActions(actions.values(), done), chat: mergeChat(thread.values(), actions.values()) })

    db.doc('meta/state').onSnapshot((snap) => {
      settled(snap)
      let meta = snap.exists ? (snap.data() as unknown as MetaDoc) : null
      set({ meta })
      if (!meta && state.loaded && !state.rows.length) {
        notice({
          lead: 'Waiting for the first sync.',
          text: "The manager's box hasn't sent its status table here yet; rows appear as soon as it does.",
        })
      }
    }, failed('the sync state'))
    db.collection('rows').onSnapshot((snap) => {
      settled(snap)
      let rows = snap.docs.map((d) => d.data() as unknown as RowDoc).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      set({ rows })
    }, failed('the rows'))
    db.collection('actions').onSnapshot((snap) => {
      actions = new Map(snap.docs.map((d) => [d.id, d.data() as unknown as ActionDoc]))
      actionsChanged()
    }, failed('recorded actions'))
    db.collection('chat').onSnapshot((snap) => {
      thread = new Map(snap.docs.map((d) => [d.id, d.data() as unknown as ChatDoc]))
      actionsChanged()
    }, failed('the chat'))
    db.collection('actionsDone').onSnapshot((snap) => {
      done = new Map(snap.docs.map((d) => [d.id, d.data() as unknown as DoneDoc]))
      actionsChanged()
    }, failed('finished actions'))
  }

  /** Watches one document: loading until the database answers, missing until the sync sends it. */
  function watchDoc<T>(path: string, listener: (s: Loadable<T>) => void, fail: (message: string) => T): () => void {
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    listener({ status: 'loading' })
    void connect().then((db) => {
      if (!db || cancelled) return
      unsubscribe = db.doc(path).onSnapshot(
        (snap) => {
          if (snap.exists) listener({ status: 'ready', doc: snap.data() as unknown as T })
          else listener(snap.metadata.fromCache ? { status: 'loading' } : { status: 'missing' })
        },
        (e) => listener({ status: 'ready', doc: fail(`Couldn't read it (${e.code}).`) }),
      )
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }

  return {
    host: 'artifact',
    staleness: { field: 'syncedAt', afterMs: 45 * 60_000, title: "No sync from the manager's box in over 45 minutes" },
    showsSync: true,
    board: () => state,
    subscribe(listener) {
      void connect()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    details(id, listener) {
      let unsubscribe: (() => void) | null = null
      let cancelled = false
      listener({ status: 'loading' })
      void connect().then((db) => {
        if (!db || cancelled) return
        unsubscribe = db.doc(`details/${id}`).onSnapshot(
          (snap) => {
            if (snap.exists) listener({ status: 'ready', doc: snap.data() as unknown as DetailsDoc })
            else listener(snap.metadata.fromCache ? { status: 'loading' } : { status: 'missing' })
          },
          (e) => {
            let [repo, kind, n] = id.split('~')
            let error = `Couldn't read these details (${e.code}).`
            listener({ status: 'ready', doc: { kind: kind === 'pull' ? 'pull' : 'issue', repo, number: Number(n), error } })
          },
        )
      })
      return () => {
        cancelled = true
        unsubscribe?.()
      }
    },
    diff(id, listener) {
      let [repo, , n] = id.split('~')
      return watchDoc(`diffs/${id}`, listener as any, (error) => ({ kind: 'diff', repo, number: Number(n), error }))
    },
    diffPart(id, index, listener) {
      return watchDoc(`diffParts/${id}~${index}`, listener, (error) => ({ error }))
    },
    canRecord: () => writable,
    async sendChat(text: string) {
      let db = await connect()
      if (!db) throw new Error("This view can't send messages: it can't reach the status data.")
      let body = text.trim()
      if (!body) throw new Error('Write a message first.')
      let doc = { id: newId(), at: new Date().toISOString(), kind: CHAT_KIND, key: 'chat', text: body.slice(0, 4000), status: 'pending' }
      try {
        await db.collection('actions').doc(doc.id).set(doc)
      } catch (error: any) {
        if (error?.code === 'invalid_argument' || error?.code === 'not_granted') {
          writable = false
          set({})
          throw new Error('This view can only look; it can’t send messages.')
        }
        throw new Error(`Couldn't send it (${error?.code ?? error?.message ?? error}).`)
      }
    },
    async record(input: ActionInput) {
      let db = await connect()
      if (!db) throw new Error("This view can't record actions: it can't reach the status data.")
      let target = input.kind === 'close-pr' ? input.pr : (input.issue ?? input.pr)
      let doc: Record<string, unknown> = {
        id: newId(),
        at: new Date().toISOString(),
        kind: input.kind,
        key: input.key,
        repo: target?.fullName ?? null,
        issue: input.issue?.number ?? null,
        pr: input.pr?.number ?? null,
        status: 'pending',
      }
      for (let name of ['reason', 'stateReason', 'priority', 'text', 'move'] as const) {
        if (input[name]) doc[name] = input[name]
      }
      try {
        await db.collection('actions').doc(String(doc.id)).set(doc)
      } catch (error: any) {
        if (error?.code === 'invalid_argument' || error?.code === 'not_granted') {
          writable = false
          set({})
          throw new Error("This page can't record actions for you: your access to it is view-only.")
        }
        throw new Error(`Couldn't record it (${error?.code ?? 'error'}). Try again in a moment.`)
      }
      return String(doc.id)
    },
  }
}
