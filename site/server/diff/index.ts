// A PR's diff document (app/shared/docs.ts DiffDoc): per file, the declarations whose signature or
// body changed (tree-sitter, server/diff/declarations.ts), markdown rendered with its changes
// inline, and GitHub's line patch. Built from the merge base and the head, like GitHub's own diff.
import type { DeclChangeDoc, DiffDoc, DiffErrorDoc, DiffFileDoc, DiffPartDoc } from '../../app/shared/docs.ts'
import { githubOrg } from '../../app/shared/refs.ts'
import { unifiedDiff } from '../../app/shared/sequence.ts'
import type { AdrLinks } from '../docs.ts'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'

import { diffCacheDir } from '../config.ts'
import { getFileText, getFileTexts, getMergeBase, getPullFiles, getPullHead, type PullFile } from '../github.ts'
import { declarations, languageFor, type Decl } from './declarations.ts'
import { markdownDiff } from './markdown-diff.ts'

const MAX_PARSED_FILES = 150
const MAX_FILE_CHARS = 600_000
const FETCH_CONCURRENCY = 8

/** Files nobody reviews by hand: their lines are kept, their declarations aren't listed. */
const GENERATED = [
  /(^|\/)(go\.sum|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|flake\.lock|poetry\.lock|uv\.lock)$/,
  /(^|\/)vendor\//,
  /\.pb(\.gw)?\.go$/,
  /(_gen|_generated|\.gen)\.(go|ts|js)$/,
  /(^|\/)zz_generated[^/]*$/,
  /\.min\.(js|css)$/,
]
/** Test code: listed under Lines only, never parsed for Contract or Implementation (owner, 2026-11-03). */
const TEST_FILE = [
  /_test\.go$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]*\.py$/,
  /_test\.py$/,
  /(^|\/)(test|tests|__tests__|testdata|e2e)\//,
]

export function isTestFile(filename: string): boolean {
  return TEST_FILE.some((re) => re.test(filename))
}

const GENERATED_HEADER = /^(\/\/|#) Code generated .* DO NOT EDIT\.$/m

const MARKDOWN = /\.(md|markdown)$/i

// Part of a built diff's cache key: bump it when what a build produces changes.
const BUILD_VERSION = 3

// File texts at a commit never change, and diffs of a given head and base don't either.
let texts = new Map<string, Promise<string>>()
let built = new Map<string, Promise<Built>>()

/** A PR's diff: the document, and each file's part (null where a file has none). */
export interface Built {
  doc: DiffDoc
  parts: (DiffPartDoc | null)[]
}

function remember<V>(map: Map<string, V>, key: string, value: V, max: number): V {
  map.set(key, value)
  if (map.size > max) map.delete(map.keys().next().value!)
  return value
}

function cacheFile(kind: 'texts' | 'built', key: string): string {
  return nodePath.join(diffCacheDir, kind, createHash('sha256').update(key).digest('hex').slice(0, 40) + '.json')
}

async function readCache<T>(kind: 'texts' | 'built', key: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(cacheFile(kind, key), 'utf8')) as T
  } catch {
    return null
  }
}

async function writeCache(kind: 'texts' | 'built', key: string, value: unknown) {
  let file = cacheFile(kind, key)
  try {
    await fs.mkdir(nodePath.dirname(file), { recursive: true })
    let tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify(value))
    await fs.rename(tmp, file)
  } catch {
    // A cache that can't be written only costs a fetch next time.
  }
}

function textAt(fullName: string, path: string, sha: string): Promise<string> {
  let key = `${fullName}@${sha}:${path}`
  let hit = texts.get(key)
  if (hit) return hit
  let value = (async () => {
    let cached = await readCache<{ text: string }>('texts', key)
    if (cached) return cached.text
    let text = await getFileText(fullName, path, sha)
    void writeCache('texts', key, { text })
    return text
  })()
  value.catch(() => texts.delete(key))
  return remember(texts, key, value, 2000)
}

/** Reads every version a build needs that isn't cached, in batches, before the per-file work. */
async function prefetch(fullName: string, wanted: { path: string; sha: string }[]) {
  let missing: { path: string; sha: string }[] = []
  for (let w of wanted) {
    let key = `${fullName}@${w.sha}:${w.path}`
    if (texts.has(key)) continue
    let cached = await readCache<{ text: string }>('texts', key)
    if (cached) remember(texts, key, Promise.resolve(cached.text), 2000)
    else missing.push(w)
  }
  if (!missing.length) return
  let got = await getFileTexts(fullName, missing.map((m) => ({ path: m.path, ref: m.sha })))
  await Promise.all(
    missing.map(async (m, i) => {
      let text = got[i]
      if (text == null) return
      let key = `${fullName}@${m.sha}:${m.path}`
      remember(texts, key, Promise.resolve(text), 2000)
      await writeCache('texts', key, { text })
    }),
  )
}

