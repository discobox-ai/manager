import type { ActionDoc, AdrFileView, AdrIndexView, DetailsDoc, DoneDoc } from '../shared/docs.ts'
import { mergeActions } from './merge.ts'
import type { ActionInput, BoardState, DetailsState, Store } from './types.ts'

/** GET /api/state (server/controller.ts) */
interface StateResponse {
  meta: BoardState['meta']
  rows: BoardState['rows']
  actions: ActionDoc[]
  actionsDone: DoneDoc[]
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
  let body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${url}: HTTP ${res.status}`)
  return body as T
}

/**
 * The box: the server's JSON API, refreshed whenever its event stream says the table or the
 * actions files changed, and once a minute regardless.
 */
export function createBoxStore(): Store {
  let state: BoardState = { loaded: false, meta: null, rows: [], actions: [], notice: null, live: false }
  let listeners = new Set<() => void>()
  let detailWatchers = new Map<string, Set<(s: DetailsState) => void>>()
  let detailDocs = new Map<string, DetailsDoc>()

  function set(patch: Partial<BoardState>) {
    state = { ...state, ...patch }
    for (let l of listeners) l()
  }

  let refreshing: Promise<void> | null = null
  let again = false
  function refresh() {
    if (refreshing) {
      again = true
      return
    }
    refreshing = getJson<StateResponse>('/api/state')
      .then((body) => {
        let done = new Map(body.actionsDone.map((d) => [d.id, d]))
        set({
          loaded: true,
          meta: body.meta,
          rows: body.rows,
          actions: mergeActions(body.actions, done),
          notice: body.meta?.error ? { lead: "Can't read the table.", text: body.meta.error } : null,
        })
      })
      .catch((error) => {
        set({ notice: { lead: "Can't reach the manager's box.", text: `${error.message}. What's shown may be out of date.` } })
      })
      .finally(() => {
        refreshing = null
        if (again) {
          again = false
          refresh()
        }
      })
    for (let id of detailWatchers.keys()) void loadDetails(id)
  }

  async function loadDetails(id: string) {
    try {
      let doc = await getJson<DetailsDoc>(`/api/details/${encodeURIComponent(id)}`)
      detailDocs.set(id, doc)
    } catch (error: any) {
      let [repo, kind, n] = id.split('~')
      detailDocs.set(id, { kind: kind === 'pull' ? 'pull' : 'issue', repo, number: Number(n), error: error.message })
    }
    let doc = detailDocs.get(id)!
    for (let l of detailWatchers.get(id) ?? []) l({ status: 'ready', doc })
  }

  let started = false
  function start() {
    if (started) return
    started = true
    refresh()
    let events = new EventSource('/api/events')
    events.addEventListener('change', refresh)
    events.addEventListener('open', () => {
      // Anything may have changed while the stream was down.
      if (state.loaded && !state.live) refresh()
      set({ live: true })
    })
    events.addEventListener('error', () => set({ live: false }))
    setInterval(refresh, 60_000)
  }

  return {
    host: 'box',
    staleness: { field: 'postedAt', afterMs: 15 * 60_000, title: 'The manager hasn’t posted the table in over 15 minutes' },
    showsSync: false,
    board: () => state,
    subscribe(listener) {
      start()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    details(id, listener) {
      let set = detailWatchers.get(id) ?? new Set()
      detailWatchers.set(id, set)
      set.add(listener)
      let known = detailDocs.get(id)
      listener(known ? { status: 'ready', doc: known } : { status: 'loading' })
      if (!known) void loadDetails(id)
      return () => {
        set.delete(listener)
        if (!set.size) detailWatchers.delete(id)
      }
    },
    canRecord: () => true,
    async record(input: ActionInput) {
      let { issue: _i, pr: _p, ...fields } = input
      let res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(fields),
      })
      let body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Couldn't record it (HTTP ${res.status}).`)
      refresh()
      return String(body.action?.id ?? '')
    },
    adr: {
      file: (repo, file, ref) =>
        getJson<AdrFileView>(`/api/adr/${encodeURIComponent(repo)}/${encodeURIComponent(file)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`),
      index: (repo, ref) =>
        getJson<AdrIndexView>(`/api/adr/${encodeURIComponent(repo)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`),
    },
  }
}
