import { on, type Handle } from 'remix/component'

import type { DeclChangeDoc, DiffDoc, DiffFileDoc, DiffPartDoc, TrimmedRow } from '../shared/docs.ts'
import { githubOrg } from '../shared/refs.ts'
import { diffSequence } from '../shared/sequence.ts'
import { routes } from '../routes.ts'
import { href } from '../routing.ts'
import type { DiffPartState, DiffState, Store } from '../store/index.ts'
import { highlight, langOf, runs, type Classes } from './highlight.ts'
import { Markdown } from './html.tsx'
import { Page } from './shell.tsx'

export type Tab = 'summary' | 'contract' | 'docs' | 'trimmed' | 'full'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'summary', label: 'Summary', hint: 'The changed files, with lines added and removed' },
  { id: 'contract', label: 'Contract', hint: 'Declarations added, removed, or with a changed signature' },
  { id: 'docs', label: 'Docs', hint: 'Markdown files, rendered, with their changes inline' },
  { id: 'trimmed', label: 'Trimmed', hint: 'The code only: no text files, tests or generated files, and no comment changes' },
  { id: 'full', label: 'Full', hint: 'Every changed line of every file, as GitHub shows it' },
]

// Links from before the tabs were renamed.
const OLD_TABS: Record<string, Tab> = { implementation: 'trimmed', lines: 'full' }

export function tabFrom(value: string | null): Tab {
  if (value && OLD_TABS[value]) return OLD_TABS[value]
  return TABS.find((t) => t.id === value)?.id ?? 'summary'
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
            <p class="empty">Reading the PR’s diff… The first view of a PR reads its files from GitHub, which can take several seconds; after that it’s instant.</p>
          ) : state.status === 'missing' ? (
            <p class="empty">No diff for PR {label} yet. It arrives with the next sync, while the PR is open.</p>
          ) : 'error' in state.doc ? (
            <p class="error">Couldn’t build the diff: {state.doc.error}</p>
          ) : tab === 'summary' ? (
            <SummaryTab doc={state.doc} />
          ) : tab === 'contract' ? (
            <DeclsTab
              id={handle.props.id}
              doc={state.doc}
              store={handle.props.store}
              bodies={false}
              exportedOnly={exportedOnly}
              onExportedOnly={(v: boolean) => {
                exportedOnly = v
                handle.update()
              }}
            />
          ) : tab === 'docs' ? (
            <DocsTab id={handle.props.id} doc={state.doc} store={handle.props.store} />
          ) : (
            <LinesTab key={tab} id={handle.props.id} doc={state.doc} store={handle.props.store} trimmed={tab === 'trimmed'} />
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
    summary: doc.files.length,
    contract: decls.filter(inContract).length,
    docs: doc.files.filter((f) => f.kind === 'docs').length,
    trimmed: doc.files.filter((f) => f.trimmed).length,
    full: doc.files.length,
  }
}

