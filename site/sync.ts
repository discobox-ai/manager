// Keeps the "Manager status" artifact's database fed from this box, with no model involved.
//
// Every cycle (60 s, or at once when table.json or actions-done.jsonl changes) it builds the
// documents the artifact page reads, writes each changed one to docs/<collection>/<id>.json, and
// queues Artifact write_db batches in outbox/<epoch-ms>.json for the sync agent, which announces
// them with a line in changed.log. Button presses come back the other way: the agent saves pulled
// `actions` documents into inbox/, and this script appends each one, once, to the real
// actions.jsonl in the site's own line format.
//
// The documents come from server/docs.ts, the same builders the box's API serves, so both views
// say the same thing.
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { appendAction, buildAction, readActions, ActionError } from './server/actions.ts'
import { actionsDonePath, stateDir, tablePath } from './server/config.ts'
import { diffFor } from './server/diff/index.ts'
import { detailsDoc, doneDoc, metaDoc, rowDocs, wantedDetails } from './server/docs.ts'
import { hasMove, readTable, type Row } from './server/table.ts'
import type { DetailsDoc } from './app/shared/docs.ts'

const syncDir = process.env.SYNC_DIR ?? path.join(stateDir, 'artifact-sync')
const docsDir = path.join(syncDir, 'docs')
const outboxDir = path.join(syncDir, 'outbox')
const inboxDir = path.join(syncDir, 'inbox')
const inboxDoneDir = path.join(inboxDir, 'done')
const changedLog = path.join(syncDir, 'changed.log')
const statePath = path.join(syncDir, 'state.json')

const CYCLE_MS = Number(process.env.SYNC_CYCLE_MS ?? 60_000)
const FLUSH_MIN_MS = Number(process.env.SYNC_FLUSH_MIN_MS ?? 120_000)
// meta/state carries syncedAt, which the page turns STALE after 45 minutes; resend it this often
// even when nothing else changed, so a quiet table isn't mistaken for a dead sync.
const HEARTBEAT_MS = Number(process.env.SYNC_HEARTBEAT_MS ?? 30 * 60_000)
const INBOX_POLL_MS = 3_000
const MAX_DOC_BYTES = 200_000
const MAX_BATCH_WRITES = Number(process.env.SYNC_MAX_BATCH_WRITES ?? 50)
const MAX_BATCH_BYTES = Number(process.env.SYNC_MAX_BATCH_BYTES ?? 900_000)
const ONCE = process.argv.includes('--once') // one cycle, flush whatever changed, exit (for tests)
const DRY = process.argv.includes('--dry-run') // with --once: print the queue, write no outbox

type Write =
  | { op: 'set'; collection: string; doc_id: string; file_path: string }
  | { op: 'delete'; collection: string; doc_id: string }

interface SyncState {
  hashes: Record<string, string> // "rows/vm~33" -> content hash (syncedAt excluded)
  pending: Record<string, 'set' | 'delete'> // changes not yet in an outbox file
  lastFlushAt: number
  lastMoveSet: string // the "Your move" keys at the last flush
  ingested: string[] // inbound action ids already appended to actions.jsonl
  rejected: Record<string, { at: string; note: string }> // inbound actions refused, shown on the page
}

const VALID_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/

/** A table key as a document id: "vm 33" -> "vm~33"; other characters as +XX. */
export function docId(key: string): string {
  let id = key.replace(/ /g, '~').replace(/[^A-Za-z0-9_\-.~:@]/g, (c) =>
    [...Buffer.from(c)].map((b) => '+' + b.toString(16).padStart(2, '0')).join(''),
  )
  if (id === '.' || id === '..' || id === '') id = '+' + Buffer.from(key || '-').toString('hex')
  return id.slice(0, 200)
}

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args)
}

async function loadState(): Promise<SyncState> {
  try {
    let s = JSON.parse(await fsp.readFile(statePath, 'utf8'))
    return { hashes: {}, pending: {}, lastFlushAt: 0, lastMoveSet: '', ingested: [], rejected: {}, ...s }
  } catch {
    return { hashes: {}, pending: {}, lastFlushAt: 0, lastMoveSet: '', ingested: [], rejected: {} }
  }
}

