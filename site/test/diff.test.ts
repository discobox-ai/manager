import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { diffSequence, unifiedDiff } from '../app/shared/sequence.ts'
import { declarations } from '../server/diff/declarations.ts'
import { compareDecls } from '../server/diff/index.ts'
import { htmlDiff, markdownDiff } from '../server/diff/markdown-diff.ts'

const ctx = { repo: 'vm', dir: '', adrLinks: 'github' as const }

async function changes(before: string, after: string, lang: 'go' | 'typescript' | 'python') {
  let [a, b] = await Promise.all([declarations(before, lang), declarations(after, lang)])
  return compareDecls(a!, b!).map((c) => `${c.status}${c.signatureChanged ? ' sig' : ''}${c.bodyChanged ? ' body' : ''} ${c.key}`)
}

describe('sequence diff', () => {
  it('finds the shortest edit', () => {
    let runs = diffSequence([...'abcabba'], [...'cbabac'])
    let edits = runs.filter((r) => r.op !== 'equal').reduce((n, r) => n + (r.aEnd - r.aStart) + (r.bEnd - r.bStart), 0)
    assert.equal(edits, 5)
  })

  it('writes unified hunks with the given line numbers', () => {
    let patch = unifiedDiff('a\nb\nc\nd', 'a\nB\nc\nd', { startA: 10, startB: 10, context: 1 })
    assert.equal(patch, '@@ -10,3 +10,3 @@\n a\n-b\n+B\n c')
    assert.equal(unifiedDiff('same', 'same'), null)
  })
})

describe('declarations', () => {
  it('Go: tells a signature change from a body change, and ignores formatting and comments', async () => {
    let before = `package x
func A(n int) error { return nil }
func B() { println("one") }
// C is formatted badly.
func   C( x  string )   {}
type T struct { X int }
func (t *T) M() {}
`
    let after = `package x
func A(n int, s string) error { return nil }
func B() { println("two") }
// C, reformatted, with its comment changed.
func C(x string) {}
type T struct {
	X int
	Y string
}
func (t *T) N() {}
`
    assert.deepEqual(await changes(before, after, 'go'), [
      'changed sig func:A',
      'changed body func:B',
      'changed sig type:T',
      'added sig method:T.N',
      'removed sig method:T.M',
    ])
  })

  it('Go: knows exported names and keeps repeated init functions apart', async () => {
    let decls = (await declarations('package x\nfunc init() {}\nfunc init() {}\nfunc Exported() {}\nfunc (s *srv) Run() {}\n', 'go'))!
    assert.deepEqual(
      decls.map((d) => [d.key, d.exported]),
      [
        ['func:init', false],
        ['func:init#2', false],
        ['func:Exported', true],
        ['method:srv.Run', false],
      ],
    )
  })

  it('TypeScript: exports, class members, arrow functions and values', async () => {
    let before = `export function f(a: number): string { return '' }
export class K { private x = 1; m(a: string): void { go() } }
export const g = (x: string) => x
const limit = 10
`
    let after = `export function f(a: number): string { return 'changed' }
export class K { private x = 2; m(a: string, b?: number): void { go() } }
export const g = (x: string) => x.trim()
const limit = 20
`
    assert.deepEqual(await changes(before, after, 'typescript'), [
      'changed body func:f',
      'changed body field:K.x',
      'changed sig method:K.m',
      'changed body func:g',
      'changed body const:limit',
    ])
  })

  it('Python: functions, classes and methods', async () => {
    assert.deepEqual(
      await changes('def f(a):\n    return a\nclass C:\n    def m(self):\n        pass\n', 'def f(a, b=1):\n    return a\nclass C:\n    def m(self):\n        return 1\n', 'python'),
      ['changed sig func:f', 'changed body method:C.m'],
    )
  })
})

describe('markdown diff', () => {
  it('marks changed words inside a block, keeping the new tags', () => {
    assert.equal(htmlDiff('<p>The <em>old</em> way.</p>', '<p>The <em>new</em> way, now.</p>'), '<p>The <em><del>old</del><ins>new</ins></em> way<ins>, now</ins>.</p>')
  })

  it('marks whole blocks added or removed, and folds unchanged stretches', () => {
    let before = ['# Title', 'One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Gone.'].join('\n\n')
    let after = ['# Title', 'One.', 'Two.', 'Three.', 'Four.', 'Five.', '- a new list'].join('\n\n')
    let html = markdownDiff(before, after, ctx, { context: 1 })
    assert.match(html, /<div class="md-skip">5 unchanged blocks<\/div>/)
    assert.match(html, /<p>Five\.<\/p>/)
    assert.match(html, /<div class="md-del"><p>Gone\.<\/p>/)
    assert.match(html, /<div class="md-ins"><ul>/)
  })

  it('folds a table to its changed rows', () => {
    let rows = (change: string) => ['| a | b |', '|---|---|', ...Array.from({ length: 10 }, (_, i) => `| ${i} | ${i === 5 ? change : 'same'} |`)].join('\n')
    let html = markdownDiff(rows('old'), rows('new'), ctx, { context: 1 })
    assert.match(html, /<del>old<\/del><ins>new<\/ins>/)
    assert.match(html, /4 unchanged rows/)
    assert.match(html, /<th>a<\/th>/)
  })

  it('shows a new file plainly', () => {
    assert.equal(markdownDiff('', '# Hi', ctx), '<h1>Hi</h1>\n')
  })
})