/** The diffstat: every changed file with its lines added and removed, and a bar to scale. */
function SummaryTab(handle: Handle<{ doc: DiffDoc }>) {
  return () => {
    let { doc } = handle.props
    let most = Math.max(1, ...doc.files.map((f) => f.additions + f.deletions))
    let adds = doc.files.reduce((n, f) => n + f.additions, 0)
    let dels = doc.files.reduce((n, f) => n + f.deletions, 0)
    let width = 14
    return (
      <>
        <table class="diffstat">
          <tbody>
            {doc.files.map((f) => {
              let total = f.additions + f.deletions
              let cells = total ? Math.max(1, Math.round((total / most) * width)) : 0
              let plus = total ? Math.round((f.additions / total) * cells) : 0
              return (
                <tr key={f.filename} class={f.test || f.generated ? 'quiet' : undefined}>
                  <td class="name">
                    <a href={blobHref(doc, f.filename, undefined, f.status === 'removed' ? doc.baseSha : doc.headSha)} target="_blank" rel="noopener noreferrer">
                      {f.filename}
                    </a>
                    {f.status !== 'modified' ? <span class={`fstatus ${f.status}`}>{f.status}</span> : null}
                  </td>
                  <td class="num plus">+{f.additions}</td>
                  <td class="num minus">−{f.deletions}</td>
                  <td class="bar" aria-hidden="true">
                    <span class="plus">{'+'.repeat(plus)}</span>
                    <span class="minus">{'−'.repeat(cells - plus)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p class="diffstat-total">
          {doc.files.length} {doc.files.length === 1 ? 'file' : 'files'} changed{doc.filesTruncated ? ' (GitHub lists only the first 300)' : ''},{' '}
          <span class="plus">{adds} insertions(+)</span>, <span class="minus">{dels} deletions(−)</span>
        </p>
      </>
    )
  }
}

function blobHref(doc: DiffDoc, file: string, line?: number, sha = doc.headSha): string {
  return `https://github.com/${githubOrg}/${doc.repo}/blob/${sha}/${file}${line ? `#L${line}` : ''}`
}

// --- Contract and Implementation ----------------------------------------------------------
// Only the code: each changed declaration as written (no comments), by file, with what was added in
// green and what was removed in red. Implementation adds each changed body's diff under it.

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
    let skipped = doc.files.filter((f) => f.kind !== 'docs' && !f.decls && !f.test).length
    let tests = doc.files.filter((f) => f.test).length
    return (
      <>
        <div class="diff-summary">
          {files.length ? null : <span>{bodies ? 'No declarations changed.' : 'No signatures changed.'}</span>}
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
            <div class="decls">
              {changes.map((c, i) => (
                <DeclItem
                  key={c.key}
                  id={id}
                  index={index}
                  doc={doc}
                  file={file}
                  change={c}
                  store={store}
                  bodies={bodies}
                  startsGroup={i > 0 && leadingKeyword(c) !== leadingKeyword(changes[i - 1])}
                />
              ))}
            </div>
          </section>
        ))}
        {skipped || tests ? (
          <p class="diff-notes">
            {[
              tests ? `${tests} test ${tests === 1 ? 'file' : 'files'} left out` : '',
              skipped ? `${skipped} ${skipped === 1 ? 'file' : 'files'} not parsed (generated, or no parser for the language)` : '',
            ]
              .filter(Boolean)
              .join('; ')}
            ; see Lines.
          </p>
        ) : null}
      </>
    )
  }
}

function FileHeader(handle: Handle<{ doc: DiffDoc; file: DiffFileDoc; counts?: { additions: number; deletions: number } }>) {
  return () => {
    let { doc, file, counts } = handle.props
    return (
      <h2 class="file-head">
        <a class="mono" href={blobHref(doc, file.filename, undefined, file.status === 'removed' ? doc.baseSha : doc.headSha)} target="_blank" rel="noopener noreferrer">
          {file.filename}
        </a>
        {file.previousFilename ? <span class="sub"> from {file.previousFilename}</span> : null}
        {file.status !== 'modified' ? <span class={`fstatus ${file.status}`}>{file.status}</span> : null}
        <span class="n">
          <span class="plus">+{(counts ?? file).additions}</span> <span class="minus">−{(counts ?? file).deletions}</span>
        </span>
      </h2>
    )
  }
}

/**
 * The keyword a declaration starts with (func, type, const, var, class, def…), past modifiers
 * and decorators: declarations in a row with the same one are set together, and a new one starts
 * a new group after a blank line.
 */
