import * as fs from 'node:fs'
import * as path from 'node:path'
import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { fakeClaude } from './fake-claude.ts'
import { table } from './fixtures.ts'

const artifactFile = path.resolve(import.meta.dirname, '../dist-artifact/artifact.html')

// What sync.ts sends: the rows (with one PR this time), its details, and meta/state.
const seed = {
  'meta/state': { postedAt: table.postedAt, rowCount: 2, needYou: 1, links: [], syncedAt: Date.now() - 60_000 },
  'rows/vm~33': { ...table.rows[0], pr: 'vm 38', yourMove: 'Review and merge', rank: 0, prOpen: true },
  'rows/454': { ...table.rows[1], rank: 1, prOpen: null },
  'details/vm~pull~38': {
    kind: 'pull', repo: 'vm', number: 38, title: 'ADR 0007: snapshot format', state: 'open', stateReason: null,
    author: 'ibuildthecloud-bot', url: 'https://github.com/discobox-ai/vm/pull/38', labels: [{ name: 'adr', color: 'ededed' }],
    bodyHtml: '<p>Proposes <strong>qcow2</strong>.</p><script>window.__pwned = true</script><img src="https://example.com/x.png" alt="diagram">',
    comments: [], draft: false, merged: false, mergeable: true, mergeableState: 'clean', headSha: '0123456789abcdef',
    headRef: 'adr-33', baseRef: 'main', checks: [{ name: 'ci', status: 'completed', conclusion: 'success', url: null }],
    files: [{ filename: 'docs/adr/0007-snapshots.md', status: 'added', additions: 80, deletions: 0 }], filesTruncated: false,
    additions: 80, deletions: 0, adrs: [],
  },
  // What the sync sends for an open PR's diff viewer: the PR's document and each file's part.
  'diffs/vm~pull~38': {
    kind: 'diff', repo: 'vm', number: 38, title: 'ADR 0007: snapshot format', url: 'https://github.com/discobox-ai/vm/pull/38',
    baseSha: 'aaaaaaaaaaaaaaaa', headSha: '0123456789abcdef', filesTruncated: false,
    files: [
      {
        filename: 'snap/snap.go', status: 'modified', additions: 3, deletions: 1, kind: 'code', language: 'go', hasPart: true,
        decls: [
          { key: 'func:Take', kind: 'func', name: 'Take', status: 'changed', signatureChanged: true, bodyChanged: false, before: 'func Take(id string) error', after: 'func Take(id string, opts Options) error', line: 12, exported: true },
          { key: 'func:compress', kind: 'func', name: 'compress', status: 'changed', signatureChanged: false, bodyChanged: true, before: 'func compress(b []byte) []byte', after: 'func compress(b []byte) []byte', line: 30, exported: false, hasBodyPatch: true },
        ],
      },
      { filename: 'docs/adr/0007-snapshots.md', status: 'added', additions: 80, deletions: 0, kind: 'docs', hasPart: true },
    ],
  },
  'diffParts/vm~pull~38~0': {
    headSha: '0123456789abcdef', filename: 'snap/snap.go',
    patch: '@@ -12,2 +12,4 @@\n-func Take(id string) error {\n+func Take(id string, opts Options) error {\n+\t// qcow2\n+\treturn nil\n }',
    bodyPatches: { 'func:compress': '@@ -30,1 +30,1 @@\n-\treturn zstd(b)\n+\treturn lz4(b)' },
  },
  'diffParts/vm~pull~38~1': {
    headSha: '0123456789abcdef', filename: 'docs/adr/0007-snapshots.md',
    docHtml: '<p>Snapshots use <del>raw</del><ins>qcow2</ins> images.</p><div class="md-skip">3 unchanged blocks</div><script>window.__pwned = true</script>',
  },
}

