import * as fs from 'node:fs'
import * as path from 'node:path'
import * as assert from 'remix/assert'
import { createTestServer } from 'remix/node-fetch-server/test'
import { describe, it } from 'remix/test'

import { makeStateDir } from './fixtures.ts'

// server/config.ts reads these when it loads, so set them before importing the router.
const stateDir = makeStateDir()
process.env.SITE_STATE_DIR = stateDir
process.env.SITE_TABLE = path.join(stateDir, 'table.json')
process.env.GH_TOKEN = ''
const { createAppRouter } = await import('../server/router.ts')

const buildDir = path.resolve(import.meta.dirname, '../dist')

describe('box (vite build)', () => {
  it('shows the table, ranked, with what needs the owner first', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    await page.getByRole('heading', { name: 'Manager status' }).waitFor()

    let mine = page.locator('section[aria-labelledby="h-mine"]')
    await mine.getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
    assert.equal(await mine.locator('.move').innerText(), '→ Answer the box: snapshot format')
    await page.locator('section[aria-labelledby="h-rest"]').getByRole('heading', { name: 'Flaky Windows test' }).waitFor()
    assert.match(await page.locator('.need').innerText(), /1 row needs you · 2 rows/)
    assert.match(await page.locator('.when').innerText(), /Table updated 2 min ago/)
  })

  it('records an instruction, and shows it done once the manager marks it', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    let card = page.locator('article', { hasText: 'Flaky Windows test' })
    await card.getByRole('button', { name: 'Instruction' }).click()
    await card.getByRole('textbox', { name: 'Instruction' }).fill('Try it on the arm64 runner too')
    await card.getByRole('button', { name: 'Instruction…' }).click()
    await card.getByRole('button', { name: 'Confirm' }).click()
    await card.getByText(/^Recorded .+ for the manager\.$/).waitFor()

    let lines = fs.readFileSync(path.join(stateDir, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    let action = lines.at(-1)
    assert.equal(action.kind, 'instruct')
    assert.equal(action.key, '454')
    assert.equal(action.text, 'Try it on the arm64 runner too')
    await card.locator('.pill.pending').waitFor()

    // scripts/action done appends this; the event stream brings it to the page.
    fs.appendFileSync(path.join(stateDir, 'actions-done.jsonl'), JSON.stringify({ id: action.id, done: true, at: new Date().toISOString(), note: 'Told deliver-454' }) + '\n')
    await card.locator('.pill.done').waitFor({ timeout: 10_000 })
    await card.getByText('— Told deliver-454').waitFor()
  })

  it('closes an issue only through the confirm dialog', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    let card = page.locator('article', { hasText: 'VM snapshots ADR' })
    await card.getByRole('button', { name: 'Close issue' }).click()
    await card.getByRole('radio', { name: 'not planned' }).check()
    await card.getByRole('button', { name: 'Close issue…' }).click()
    let dialog = page.getByRole('dialog', { name: 'Close issue discobox-ai/vm#33 as not planned?' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    let recorded = fs.existsSync(path.join(stateDir, 'actions.jsonl')) ? fs.readFileSync(path.join(stateDir, 'actions.jsonl'), 'utf8') : ''
    assert.ok(!recorded.includes('close-issue'), 'Cancel records nothing')
  })

  it('answers an unknown path with the app, which says nothing is there', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/no/such/page')
    await page.getByRole('heading', { name: 'Nothing at /no/such/page' }).waitFor()
    await page.getByRole('link', { name: 'Back to the status board' }).click()
    await page.getByRole('heading', { name: 'Manager status' }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/')
  })
})
