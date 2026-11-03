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
  it('shows the rows in the inbox, what needs the owner first, the top one open', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    await page.getByRole('heading', { name: 'Manager status' }).waitFor()

    let list = page.getByRole('navigation', { name: 'Rows' })
    await list.getByRole('heading', { name: 'Your move · 1' }).waitFor()
    await list.getByRole('heading', { name: 'In progress · 1' }).waitFor()
    let pane = page.locator('.inbox-pane')
    await pane.getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
    assert.equal(await pane.locator('.move').innerText(), '→ ANSWER THE BOX: SNAPSHOT FORMAT')
    assert.match(await page.locator('.topline').innerText(), /updated 2 min ago/)

    await list.getByRole('button', { name: 'Flaky Windows test' }).click()
    await pane.getByRole('heading', { name: 'Flaky Windows test' }).waitFor()
  })

  it('records an instruction, and shows it done once the manager marks it', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Rows' }).getByRole('button', { name: 'Flaky Windows test' }).click()
    let pane = page.locator('.inbox-pane')
    await pane.getByRole('button', { name: 'Instruction' }).click()
    await pane.getByRole('textbox', { name: 'Instruction' }).fill('Try it on the arm64 runner too')
    await pane.getByRole('button', { name: 'Instruction…' }).click()
    await pane.getByRole('button', { name: 'Confirm' }).click()
    await pane.getByText(/^Recorded .+ for the manager\.$/).waitFor()

    let lines = fs.readFileSync(path.join(stateDir, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    let action = lines.at(-1)
    assert.equal(action.kind, 'instruct')
    assert.equal(action.key, '454')
    assert.equal(action.text, 'Try it on the arm64 runner too')
    await pane.locator('.pill.pending').waitFor()

    // scripts/action done appends this; the event stream brings it to the page.
    fs.appendFileSync(path.join(stateDir, 'actions-done.jsonl'), JSON.stringify({ id: action.id, done: true, at: new Date().toISOString(), note: 'Told deliver-454' }) + '\n')
    await pane.locator('.pill.done').waitFor({ timeout: 10_000 })
    await pane.getByText('— Told deliver-454').waitFor()
  })

  it('closes an issue only through the confirm dialog', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    let pane = page.locator('.inbox-pane')
    await pane.getByRole('heading', { name: 'VM snapshots ADR' }).waitFor()
    await pane.getByRole('button', { name: 'Close issue' }).click()
    await pane.getByRole('radio', { name: 'not planned' }).check()
    await pane.getByRole('button', { name: 'Close issue…' }).click()
    let dialog = page.getByRole('dialog', { name: 'Close issue discobox-ai/vm#33 as not planned?' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })
    let recorded = fs.existsSync(path.join(stateDir, 'actions.jsonl')) ? fs.readFileSync(path.join(stateDir, 'actions.jsonl'), 'utf8') : ''
    assert.ok(!recorded.includes('close-issue'), 'Cancel records nothing')
  })

  it('chats with the manager: a message lands in chat.jsonl, and its reply shows in the thread', async (t) => {
    let page = await t.serve(await createTestServer(createAppRouter({ buildDir }).fetch))
    await page.goto('/')
    await page.getByRole('button', { name: /Chat with the manager/ }).click()
    let box = page.getByRole('textbox', { name: 'Message the manager' })
    await box.fill('What is blocking 454?')
    await box.press('Enter')
    let chat = page.getByRole('region', { name: 'Chat with the manager' })
    await chat.locator('.msg.owner', { hasText: 'What is blocking 454?' }).waitFor()
    await chat.getByText('The manager has it').waitFor()

    let sent = fs.readFileSync(path.join(stateDir, 'chat.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).at(-1)
    assert.equal(sent.text, 'What is blocking 454?')
    assert.equal(sent.from, 'owner')

    // scripts/chat reply appends this; the event stream brings it to the page.
    let reply = { id: 'r1', at: new Date().toISOString(), from: 'manager', text: 'A flaky runner; deliver-454 is on it.', replyTo: sent.id }
    fs.appendFileSync(path.join(stateDir, 'chat-replies.jsonl'), JSON.stringify(reply) + '\n')
    await chat.locator('.msg.manager', { hasText: 'A flaky runner' }).waitFor({ timeout: 10_000 })
    assert.equal(await chat.getByText('The manager has it').count(), 0)
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
