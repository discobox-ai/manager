// The owner's single chat thread with the manager. The owner's messages go to chat.jsonl, which
// the manager's site-chat monitor watches; the manager answers with scripts/chat, into
// chat-replies.jsonl. Both are JSON lines (ChatDoc).
import { randomBytes } from 'node:crypto'
import * as fsp from 'node:fs/promises'

import type { ChatDoc } from '../app/shared/docs.ts'
import { chatPath, chatRepliesPath } from './config.ts'

export const MAX_CHAT_TEXT = 4000
const KEEP = 200

export class ChatError extends Error {}

async function readLines(path: string): Promise<ChatDoc[]> {
  let text = ''
  try {
    text = await fsp.readFile(path, 'utf8')
  } catch {
    return []
  }
  let out: ChatDoc[] = []
  for (let line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      let d = JSON.parse(line)
      if (d && typeof d.id === 'string' && typeof d.text === 'string' && typeof d.at === 'string') out.push(d)
    } catch {}
  }
  return out
}

/** The thread, oldest first: the last 200 messages from both sides. */
export async function readChat(): Promise<ChatDoc[]> {
  let [mine, theirs] = await Promise.all([readLines(chatPath), readLines(chatRepliesPath)])
  let all = [...mine.map((m) => ({ ...m, from: 'owner' as const })), ...theirs.map((m) => ({ ...m, from: 'manager' as const }))]
  return all.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(-KEEP)
}

export function newChatId(): string {
  return `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

/** Appends one owner message; `id` and `at` come from the artifact when it sent the message. */
export async function appendOwnerMessage(text: unknown, given?: { id?: string; at?: string }): Promise<ChatDoc> {
  let body = typeof text === 'string' ? text.trim() : ''
  if (!body) throw new ChatError('Write a message first.')
  if (body.length > MAX_CHAT_TEXT) throw new ChatError(`Keep it under ${MAX_CHAT_TEXT} characters.`)
  let at = given?.at && !Number.isNaN(Date.parse(given.at)) ? new Date(given.at).toISOString() : new Date().toISOString()
  let msg: ChatDoc = { id: given?.id ?? newChatId(), at, from: 'owner', text: body }
  await fsp.appendFile(chatPath, JSON.stringify(msg) + '\n')
  return msg
}

export async function chatIds(): Promise<Set<string>> {
  return new Set((await readLines(chatPath)).map((m) => m.id))
}
