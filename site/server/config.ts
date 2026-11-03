import * as os from 'node:os'
import * as path from 'node:path'

function expand(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
}

const defaultStateDir = '~/.local/state/discobox-manager'

// SITE_TABLE and SITE_STATE_DIR point a test instance at copies, so tests never touch the real files.
export const stateDir = expand(process.env.SITE_STATE_DIR ?? defaultStateDir)
export const tablePath = expand(process.env.SITE_TABLE ?? path.join(defaultStateDir, 'table.json'))
export const actionsPath = path.join(stateDir, 'actions.jsonl')
export const actionsDonePath = path.join(stateDir, 'actions-done.jsonl')
// The chat with the manager: the owner's messages (what the site-chat monitor watches), and the
// manager's replies apart, so its own replies don't wake it.
export const chatPath = path.join(stateDir, 'chat.jsonl')
export const chatRepliesPath = path.join(stateDir, 'chat-replies.jsonl')

export const port = Number.parseInt(process.env.PORT ?? '4400', 10)
export const host = process.env.HOST ?? '0.0.0.0'

export { defaultRepo, githubOrg } from '../app/shared/refs.ts'
