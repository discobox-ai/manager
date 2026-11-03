import { on, type Handle } from 'remix/component'

import type { DeclChangeDoc, DiffDoc, DiffFileDoc, DiffPartDoc } from '../shared/docs.ts'
import { githubOrg } from '../shared/refs.ts'
import { diffSequence } from '../shared/sequence.ts'
import { routes } from '../routes.ts'
import { href } from '../routing.ts'
import type { DiffPartState, DiffState, Store } from '../store/index.ts'
import { Markdown } from './html.tsx'
import { Page } from './shell.tsx'

export type Tab = 'contract' | 'docs' | 'implementation' | 'lines'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'contract', label: 'Contract', hint: 'Declarations added, removed, or with a changed signature' },
  { id: 'docs', label: 'Docs', hint: 'Markdown files, rendered, with their changes inline' },
  { id: 'implementation', label: 'Implementation', hint: 'The contract, plus every declaration whose body changed' },
  { id: 'lines', label: 'Lines', hint: 'Every changed line, as GitHub shows it' },
]

export function isTab(value: string | null): value is Tab {
  return TABS.some((t) => t.id === value)
}

/** The diff viewer for one PR (id: "vm~pull~38"), on the tab in the URL. */
export function DiffPage(handle: Handle<{ id: string; tab: Tab; store: Store }>) {
  let state: DiffState = { status: 'loading' }
  let tab: Tab = handle.props.tab
  let exportedOnly = false
  let unsubscribe = handle.props.store.diff(handle.props.id, (next) => {
    state = next
    handle.update()
  })
  handle.signal.addEventListener('abort', () => unsubscribe())

  function choose(next: Tab) {
    tab = next
    // Keep the tab in the address, so a reload or a shared link opens it, without a new route.
    try {
      let url = new URL(location.href)
      if (handle.props.store.host === 'artifact') {
        let [path, query = ''] = url.hash.slice(1).split('?')
        let params = new URLSearchParams(query)
        params.set('tab', next)
        url.hash = `${path}?${params}`
      } else url.searchParams.set('tab', next)
      history.replaceState(history.state, '', url)
    } catch {
      // The viewer's frame may not allow it; the tab still changes.
    }
    handle.update()
  }

  return () => {
    let [repo, , n] = handle.props.id.split('~')
    let label = `${repo === 'discobox' ? '' : repo + ' '}#${n}`
    let doc = state.status === 'ready' && !('error' in state.doc) ? state.doc : null
    let counts = doc ? tabCounts(doc) : null
    return (
      <Page title={`Diff ${label}${doc ? ` · ${doc.title}` : ''}`}>
        <nav class="crumbs" aria-label="Breadcrumbs">
          <a href={href(routes.home.href())}>Manager status</a>
          <span>/</span>
          <span>PR {label}</span>
          {doc ? (
            <span class="at">
              <span class="mono">{doc.baseSha.slice(0, 8)}</span>…<span class="mono">{doc.headSha.slice(0, 8)}</span> ·{' '}
              <a href={`${doc.url}/files`} target="_blank" rel="noopener noreferrer">
                on GitHub
              </a>
            </span>
          ) : null}
        </nav>
        <header class="diff-head">
          <h1>{doc ? doc.title : `PR ${label}`}</h1>
          <div class="tabs" role="tablist" aria-label="Diff views">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="diff-panel"
                title={t.hint}
                mix={on('click', () => choose(t.id))}
              >
                {t.label}
                {counts ? <span class="count">{counts[t.id]}</span> : null}
              </button>
            ))}
          </div>
        </header>
        <div id="diff-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} class="diff-panel">
          {state.status === 'loading' ? (
            <p class="empty">Reading the PR’s diff…</p>
          ) : state.status === 'missing' ? (
            <p class="empty">No diff for PR {label} yet. It arrives with the next sync, while the PR is open.</p>
          ) : 'error' in state.doc ? (
            <p class="error">Couldn’t build the diff: {state.doc.error}</p>
          ) : tab === 'contract' || tab === 'implementation' ? (
            <DeclsTab
              id={handle.props.id}
              doc={state.doc}
              store={handle.props.store}
              bodies={tab === 'implementation'}
              exportedOnly={exportedOnly}
              onExportedOnly={(v: boolean) => {
                exportedOnly = v
                handle.update()
              }}
            />
          ) : tab === 'docs' ? (
            <DocsTab id={handle.props.id} doc={state.doc} store={handle.props.store} />
          ) : (
            <LinesTab id={handle.props.id} doc={state.doc} store={handle.props.store} />
          )}
        </div>
      </Page>
    )
  }
}

