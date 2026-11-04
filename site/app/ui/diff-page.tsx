import { on, type Handle } from 'remix/component'

import type { DeclChangeDoc, DiffDoc, DiffFileDoc, DiffPartDoc } from '../shared/docs.ts'
import { githubOrg } from '../shared/refs.ts'
import { diffSequence } from '../shared/sequence.ts'
import { routes } from '../routes.ts'
import { href } from '../routing.ts'
import type { DiffPartState, DiffState, Store } from '../store/index.ts'
import { highlight, langOf, runs, type Classes } from './highlight.ts'
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
            <p class="empty">Reading the PR’s diff… The first view of a PR reads its files from GitHub, which can take several seconds; after that it’s instant.</p>
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
              {changes.map((c) => (
                <DeclItem key={c.key} id={id} index={index} doc={doc} file={file} change={c} store={store} bodies={bodies} />
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

/** One declaration: its code, colored by what changed; on Implementation, its body's diff below. */
function DeclItem(
  handle: Handle<{ id: string; index: number; doc: DiffDoc; file: DiffFileDoc; change: DeclChangeDoc; store: Store; bodies: boolean }>,
) {
  return () => {
    let { change: c, id, index, store, bodies } = handle.props
    return (
      <div class={`decl ${c.status}`} title={`${c.kind} ${c.container ? c.container + '.' : ''}${c.name}${c.movedFrom ? `, moved from ${c.movedFrom}` : ''}`}>
        <Signature change={c} language={handle.props.file.language} />
        {bodies && c.hasBodyPatch ? <Part id={id} index={index} store={store} view="body" declKey={c.key} language={handle.props.file.language} /> : null}
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
          let open = opened.get(file.filename) ?? (file.additions + file.deletions <= OPEN_LINES && !file.generated && !file.test)
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
                  {file.generated ? 'Generated. ' : file.test ? 'Test code. ' : ''}
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
function Part(handle: Handle<{ id: string; index: number; store: Store; view: 'lines' | 'docs' | 'body'; declKey?: string; language?: string }>) {
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
    if (view === 'body') return <CodeDiff patch={patch} language={handle.props.language} />
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

/**
 * A body's diff as code: added lines in shades of green, removed in red, the rest grey, and "…"
 * between hunks. Each side of a hunk (context with removed lines, context with added) is
 * highlighted as one text, so a string or comment over several lines is colored right.
 */
function CodeDiff(handle: Handle<{ patch: string; language?: string }>) {
  return () => {
    let rows = patchRows(handle.props.patch)
    let lang = langOf(handle.props.language)
    let lineClasses: (Classes | null)[] = rows.map(() => null)
    let side = (keep: (k: string) => boolean, idx: number[]) => {
      let text = idx.map((i) => rows[i].text).join('\n')
      let classes = highlight(text, lang)
      let at = 0
      for (let i of idx) {
        lineClasses[i] = classes.slice(at, at + rows[i].text.length)
        at += rows[i].text.length + 1
      }
    }
    // Hunk by hunk: the old side, then the new (a context line belongs to both; they agree).
    let hunk: number[] = []
    let flush = () => {
      side((k) => k !== 'add', hunk.filter((i) => rows[i].kind !== 'add'))
      side((k) => k !== 'del', hunk.filter((i) => rows[i].kind !== 'del'))
      hunk = []
    }
    rows.forEach((r, i) => {
      if (r.kind === 'hunk') flush()
      else if (r.kind !== 'note') hunk.push(i)
    })
    flush()
    return (
      <pre class="code-diff">
        {rows.map((r, i) =>
          r.kind === 'hunk' ? (
            i === 0 ? null : (
              <span key={i} class="gap">
                {'…\n'}
              </span>
            )
          ) : r.kind === 'note' ? null : (
            <span key={i} class={r.kind}>
              {Code({ text: r.text, classes: lineClasses[i] ?? [], from: 0, to: r.text.length })}
              {'\n'}
            </span>
          ),
        )}
      </pre>
    )
  }
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