async function writeAtomic(file: string, text: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  let tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, text)
  await fsp.rename(tmp, file)
}

async function saveState(state: SyncState) {
  state.ingested = state.ingested.slice(-5000)
  await writeAtomic(statePath, JSON.stringify(state))
}

function hashOf(doc: Record<string, unknown>): string {
  let { syncedAt: _ignored, ...rest } = doc
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex')
}

/** Shrinks the longest strings until the document fits, leaving a note where text was cut. */
function fit(doc: Record<string, any>): Record<string, any> {
  let size = () => Buffer.byteLength(JSON.stringify(doc))
  for (let guard = 0; size() > MAX_DOC_BYTES && guard < 50; guard++) {
    let longest: { obj: any; key: string | number; len: number } | null = null
    let walk = (obj: any) => {
      for (let [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') {
          if (!longest || v.length > longest.len) longest = { obj, key: k, len: v.length }
        } else if (v && typeof v === 'object') walk(v)
      }
    }
    walk(doc)
    if (!longest) break
    let { obj, key, len } = longest as { obj: any; key: string | number; len: number }
    let keep = Math.max(2000, len - (size() - MAX_DOC_BYTES) - 2000)
    if (keep >= len) keep = Math.floor(len / 2)
    let text: string = obj[key]
    let isHtml = /<\/?[a-z][^>]*>/i.test(text)
    let cut = text.slice(0, keep)
    if (isHtml) cut = cut.slice(0, Math.max(cut.lastIndexOf('>') + 1, 1))
    obj[key] =
      cut + (isHtml ? '<p><em>[Truncated here to fit; read the rest on GitHub.]</em></p>' : '\n[Truncated here to fit; read the rest on GitHub.]')
    doc.truncated = true
  }
  return doc
}

async function buildDocs(state: SyncState): Promise<{ docs: Map<string, Record<string, any>>; moveSet: string; meta: Record<string, any> }> {
  let table = await readTable()
  if (table.error) throw new Error(table.error)
  let docs = new Map<string, Record<string, any>>()
  let need = table.rows.filter((r) => r.key !== 'finished' && hasMove(r))

  // Details first, so each row can say whether its PR is open (the merge button).
  let details = new Map<string, DetailsDoc>()
  await Promise.all(
    [...wantedDetails(table.rows)].map(async ([id, w]) => {
      let doc = await detailsDoc(w.repo, w.kind, w.n, 'github')
      details.set(id, doc)
      docs.set(`details/${id}`, 'error' in doc ? doc : fit(doc))
    }),
  )
  for (let row of await rowDocs(table, details)) docs.set(`rows/${docId(row.key)}`, row)

  // The diff viewer's documents, for open PRs: one per PR, and one per file with its bulky views.
  await Promise.all(
    [...details].map(async ([id, d]) => {
      if ('error' in d || d.kind !== 'pull' || d.state !== 'open' || d.merged) return
      let built = await diffFor(d.repo, d.number, 'github')
      if ('error' in built) {
        docs.set(`diffs/${id}`, built)
        return
      }
      docs.set(`diffs/${id}`, fit(built.doc))
      built.parts.forEach((part, i) => {
        if (part) docs.set(`diffParts/${id}~${i}`, fit(part))
      })
    }),
  )

  for (let a of await readActions()) {
    let done = doneDoc(a)
    if (done && VALID_ID.test(a.id)) docs.set(`actionsDone/${a.id}`, done)
  }
  // An action the page recorded but this box refused: closed on the page with the reason.
  for (let [id, r] of Object.entries(state.rejected)) {
    docs.set(`actionsDone/${id}`, { id, done: true, rejected: true, at: r.at, note: `Not recorded: ${r.note}` })
  }

  let { error: _e, ...meta } = metaDoc(table)
  return { docs, moveSet: need.map((r) => r.key).join('\n'), meta }
}

function docFile(docPath: string) {
  let [collection, id] = docPath.split('/')
  return path.join(docsDir, collection, `${id}.json`)
}