function inContract(c: DeclChangeDoc): boolean {
  return c.status === 'added' || c.status === 'removed' || c.signatureChanged
}

function tabCounts(doc: DiffDoc): Record<Tab, number> {
  let decls = doc.files.flatMap((f) => f.decls ?? [])
  return {
    contract: decls.filter(inContract).length,
    implementation: decls.length,
    docs: doc.files.filter((f) => f.kind === 'docs').length,
    lines: doc.files.length,
  }
}

function blobHref(doc: DiffDoc, file: string, line?: number, sha = doc.headSha): string {
  return `https://github.com/${githubOrg}/${doc.repo}/blob/${sha}/${file}${line ? `#L${line}` : ''}`
}

// --- Contract and Implementation ----------------------------------------------------------

const STATUS_LABEL: Record<DeclChangeDoc['status'], string> = {
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  moved: 'moved',
}

function DeclsTab(
  handle: Handle<{
    id: string
    doc: DiffDoc
    store: Store
    bodies: boolean
    exportedOnly: boolean
    onExportedOnly: (value: boolean) => void
  }>,
) {
  return () => {
    let { doc, bodies, exportedOnly, id, store } = handle.props
    let pick = (c: DeclChangeDoc) => (bodies || inContract(c)) && (!exportedOnly || c.exported)
    let files = doc.files
      .map((f, index) => ({ file: f, index, changes: (f.decls ?? []).filter(pick) }))
      .filter((f) => f.changes.length)
    let all = files.flatMap((f) => f.changes)
    let unparsed = doc.files.filter((f) => f.kind === 'code' && !f.decls)
    let lineOnly = doc.files.filter((f) => f.kind === 'other')
    let tally = (s: DeclChangeDoc['status']) => all.filter((c) => c.status === s).length
    let bodyOnly = all.filter((c) => c.status !== 'added' && c.status !== 'removed' && !c.signatureChanged).length
    return (
      <>
        <div class="diff-summary">
          <span>
            {all.length ? (
              <>
                <strong>{all.length}</strong> {all.length === 1 ? 'declaration' : 'declarations'} in {files.length}{' '}
                {files.length === 1 ? 'file' : 'files'}:{' '}
                {[
                  tally('added') && `${tally('added')} added`,
                  tally('removed') && `${tally('removed')} removed`,
                  all.filter((c) => c.signatureChanged && c.status !== 'added' && c.status !== 'removed').length &&
                    `${all.filter((c) => c.signatureChanged && c.status !== 'added' && c.status !== 'removed').length} with a new signature`,
                  bodies && bodyOnly && `${bodyOnly} with only a new body`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </>
            ) : bodies ? (
              'No declarations changed.'
            ) : (
              'No signatures changed: callers see the same contract.'
            )}
          </span>
          <label class="toggle">
            <input
              type="checkbox"
              id="exported-only"
              checked={exportedOnly}
              mix={on('change', (event) => handle.props.onExportedOnly((event.currentTarget as HTMLInputElement).checked))}
            />{' '}
            Exported only
          </label>
        </div>
        {files.map(({ file, index, changes }) => (
          <section key={file.filename} class="diff-file">
            <FileHeader doc={doc} file={file} />
            <ul class="decls">
              {changes.map((c) => (
                <DeclItem key={c.key} id={id} index={index} doc={doc} file={file} change={c} store={store} bodies={bodies} />
              ))}
            </ul>
          </section>
        ))}
        {unparsed.length || lineOnly.length ? (
          <div class="diff-notes">
            {unparsed.length ? (
              <p>
                <strong>Not read for declarations:</strong>{' '}
                {unparsed.map((f, i) => (
                  <span key={f.filename}>
                    {i ? ', ' : ''}
                    <span class="mono">{f.filename}</span> ({f.generated ? 'generated' : (f.note ?? 'not parsed').replace(/^Not parsed: /, '')})
                  </span>
                ))}
              </p>
            ) : null}
            {lineOnly.length ? (
              <p>
                <strong>Under Lines only</strong> ({lineOnly.length}, no parser for their language):{' '}
                {lineOnly.map((f, i) => (
                  <span key={f.filename}>
                    {i ? ', ' : ''}
                    <span class="mono">{f.filename}</span>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
      </>
    )
  }
}

function FileHeader(handle: Handle<{ doc: DiffDoc; file: DiffFileDoc }>) {
  return () => {
    let { doc, file } = handle.props
    return (
      <h2 class="file-head">
        <a class="mono" href={blobHref(doc, file.filename, undefined, file.status === 'removed' ? doc.baseSha : doc.headSha)} target="_blank" rel="noopener noreferrer">
          {file.filename}
        </a>
        {file.previousFilename ? <span class="sub"> from {file.previousFilename}</span> : null}
        {file.status !== 'modified' ? <span class={`fstatus ${file.status}`}>{file.status}</span> : null}
        <span class="n">
          <span class="plus">+{file.additions}</span> <span class="minus">−{file.deletions}</span>
        </span>
      </h2>
    )
  }
}

function DeclItem(
  handle: Handle<{ id: string; index: number; doc: DiffDoc; file: DiffFileDoc; change: DeclChangeDoc; store: Store; bodies: boolean }>,
) {
  let showBody = false
  return () => {
    let { change: c, doc, file, id, index, store, bodies } = handle.props
    let name = c.container ? `${c.container}.${c.name}` : c.name
    let badge = c.status === 'changed' && !c.signatureChanged ? 'body' : STATUS_LABEL[c.status]
    let line = c.status === 'removed' ? blobHref(doc, file.filename, c.line, doc.baseSha) : blobHref(doc, file.filename, c.line)
    return (
      <li class={`decl ${badge}`}>
        <div class="decl-head">
          <span class={`badge ${badge}`}>{badge}</span>
          <span class="kind">{c.kind}</span>
          <strong class="mono">{name}</strong>
          {c.exported ? null : <span class="internal">internal</span>}
          {c.movedFrom ? <span class="sub">from {c.movedFrom}</span> : null}
          {c.status !== 'added' && c.status !== 'removed' && c.signatureChanged && c.bodyChanged ? <span class="sub">and its body</span> : null}
          <a class="line" href={line} target="_blank" rel="noopener noreferrer">
            L{c.line}
          </a>
        </div>
        <Signature change={c} />
        {bodies && c.hasBodyPatch ? (
          <div class="body-diff">
            <button type="button" class="link" aria-expanded={showBody} mix={on('click', () => {
                showBody = !showBody
                handle.update()
              })}>
              {showBody ? 'Hide' : 'Show'} the body’s diff
            </button>
            {showBody ? <Part id={id} index={index} store={store} view="body" declKey={c.key} /> : null}
          </div>
        ) : null}
      </li>
    )
  }
}

const WORD = /[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu

/** A declaration's signature: as it is now, or before → after merged word by word. */
function Signature(handle: Handle<{ change: DeclChangeDoc }>) {
  return () => {
    let c = handle.props.change
    if (c.status === 'added') return <pre class="sig ins-all">{c.after}</pre>
    if (c.status === 'removed') return <pre class="sig del-all">{c.before}</pre>
    let before = c.before ?? ''
    let after = c.after ?? ''
    if (!c.signatureChanged || before === after) return <pre class="sig">{after}</pre>
    let a = before.match(WORD) ?? []
    let b = after.match(WORD) ?? []
    return (
      <pre class="sig">
        {diffSequence(a, b).map((r, i) =>
          r.op === 'equal' ? (
            b.slice(r.bStart, r.bEnd).join('')
          ) : r.op === 'delete' ? (
            <del key={i}>{a.slice(r.aStart, r.aEnd).join('')}</del>
          ) : (
            <ins key={i}>{b.slice(r.bStart, r.bEnd).join('')}</ins>
          ),
        )}
      </pre>
    )
  }
}

// --- Docs and Lines -----------------------------------------------------------------------

function DocsTab(handle: Handle<{ id: string; doc: DiffDoc; store: Store }>) {
  return () => {
    let { doc, id, store } = handle.props
    let files = doc.files.map((file, index) => ({ file, index })).filter(({ file }) => file.kind === 'docs')
    if (!files.length) return <p class="empty">No markdown files changed.</p>
    return (
      <>
        <div class="diff-summary">
          <span>
            <strong>{files.length}</strong> markdown {files.length === 1 ? 'file' : 'files'}, as they read now.{' '}
            <ins>Added</ins> and <del>removed</del> words are marked; unchanged stretches are folded.
          </span>
        </div>
        {files.map(({ file, index }) => (
          <section key={file.filename} class="diff-file">
            <FileHeader doc={doc} file={file} />
            {file.note ? <p class="error">{file.note}</p> : file.hasPart ? <Part id={id} index={index} store={store} view="docs" /> : null}
          </section>
        ))}
      </>
    )
  }
}

/** Files with more changed lines than this start folded, and load when opened. */
const OPEN_LINES = 400

function LinesTab(handle: Handle<{ id: string; doc: DiffDoc; store: Store }>) {
  let opened = new Map<string, boolean>()
  return () => {
    let { doc, id, store } = handle.props
    let total = doc.files.reduce((n, f) => n + f.additions + f.deletions, 0)
    return (
      <>
        <div class="diff-summary">
          <span>
            <strong>{doc.files.length}</strong> {doc.files.length === 1 ? 'file' : 'files'}
            {doc.filesTruncated ? ' (GitHub lists only the first 300)' : ''}, {total} changed lines.
          </span>
        </div>
        {doc.files.map((file, index) => {
          let open = opened.get(file.filename) ?? (file.additions + file.deletions <= OPEN_LINES && !file.generated)
          return (
            <section key={file.filename} class="diff-file">
              <div class="file-toggle">
                <button
                  type="button"
                  class="link"
                  aria-expanded={open}
                  aria-label={`${open ? 'Fold' : 'Show'} ${file.filename}`}
                  mix={on('click', () => {
                    opened.set(file.filename, !open)
                    handle.update()
                  })}
                >
                  {open ? '▾' : '▸'}
                </button>
                <FileHeader doc={doc} file={file} />
              </div>
              {!open ? (
                <p class="empty folded">
                  {file.generated ? 'Generated. ' : ''}
                  {file.additions + file.deletions} changed lines, folded.
                </p>
              ) : file.hasPart ? (
                <Part id={id} index={index} store={store} view="lines" />
              ) : (
                <p class="empty">No line diff (a binary file, or too large for GitHub to show).</p>
              )}
            </section>
          )
        })}
      </>
    )
  }
}

/** One file's part, read when it's first shown. */
function Part(handle: Handle<{ id: string; index: number; store: Store; view: 'lines' | 'docs' | 'body'; declKey?: string }>) {
  let state: DiffPartState = { status: 'loading' }
  let unsubscribe = handle.props.store.diffPart(handle.props.id, handle.props.index, (next) => {
    state = next
    handle.update()
  })
  handle.signal.addEventListener('abort', () => unsubscribe())
  return () => {
    let { view, declKey } = handle.props
    if (state.status === 'loading') return <p class="empty">Loading…</p>
    if (state.status === 'missing') return <p class="empty">Not here yet; it arrives with the next sync.</p>
    if ('error' in state.doc) return <p class="error">Couldn’t load it: {state.doc.error}</p>
    let part: DiffPartDoc = state.doc
    let cut = part.truncated ? <p class="empty">Cut short to fit; the rest is on GitHub.</p> : null
    if (view === 'docs') {
      return (
        <>
          <div class="sheet doc-diff">
            <Markdown html={part.docHtml ?? ''} />
          </div>
          {cut}
        </>
      )
    }
    let patch = view === 'body' ? part.bodyPatches?.[declKey ?? ''] : part.patch
    if (!patch) return <p class="empty">No line diff for this.</p>
    return (
      <>
        <PatchTable patch={patch} />
        {cut}
      </>
    )
  }
}

interface PatchRow {
  kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'
  old?: number
  new?: number
  text: string
}

function patchRows(patch: string): PatchRow[] {
  let rows: PatchRow[] = []
  let oldLine = 0
  let newLine = 0
  for (let line of patch.split('\n')) {
    let hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      rows.push({ kind: 'hunk', text: line })
    } else if (line.startsWith('+')) rows.push({ kind: 'add', new: newLine++, text: line.slice(1) })
    else if (line.startsWith('-')) rows.push({ kind: 'del', old: oldLine++, text: line.slice(1) })
    else if (line.startsWith('\\') || line.startsWith('…')) rows.push({ kind: 'note', text: line })
    else rows.push({ kind: 'ctx', old: oldLine++, new: newLine++, text: line.slice(1) })
  }
  return rows
}

/** A unified diff the way GitHub shows it: old and new line numbers, then the line. */
function PatchTable(handle: Handle<{ patch: string }>) {
  return () => (
    <div class="patch-wrap">
      <table class="patch-table">
        <tbody>
          {patchRows(handle.props.patch).map((r, i) =>
            r.kind === 'hunk' || r.kind === 'note' ? (
              <tr key={i} class={r.kind}>
                <td class="ln" />
                <td class="ln" />
                <td class="code">{r.text}</td>
              </tr>
            ) : (
              <tr key={i} class={r.kind}>
                <td class="ln">{r.old ?? ''}</td>
                <td class="ln">{r.new ?? ''}</td>
                <td class="code">
                  <span class="mark">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>
                  {r.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