/** The page as the Artifact tool publishes it: its skeleton, the runtime, then the file. */
function artifactPage(options?: { writable?: boolean }): string {
  return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><script>${fakeClaude(seed, options)}</script>${fs.readFileSync(artifactFile, 'utf8')}</body></html>`
}

function serve(handler: (url: URL) => string) {
  return createTestServer(async (request) => new Response(handler(new URL(request.url)), { headers: { 'Content-Type': 'text/html' } }))
}

describe('artifact (vite build --mode artifact)', () => {
  it('shows the synced rows, and a PR row merges on GitHub', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/artifact/21128720/index.html')
    let card = page.locator('.inbox-pane')
    await card.getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
    await card.locator('.move', { hasText: /Review and merge/i }).waitFor()
    let merge = card.getByRole('link', { name: 'Merge on GitHub ↗' })
    assert.equal(await merge.getAttribute('href'), 'https://github.com/discobox-ai/vm/pull/38')
    assert.match((await merge.getAttribute('class')) ?? '', /\bbig\b/)
    assert.match(await page.locator('.topline').innerText(), /synced 1 min ago/)
    // The viewer puts the stylesheet in <body>, which the app renders over: it must survive.
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(14, 15, 18)')
  })

  it('shows a PR’s details from its synced document, sanitized', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/')
    let card = page.locator('.inbox-pane')
    await card.getByText('Checks on 01234567 (1)').waitFor()
    await card.locator('.md strong', { hasText: 'qcow2' }).waitFor()
    assert.equal(await card.locator('.md script').count(), 0)
    assert.equal(await card.locator('.md img').count(), 0, 'outside images become links')
    assert.equal(await card.locator('.md a.img').getAttribute('href'), 'https://example.com/x.png')
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined)
  })

  it('records a close as a pending actions document, and shows it done when actionsDone arrives', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/')
    let card = page.locator('.inbox-pane')
    await card.getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
    await card.getByRole('button', { name: 'Close / reject PR' }).click()
    await card.getByRole('textbox', { name: 'Reason' }).fill('Superseded by vm 40')
    await card.getByRole('button', { name: 'Close / reject PR…' }).click()
    let dialog = page.getByRole('dialog', { name: 'Close PR discobox-ai/vm#38 without merging?' })
    await dialog.getByRole('button', { name: 'Close PR' }).click()
    await card.getByText(/The manager picks it up at the next sync\./).waitFor()

    let writes = await page.evaluate(() => (window as any).__writes)
    assert.equal(writes.length, 1)
    let { path: docPath, data } = writes[0]
    assert.match(docPath, /^actions\/[\w-]+$/)
    assert.equal(data.kind, 'close-pr')
    assert.equal(data.repo, 'discobox-ai/vm')
    assert.equal(data.pr, 38)
    assert.equal(data.reason, 'Superseded by vm 40')
    assert.equal(data.status, 'pending')
    await card.locator('.pill.pending').waitFor()

    await page.evaluate((id) => (window as any).__put(`actionsDone/${id}`, { id, done: true, at: new Date().toISOString(), note: 'Closed' }), data.id)
    await card.locator('.pill.done').waitFor()
  })

  it('hides the action buttons from a view-only viewer', async (t) => {
    let page = await t.serve(await serve(() => artifactPage({ writable: false })))
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Rows' }).getByRole('button', { name: 'Flaky Windows test' }).click()
    let card = page.locator('.inbox-pane')
    await card.getByRole('heading', { name: 'Flaky Windows test' }).waitFor()
    await page.waitForTimeout(100)
    assert.equal(await card.getByRole('button', { name: 'Instruction' }).count(), 0)
  })

  it('runs in a sandboxed frame with no origin of its own, routing in the fragment', async (t) => {
    let page = await t.serve(
      await serve((url) =>
        url.pathname === '/frame'
          ? artifactPage()
          : `<!doctype html><iframe sandbox="allow-scripts allow-modals" src="/frame#/adr/vm" style="width:100%;height:900px"></iframe>`,
      ),
    )
    await page.goto('/')
    let frame = page.frameLocator('iframe')
    await frame.getByText('ADRs open on GitHub from here.').waitFor()
    await frame.getByRole('link', { name: 'Manager status' }).click()
    await frame.locator('.inbox-pane').getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
  })

  it('opens a PR’s diff from its row, with contract, docs, implementation and lines tabs', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/')
    await page.locator('.inbox-pane').getByRole('link', { name: 'diff', exact: true }).click()
    await page.getByRole('heading', { name: 'ADR 0007: snapshot format' }).waitFor()
    assert.match(page.url(), /#\/diff\/vm\/38$/)

    // Contract: only the signature change, merged word by word.
    let contract = page.getByRole('tabpanel')
    await contract.locator('.decl', { hasText: 'Take' }).waitFor()
    assert.equal(await contract.locator('.decl').count(), 1)
    assert.equal(await contract.locator('pre.sig ins').innerText(), ', opts Options')
    assert.match(await page.getByRole('tab', { name: /Contract/ }).innerText(), /1/)

    // Implementation: the body-only change too, with its body's diff on request.
    await page.getByRole('tab', { name: /Implementation/ }).click()
    let body = page.locator('.decl', { hasText: 'compress' })
    await body.locator('.badge.body').waitFor()
    await body.getByRole('button', { name: 'Show the body’s diff' }).click()
    await body.locator('tr.add', { hasText: 'lz4' }).waitFor()
    assert.equal(await body.locator('tr.add .ln').nth(1).innerText(), '30')
    assert.match(page.url(), /tab=implementation/)

    // Docs: the rendered markdown with its changes inline, sanitized.
    await page.getByRole('tab', { name: /Docs/ }).click()
    await page.locator('.doc-diff ins', { hasText: 'qcow2' }).waitFor()
    await page.locator('.doc-diff .md-skip', { hasText: '3 unchanged blocks' }).waitFor()
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined)

    // Lines: GitHub's patch with old and new line numbers.
    await page.getByRole('tab', { name: /Lines/ }).click()
    let added = page.locator('section', { hasText: 'snap/snap.go' }).locator('tr.add').first()
    await added.waitFor()
    assert.equal(await added.locator('.ln').nth(1).innerText(), '12')
    assert.match(await added.locator('.code').innerText(), /opts Options/)
  })

  it('chats through the database: a message is an actions document, the thread comes back as chat', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/')
    await page.getByRole('button', { name: /Chat with the manager/ }).click()
    let box = page.getByRole('textbox', { name: 'Message the manager' })
    await box.fill('Ship 0.18.1 today?')
    await box.press('Enter')
    let chat = page.getByRole('region', { name: 'Chat with the manager' })
    await chat.locator('.msg.owner.sending', { hasText: 'Ship 0.18.1 today?' }).waitFor()

    let writes = await page.evaluate(() => (window as any).__writes)
    let { path: docPath, data } = writes.at(-1)
    assert.match(docPath, /^actions\/[\w-]+$/)
    assert.equal(data.kind, 'chat')
    assert.equal(data.text, 'Ship 0.18.1 today?')
    assert.equal(data.status, 'pending')
    // It's a message, not an action: it stays out of recent actions.
    assert.match(await page.locator('.recent-line').innerText(), /Recent actions · 0/)

    // The sync carries it to chat.jsonl and sends the thread back, with the manager's reply.
    await page.evaluate((m) => {
      ;(window as any).__put(`chat/${m.id}`, { id: m.id, at: m.at, from: 'owner', text: m.text })
      ;(window as any).__put('chat/r1', { id: 'r1', at: new Date(Date.parse(m.at) + 1000).toISOString(), from: 'manager', text: 'Yes, once #523 is fixed.', replyTo: m.id })
    }, data)
    await chat.locator('.msg.manager', { hasText: 'once #523 is fixed' }).waitFor()
    assert.equal(await chat.locator('.msg.sending').count(), 0)
  })
})