/** Runs fn over items, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  let out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        let i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

/** One PR's diff, built once per head; a GitHub failure becomes an error document, not a throw. */
export async function diffFor(repo: string, n: number, adrLinks: AdrLinks): Promise<Built | DiffErrorDoc> {
  let fullName = `${githubOrg}/${repo}`
  let ref = { repo, fullName, number: n }
  try {
    let head = await getPullHead(ref)
    let key = `v${BUILD_VERSION}:${fullName}#${n}@${head.headSha}:${head.baseSha}:${adrLinks}`
    let hit = built.get(key)
    if (!hit) {
      hit = (async () => {
        let cached = await readCache<Built>('built', key)
        if (cached) return cached
        let fresh = await build(ref, head, adrLinks)
        void writeCache('built', key, fresh)
        return fresh
      })()
      hit.catch(() => built.delete(key))
      remember(built, key, hit, 60)
    }
    let b = await hit
    // The title may change without a new head.
    return { ...b, doc: { ...b.doc, title: head.title, url: head.url } }
  } catch (error: any) {
    return { kind: 'diff', repo, number: n, error: String(error?.message ?? error).slice(0, 500) }
  }
}

async function build(
  ref: { repo: string; fullName: string; number: number },
  head: Awaited<ReturnType<typeof getPullHead>>,
  adrLinks: AdrLinks,
): Promise<Built> {
  let [baseSha, { files, truncated }] = await Promise.all([
    getMergeBase(ref.fullName, head.baseSha, head.headSha),
    getPullFiles(ref),
  ])
  // Every version the per-file work will read, fetched together first.
  let wanted: { path: string; sha: string }[] = []
  for (let f of files) {
    let readable = MARKDOWN.test(f.filename) || (languageFor(f.filename) && !GENERATED.some((re) => re.test(f.filename)) && !isTestFile(f.filename))
    if (!readable) continue
    if (f.status !== 'added') wanted.push({ path: f.previousFilename ?? f.filename, sha: baseSha })
    if (f.status !== 'removed') wanted.push({ path: f.filename, sha: head.headSha })
  }
  await prefetch(ref.fullName, wanted)
  let parsed = 0
  let parts: DiffPartDoc[] = []
  let docs: DiffFileDoc[] = await pool(files, FETCH_CONCURRENCY, async (f, i) => {
    let doc: DiffFileDoc = {
      filename: f.filename,
      ...(f.previousFilename ? { previousFilename: f.previousFilename } : {}),
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      kind: 'other',
      hasPart: false,
    }
    let part: DiffPartDoc = { headSha: head.headSha, filename: f.filename, ...(f.patch != null ? { patch: f.patch } : {}) }
    parts[i] = part
    if (MARKDOWN.test(f.filename)) {
      doc.kind = 'docs'
      await fillDocs(doc, part, f, ref, baseSha, head.headSha, adrLinks)
      return doc
    }
    let lang = languageFor(f.filename)
    if (!lang) return doc
    doc.kind = 'code'
    doc.language = lang
    if (GENERATED.some((re) => re.test(f.filename))) {
      doc.generated = true
      return doc
    }
    if (isTestFile(f.filename)) {
      doc.test = true
      return doc
    }
    if (++parsed > MAX_PARSED_FILES) {
      doc.note = `Not parsed: the PR changes more than ${MAX_PARSED_FILES} source files.`
      return doc
    }
    await fillDecls(doc, f, ref.fullName, baseSha, head.headSha, lang)
    return doc
  })
  findMoves(docs)
  // Body diffs go in each file's part, so the PR's document stays small.
  for (let [i, file] of docs.entries()) {
    for (let c of file.decls ?? []) {
      let patch = bodyPatchOf.get(c)
      if (!patch) continue
      parts[i].bodyPatches = { ...parts[i].bodyPatches, [c.key]: patch }
      c.hasBodyPatch = true
    }
  }
  let partsOut = parts.map((p, i) => {
    let has = p.patch != null || p.docHtml != null || p.bodyPatches != null
    docs[i].hasPart = has
    return has ? p : null
  })
  return {
    parts: partsOut,
    doc: {
    kind: 'diff',
    repo: ref.repo,
    number: ref.number,
    title: head.title,
    url: head.url,
    baseSha,
    headSha: head.headSha,
    files: docs,
    filesTruncated: truncated,
    },
  }
}

/** The file's text before and after: '' where it didn't exist. */
async function versions(f: PullFile, fullName: string, baseSha: string, headSha: string): Promise<[string, string]> {
  let before = f.status === 'added' ? '' : textAt(fullName, f.previousFilename ?? f.filename, baseSha)
  let after = f.status === 'removed' ? '' : textAt(fullName, f.filename, headSha)
  return Promise.all([before, after])
}

async function fillDocs(doc: DiffFileDoc, part: DiffPartDoc, f: PullFile, ref: { repo: string; fullName: string }, baseSha: string, headSha: string, adrLinks: AdrLinks) {
  try {
    let [before, after] = await versions(f, ref.fullName, baseSha, headSha)
    let dir = f.filename.includes('/') ? f.filename.slice(0, f.filename.lastIndexOf('/')) : ''
    let ctx = { repo: ref.repo, ref: f.status === 'removed' ? baseSha : headSha, dir, adrLinks }
    part.docHtml = markdownDiff(before, after, ctx)
  } catch (error: any) {
    doc.note = `Couldn't read the file: ${error?.message ?? error}`
  }
}

