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
    let card = page.locator('article', { hasText: 'VM snapshots ADR' })
    await card.locator('.move', { hasText: 'Review and merge' }).waitFor()
    let merge = card.getByRole('link', { name: 'Merge on GitHub ↗' })
    assert.equal(await merge.getAttribute('href'), 'https://github.com/discobox-ai/vm/pull/38')
    assert.match((await merge.getAttribute('class')) ?? '', /\bbig\b/)
    assert.match(await page.locator('.when').innerText(), /synced 1 min ago/)
  })

  it('shows a PR’s details from its synced document, sanitized', async (t) => {
    let page = await t.serve(await serve(() => artifactPage()))
    await page.goto('/')
    let card = page.locator('article', { hasText: 'VM snapshots ADR' })
    await card.getByRole('button', { name: '▸ Details' }).click()
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
    let card = page.locator('article', { hasText: 'VM snapshots ADR' })
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
    let card = page.locator('article', { hasText: 'Flaky Windows test' })
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
    await frame.locator('article', { hasText: 'VM snapshots ADR' }).waitFor()
  })
})