/** Writes changed documents to disk and records them (and deletions) as pending writes. */
async function stage(state: SyncState, docs: Map<string, Record<string, any>>): Promise<number> {
  let changed = 0
  for (let [docPath, doc] of docs) {
    let h = hashOf(doc)
    if (state.hashes[docPath] === h) continue
    await writeAtomic(docFile(docPath), JSON.stringify(doc))
    state.hashes[docPath] = h
    state.pending[docPath] = 'set'
    changed++
  }
  for (let docPath of Object.keys(state.hashes)) {
    if (docPath === 'meta/state' || docs.has(docPath)) continue
    // The file stays on disk: an earlier, unsent batch may still name it.
    delete state.hashes[docPath]
    state.pending[docPath] = 'delete'
    changed++
  }
  return changed
}

function splitBatches(writes: Write[]): Write[][] {
  let batches: Write[][] = []
  let cur: Write[] = []
  let bytes = 0
  for (let w of writes) {
    let size = w.op === 'set' ? fs.statSync(w.file_path).size : 0
    if (cur.length && (cur.length >= MAX_BATCH_WRITES || bytes + size > MAX_BATCH_BYTES)) {
      batches.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(w)
    bytes += size
  }
  if (cur.length) batches.push(cur)
  return batches
}

async function flush(state: SyncState, meta: Record<string, any>, moveSet: string, dry: boolean): Promise<Write[][]> {
  let syncedAt = Date.now()
  let metaDoc = { ...meta, syncedAt }
  let metaPath = docFile('meta/state')
  await writeAtomic(metaPath, JSON.stringify(metaDoc))
  state.hashes['meta/state'] = hashOf(metaDoc)
  delete state.pending['meta/state']

  // Deletes first, then sets in a stable order (rows before the bigger details), meta/state last.
  let order = (p: string) => (p.startsWith('rows/') ? 0 : p.startsWith('actionsDone/') ? 1 : 2)
  let entries = Object.entries(state.pending).sort(
    ([a, oa], [b, ob]) => (oa === ob ? order(a) - order(b) || a.localeCompare(b) : oa === 'delete' ? -1 : 1),
  )
  let writes: Write[] = entries.map(([docPath, op]) => {
    let [collection, doc_id] = docPath.split('/')
    return op === 'set' ? { op, collection, doc_id, file_path: docFile(docPath) } : { op, collection, doc_id }
  })
  writes.push({ op: 'set', collection: 'meta', doc_id: 'state', file_path: metaPath })
  let batches = splitBatches(writes)
  if (dry) return batches

  let base = Date.now()
  let names: string[] = []
  for (let [i, batch] of batches.entries()) {
    let name = `${base + i}.json`
    await writeAtomic(path.join(outboxDir, name), JSON.stringify({ writes: batch }, null, 1))
    names.push(name)
  }
  await fsp.appendFile(changedLog, `${new Date(syncedAt).toISOString()} ${writes.length} writes in ${names.join(' ')}\n`)
  state.pending = {}
  state.lastFlushAt = syncedAt
  state.lastMoveSet = moveSet
  return batches
}

let running = false
let again = false

async function cycle(state: SyncState) {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    let { docs, meta, moveSet } = await buildDocs(state)
    let changed = await stage(state, docs)
    let pending = Object.keys(state.pending).length
    let now = Date.now()
    let moveChanged = moveSet !== state.lastMoveSet
    let due = now - state.lastFlushAt >= FLUSH_MIN_MS
    let heartbeat = now - state.lastFlushAt >= HEARTBEAT_MS
    if (ONCE || (pending && (due || moveChanged)) || heartbeat) {
      let batches = await flush(state, meta, moveSet, DRY)
      log(`${changed} changed; flushed ${batches.reduce((n, b) => n + b.length, 0)} writes in ${batches.length} batch(es)${moveChanged ? ' (Your move changed)' : ''}`)
      if (DRY) printQueue(batches)
    } else if (changed) {
      log(`${changed} changed; ${pending} pending, next flush in ${Math.ceil((FLUSH_MIN_MS - (now - state.lastFlushAt)) / 1000)}s`)
    }
    await saveState(state)
  } catch (error) {
    log('cycle failed:', error)
  } finally {
    running = false
    if (again) {
      again = false
      void cycle(state)
    }
  }
}