function leadingKeyword(c: DeclChangeDoc): string {
  let text = (c.after ?? c.before ?? '').split('\n').find((l) => !l.trim().startsWith('@')) ?? ''
  let words = text.trim().split(/[\s(]+/)
  while (words.length > 1 && /^(export|default|async|declare|public|private|protected|static|readonly|abstract)$/.test(words[0])) words.shift()
  return words[0] ?? ''
}

/** One declaration: its code, colored by what changed; on Implementation, its body's diff below. */
function DeclItem(
  handle: Handle<{
    id: string
    index: number
    doc: DiffDoc
    file: DiffFileDoc
    change: DeclChangeDoc
    store: Store
    bodies: boolean
    startsGroup?: boolean
  }>,
) {
  return () => {
    let { change: c, id, index, store, bodies, startsGroup } = handle.props
    return (
      <div class={`decl ${c.status}${startsGroup ? ' group-start' : ''}`} title={`${c.kind} ${c.container ? c.container + '.' : ''}${c.name}${c.movedFrom ? `, moved from ${c.movedFrom}` : ''}`}>
        <Signature change={c} language={handle.props.file.language} />
      </div>
    )
  }
}

const WORD = /[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu

/** [from, to) of a text as highlighted spans, inside an ins, del or nothing. */
function Code(props: { text: string; classes: Classes; from: number; to: number }) {
  return runs(props.text, props.classes, props.from, props.to).map((r, i) => (r.cls ? <span key={i} class={`tk-${r.cls}`}>{r.text}</span> : r.text))
}

/**
 * A declaration's signature, highlighted: as it is now, or before → after merged word by word,
 * added words in shades of green, removed in shades of red.
 */
function Signature(handle: Handle<{ change: DeclChangeDoc; language?: string }>) {
  return () => {
    let { change: c, language } = handle.props
    let lang = langOf(language)
    if (c.status === 'added' || c.status === 'removed') {
      let text = (c.status === 'added' ? c.after : c.before) ?? ''
      return <pre class={`sig ${c.status === 'added' ? 'ins-all' : 'del-all'}`}>{Code({ text, classes: highlight(text, lang), from: 0, to: text.length })}</pre>
    }
    let before = c.before ?? ''
    let after = c.after ?? ''
    let beforeClasses = highlight(before, lang)
    let afterClasses = highlight(after, lang)
    if (!c.signatureChanged || before === after) return <pre class="sig">{Code({ text: after, classes: afterClasses, from: 0, to: after.length })}</pre>
    let a = before.match(WORD) ?? []
    let b = after.match(WORD) ?? []
    // Character offsets of each word, to cut the highlighted texts along the diff's runs.
    let offsets = (words: string[]) => words.reduce<number[]>((acc, w) => (acc.push(acc[acc.length - 1] + w.length), acc), [0])
    let ao = offsets(a)
    let bo = offsets(b)
    return (
      <pre class="sig">
        {diffSequence(a, b).map((r, i) =>
          r.op === 'equal' ? (
            <span key={i}>{Code({ text: after, classes: afterClasses, from: bo[r.bStart], to: bo[r.bEnd] })}</span>
          ) : r.op === 'delete' ? (
            <del key={i}>{Code({ text: before, classes: beforeClasses, from: ao[r.aStart], to: ao[r.aEnd] })}</del>
          ) : (
            <ins key={i}>{Code({ text: after, classes: afterClasses, from: bo[r.bStart], to: bo[r.bEnd] })}</ins>
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

/**
 * Full: every file's diff as GitHub has it. Trimmed: only code (parsed source files, not tests or
 * generated ones), compared with comments and blank lines left out, so only code changes show.
 */
function LinesTab(handle: Handle<{ id: string; doc: DiffDoc; store: Store; trimmed: boolean }>) {
  let opened = new Map<string, boolean>()
  return () => {
    let { doc, id, store, trimmed } = handle.props
    let files = doc.files.map((file, index) => ({ file, index })).filter(({ file }) => !trimmed || file.trimmed)
    let size = (f: DiffFileDoc) => (trimmed && f.trimmed ? f.trimmed.additions + f.trimmed.deletions : f.additions + f.deletions)
    let total = files.reduce((n, { file }) => n + size(file), 0)
    let left = doc.files.length - files.length
    return (
      <>
        <div class="diff-summary">
          <span>
            <strong>{files.length}</strong> {files.length === 1 ? 'file' : 'files'}
            {!trimmed && doc.filesTruncated ? ' (GitHub lists only the first 300)' : ''}, {total} changed {trimmed ? 'lines of code' : 'lines'}.
            {trimmed && left ? ` ${left} more (text, tests, generated, or only comments changed) under Full.` : ''}
          </span>
        </div>
        {files.map(({ file, index }) => {
          let open = opened.get(file.filename) ?? (size(file) <= OPEN_LINES && (trimmed || (!file.generated && !file.test)))
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
                <FileHeader doc={doc} file={file} counts={trimmed ? file.trimmed : undefined} />
              </div>
              {!open ? (
                <p class="empty folded">
                  {file.generated ? 'Generated. ' : file.test ? 'Test code. ' : ''}
                  {size(file)} changed lines, folded.
                </p>
              ) : file.hasPart ? (
                <Part id={id} index={index} store={store} view={trimmed ? 'trimmed' : 'lines'} language={file.language} />
              ) : (
                <p class="empty">No line diff (a binary file, or too large for GitHub to show).</p>
              )}
            </section>
          )
        })}
        {!files.length ? <p class="empty">{trimmed ? 'No code changed, only text, tests or comments.' : 'No files.'}</p> : null}
      </>
    )
  }
}

/** One file's part, read when it's first shown. */
function Part(handle: Handle<{ id: string; index: number; store: Store; view: 'lines' | 'docs' | 'trimmed'; language?: string }>) {
  let state: DiffPartState = { status: 'loading' }
  let unsubscribe = handle.props.store.diffPart(handle.props.id, handle.props.index, (next) => {
    state = next
    handle.update()
  })
  handle.signal.addEventListener('abort', () => unsubscribe())
  return () => {
    let { view, language } = handle.props
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
    let rows = view === 'trimmed' ? trimmedRows(part.trimmed ?? []) : part.patch ? patchRows(part.patch) : null
    if (!rows?.length) return <p class="empty">No line diff for this.</p>
    return (
      <>
        <PatchTable rows={rows} language={language} />
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

/** The trimmed rows (server/diff trimmedDiff) as patch rows. */
function trimmedRows(rows: TrimmedRow[]): PatchRow[] {
  return rows.map((r) =>
    r.k === '@'
      ? { kind: r.t ? 'note' : 'hunk', text: r.t ?? '' }
      : { kind: r.k === '+' ? 'add' : r.k === '-' ? 'del' : 'ctx', old: r.o, new: r.n, text: r.t ?? '' },
  )
}

/**
 * Highlighting for each row: each side of a hunk (context with removed lines, context with added)
 * is highlighted as one text, so a string over several lines is colored right.
 */
function rowClasses(rows: PatchRow[], language: string | undefined): (Classes | null)[] {
  let lang = langOf(language)
  let out: (Classes | null)[] = rows.map(() => null)
  if (!lang) return out
  let side = (idx: number[]) => {
    let classes = highlight(idx.map((i) => rows[i].text).join('\n'), lang)
    let at = 0
    for (let i of idx) {
      out[i] = classes.slice(at, at + rows[i].text.length)
      at += rows[i].text.length + 1
    }
  }
  let hunk: number[] = []
  let flush = () => {
    side(hunk.filter((i) => rows[i].kind !== 'add'))
    side(hunk.filter((i) => rows[i].kind !== 'del'))
    hunk = []
  }
  rows.forEach((r, i) => {
    if (r.kind === 'hunk' || r.kind === 'note') flush()
    else hunk.push(i)
  })
  flush()
  return out
}

/** A unified diff the way GitHub shows it: old and new line numbers, then the line. */
function PatchTable(handle: Handle<{ rows: PatchRow[]; language?: string }>) {
  return () => {
    let { rows, language } = handle.props
    let classes = rowClasses(rows, language)
    return (
    <div class="patch-wrap">
      <table class="patch-table">
        <tbody>
          {rows.map((r, i) =>
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
                  {classes[i] ? Code({ text: r.text, classes: classes[i]!, from: 0, to: r.text.length }) : r.text}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
    )
  }
}