async function fillDecls(doc: DiffFileDoc, f: PullFile, fullName: string, baseSha: string, headSha: string, lang: NonNullable<ReturnType<typeof languageFor>>) {
  let before: string
  let after: string
  try {
    ;[before, after] = await versions(f, fullName, baseSha, headSha)
  } catch (error: any) {
    doc.note = `Couldn't read the file: ${error?.message ?? error}`
    return
  }
  if (GENERATED_HEADER.test(after.slice(0, 2000)) || GENERATED_HEADER.test(before.slice(0, 2000))) {
    doc.generated = true
    return
  }
  if (before.length > MAX_FILE_CHARS || after.length > MAX_FILE_CHARS) {
    doc.note = 'Not parsed: the file is too large.'
    return
  }
  let [a, b] = await Promise.all([before ? declarations(before, lang) : [], after ? declarations(after, lang) : []])
  if (!a || !b) {
    doc.note = "Not parsed: tree-sitter couldn't read it."
    return
  }
  doc.decls = compareDecls(a, b)
}

// The declaration behind an "added" or "removed" change, for matching moves across files, and a
// changed body's diff, until it's moved into the file's part.
let declOf = new WeakMap<DeclChangeDoc, Decl>()
let bodyPatchOf = new WeakMap<DeclChangeDoc, string>()

/** What changed between two versions of one file's declarations, in the head's order. */
export function compareDecls(before: Decl[], after: Decl[]): DeclChangeDoc[] {
  let old = new Map(before.map((d) => [d.key, d]))
  let changes: DeclChangeDoc[] = []
  for (let d of after) {
    let was = old.get(d.key)
    old.delete(d.key)
    if (!was) {
      let c = change(d, 'added', { signatureChanged: true, bodyChanged: false, after: d.signature })
      declOf.set(c, d)
      changes.push(c)
      continue
    }
    let c = compareOne(was, d)
    if (c) changes.push(c)
  }
  for (let d of old.values()) {
    let c = change(d, 'removed', { signatureChanged: true, bodyChanged: false, before: d.signature })
    declOf.set(c, d)
    changes.push(c)
  }
  return changes
}

function compareOne(was: Decl, now: Decl, movedFrom?: string): DeclChangeDoc | null {
  let signatureChanged = was.signatureKey !== now.signatureKey
  let bodyChanged = was.bodyKey !== now.bodyKey
  if (!signatureChanged && !bodyChanged && !movedFrom) return null
  let bodyPatch =
    bodyChanged && was.body != null && now.body != null
      ? unifiedDiff(was.body, now.body, { startA: was.bodyLine ?? 1, startB: now.bodyLine ?? 1, maxLines: 300 })
      : null
  let c = change(now, movedFrom ? 'moved' : 'changed', {
    signatureChanged,
    bodyChanged,
    before: was.signature,
    after: now.signature,
    ...(movedFrom ? { movedFrom } : {}),
    exported: now.exported || was.exported,
  })
  if (bodyPatch) bodyPatchOf.set(c, bodyPatch)
  return c
}

function change(d: Decl, status: DeclChangeDoc['status'], rest: Partial<DeclChangeDoc>): DeclChangeDoc {
  return {
    key: d.key,
    kind: d.kind,
    name: d.name,
    ...(d.container ? { container: d.container } : {}),
    status,
    signatureChanged: false,
    bodyChanged: false,
    line: d.line,
    exported: d.exported,
    ...rest,
  } as DeclChangeDoc
}

/**
 * A declaration removed from one file and added to another (in the same directory, for Go: the
 * same package) moved; it's compared as one, and listed where it is now.
 */
function findMoves(files: DiffFileDoc[]) {
  let dirOf = (f: string) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')
  let scope = (file: DiffFileDoc) => (file.language === 'go' ? `go:${dirOf(file.filename)}` : (file.language ?? ''))
  let removed = new Map<string, { file: DiffFileDoc; change: DeclChangeDoc }[]>()
  for (let file of files) {
    for (let c of file.decls ?? []) {
      if (c.status !== 'removed') continue
      let k = `${scope(file)}|${c.key}`
      removed.set(k, [...(removed.get(k) ?? []), { file, change: c }])
    }
  }
  for (let file of files) {
    let decls = file.decls ?? []
    for (let [i, c] of decls.entries()) {
      if (c.status !== 'added') continue
      let k = `${scope(file)}|${c.key}`
      let candidates = removed.get(k) ?? []
      let from = candidates.find((r) => r.file !== file)
      let was = from && declOf.get(from.change)
      let now = declOf.get(c)
      if (!from || !was || !now) continue
      removed.set(k, candidates.filter((r) => r !== from))
      from.file.decls = from.file.decls!.filter((x) => x !== from.change)
      decls[i] = compareOne(was, now, from.file.filename)!
    }
  }
}