function printQueue(batches: Write[][]) {
  for (let [i, b] of batches.entries()) {
    let bytes = b.reduce((n, w) => n + (w.op === 'set' ? fs.statSync(w.file_path).size : 0), 0)
    console.log(`batch ${i + 1}: ${b.length} writes, ${bytes} bytes of documents`)
    for (let w of b) console.log(`  ${w.op} ${w.collection}/${w.doc_id}${w.op === 'set' ? ` (${fs.statSync(w.file_path).size} B)` : ''}`)
  }
}

/** An inbound action document from the artifact, as the agent saved it (bare body or {data}). */
async function ingestInbox(state: SyncState) {
  let files: string[] = []
  for (let dir of [inboxDir, path.join(inboxDir, 'actions')]) {
    try {
      for (let f of await fsp.readdir(dir)) if (f.endsWith('.json')) files.push(path.join(dir, f))
    } catch {}
  }
  if (!files.length) return
  let seen = new Set([...state.ingested, ...(await readActions()).map((a) => a.id)])
  let table = await readTable()
  for (let file of files) {
    let outcome = 'ingested'
    try {
      let raw = JSON.parse(await fsp.readFile(file, 'utf8'))
      let doc = raw && typeof raw.data === 'object' && raw.data && !raw.kind ? raw.data : raw
      let id = String(doc.id ?? path.basename(file, '.json'))
      if (!VALID_ID.test(id)) throw new ActionError(`bad id ${JSON.stringify(id)}`)
      if (seen.has(id)) outcome = 'duplicate, skipped'
      else {
        let row: Row = table.rows.find((r) => r.key === doc.key) ?? syntheticRow(doc)
        let form = new FormData()
        for (let k of ['kind', 'reason', 'stateReason', 'priority', 'text']) if (doc[k] != null) form.set(k, String(doc[k]))
        let action = buildAction(form, row)
        action.id = id
        if (typeof doc.at === 'string' && !Number.isNaN(Date.parse(doc.at))) action.at = new Date(doc.at).toISOString()
        await appendAction(action)
        state.ingested.push(id)
        seen.add(id)
      }
    } catch (error: any) {
      outcome = `rejected: ${error?.message ?? error}`
      let id = path.basename(file, '.json')
      if (VALID_ID.test(id) && !seen.has(id)) {
        state.rejected[id] = { at: new Date().toISOString(), note: String(error?.message ?? error).slice(0, 300) }
      }
    }
    await fsp.mkdir(inboxDoneDir, { recursive: true })
    await fsp.rename(file, path.join(inboxDoneDir, path.basename(file)))
    log(`inbox ${path.basename(file)}: ${outcome}`)
  }
  await saveState(state)
}

/** For an action on a row that has since left the table: rebuild its refs from the document. */
function syntheticRow(doc: any): Row {
  let repo = typeof doc.repo === 'string' ? doc.repo.replace(/^discobox-ai\//, '') : 'discobox'
  let ref = (n: unknown) => (Number.isInteger(n) ? `${repo} ${n}` : '-')
  return {
    key: String(doc.key ?? '-'),
    item: '-',
    agent: '-',
    issue: ref(doc.issue),
    pr: ref(doc.pr),
    doing: '-',
    yourMove: '–',
    why: '-',
  }
}

async function main() {
  for (let d of [docsDir, outboxDir, inboxDir]) await fsp.mkdir(d, { recursive: true })
  let state = await loadState()
  log(`sync: table ${tablePath}, state ${syncDir}${ONCE ? ' (once)' : ''}${DRY ? ' (dry run)' : ''}`)
  await ingestInbox(state)
  await cycle(state)
  if (ONCE) return

  for (let file of [tablePath, actionsDonePath]) {
    fs.watchFile(file, { interval: 1000 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.ino !== prev.ino || cur.size !== prev.size) void cycle(state)
    })
  }
  setInterval(() => void cycle(state), CYCLE_MS)
  setInterval(() => void ingestInbox(state).catch((e) => log('inbox failed:', e)), INBOX_POLL_MS)
  for (let sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0))
}

await main()
