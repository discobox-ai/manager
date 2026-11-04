import type { EngineInterface, Register } from 'claude-code'

// The manager's artifact is fed from a box-side service (site/sync.ts) that queues write_db
// batches in outbox/. This mod empties that queue by calling the Artifact tool itself on a
// timer, so no model copies batches. It also pulls the owner's pending `actions` into inbox/.
//
// PROTOTYPE: it runs only while <state>/mod.on exists, so it can't race the one-shot agent
// passes; `/artifact-sync-test` makes one harmless read to show that the call works.
const URL = 'https://claude.ai/code/artifact/21128720-e384-4249-a3d0-9b8b6b5e7923'
const EVERY_MS = 30_000

let busy = false
let idsAt = 0
const IDS_EVERY_MS = 5 * 60_000
// Collections whose ids the box reconciles against (diffParts is too big to list).
const LISTED = ['rows', 'details', 'diffs', 'chat', 'actionsDone']

async function dirOf($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '/root'
  return `${home}/.local/state/discobox-manager/artifact-sync`
}

async function status($: EngineInterface, dir: string, patch: Record<string, unknown>) {
  let cur: Record<string, unknown> = {}
  try {
    cur = JSON.parse(await $.fs.read(`${dir}/mod-status.json`))
  } catch {}
  await $.fs.write(`${dir}/mod-status.json`, JSON.stringify({ ...cur, ...patch, at: new Date().toISOString() }, null, 1))
}

async function tick($: EngineInterface) {
  if (busy) return
  busy = true
  const dir = await dirOf($)
  try {
    if (!(await $.fs.exists(`${dir}/mod.on`))) return
    // 1. Send the outbox, oldest first.
    const names = (await $.fs.list(`${dir}/outbox`))
      .map(e => e.name)
      .filter(n => /^\d+\.json$/.test(n))
      .sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)))
    let sent = 0
    for (const name of names) {
      const { writes } = JSON.parse(await $.fs.read(`${dir}/outbox/${name}`))
      const r = await $.tool.call({ tool: 'Artifact', action: 'write_db', url: URL, db_op: 'batch', writes })
      if ('deny' in r && r.deny) throw new Error(`denied: ${r.deny}`)
      if ('isError' in r && r.isError) throw new Error(`write_db failed: ${String(r.text).slice(0, 300)}`)
      await $.process.run(['rm', '-f', `${dir}/outbox/${name}`])
      sent += writes.length
    }
    // 2. Pull pending actions (the owner's presses and chat) into inbox/.
    await $.tool.call({
      tool: 'Artifact',
      action: 'read_db',
      url: URL,
      db_op: 'query',
      collection: 'actions',
      query: { where: [['status', '==', 'pending']], limit: 100 },
      out_dir: `${dir}/pulled`,
    })
    let pulled = 0
    if (await $.fs.exists(`${dir}/pulled/actions`)) {
      const files = (await $.fs.list(`${dir}/pulled/actions`)).map(e => e.name).filter(n => n.endsWith('.json'))
      const marks: { op: 'update'; collection: string; doc_id: string; data: Record<string, unknown> }[] = []
      for (const f of files) {
        const id = f.slice(0, -5)
        await $.fs.write(`${dir}/inbox/${f}`, await $.fs.read(`${dir}/pulled/actions/${f}`))
        marks.push({ op: 'update', collection: 'actions', doc_id: id, data: { status: 'received' } })
        await $.process.run(['rm', '-f', `${dir}/pulled/actions/${f}`])
      }
      if (marks.length) {
        await $.tool.call({ tool: 'Artifact', action: 'write_db', url: URL, db_op: 'batch', writes: marks })
        pulled = marks.length
      }
    }
    // 3. Every few minutes, with nothing queued, say which ids the database holds, for sync.ts
    //    to reconcile against (it deletes strays and resends what's missing).
    let listed = false
    if (Date.now() - idsAt > IDS_EVERY_MS && (await $.fs.list(`${dir}/outbox`)).every(e => !/^\d+\.json$/.test(e.name))) {
      const ids: Record<string, string[]> = {}
      for (const c of LISTED) {
        await $.process.run(['rm', '-rf', `${dir}/remote-docs/${c}`])
        await $.tool.call({ tool: 'Artifact', action: 'read_db', url: URL, db_op: 'list', collection: c, query: { limit: 1000 }, out_dir: `${dir}/remote-docs` })
        ids[c] = (await $.fs.exists(`${dir}/remote-docs/${c}`))
          ? (await $.fs.list(`${dir}/remote-docs/${c}`)).filter(e => e.name.endsWith('.json')).map(e => e.name.slice(0, -5).replace(/@/g, '~'))
          : []
      }
      await $.process.run(['rm', '-rf', `${dir}/remote-docs`])
      await $.fs.write(`${dir}/remote.json`, JSON.stringify({ at: Date.now(), ids }))
      idsAt = Date.now()
      listed = true
    }
    await status($, dir, { ok: true, sent, pulled, listed, error: null })
  } catch (error) {
    await status($, dir, { ok: false, error: String((error as Error)?.message ?? error) })
  } finally {
    busy = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'artifact-sync-test', description: 'One read of the artifact database, to prove the Artifact tool is callable from a mod' })
    $.clock.every(EVERY_MS, () => tick($))
    return next(e)
  })

  on('command.run', { command: 'artifact-sync-test' }, async $ => {
    const dir = await dirOf($)
    try {
      const r = await $.tool.call({ tool: 'Artifact', action: 'read_db', url: URL, db_op: 'list', collection: 'meta', query: { limit: 1 } })
      const text = 'text' in r ? String(r.text) : JSON.stringify(r)
      await status($, dir, { test: text.slice(0, 400) })
      return { text: `Artifact call returned: ${text.slice(0, 300)}` }
    } catch (error) {
      await status($, dir, { test: `error: ${String((error as Error)?.message ?? error)}` })
      return { text: `Artifact call failed: ${String((error as Error)?.message ?? error)}` }
    }
  })
}
