import * as fs from 'node:fs'

import { actionsDonePath, actionsPath, chatPath, chatRepliesPath, tablePath } from './config.ts'

// One poll per file for the whole process. watchFile, not watch: scripts/table replaces the file
// by rename, which an inode watch loses, and watchFile also copes with a file that doesn't exist yet.
export const changes = new EventTarget()
let version = Date.now()

export function currentVersion(): number {
  return version
}

for (let path of [tablePath, actionsPath, actionsDonePath, chatPath, chatRepliesPath]) {
  fs.watchFile(path, { interval: 1000, persistent: false }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs && cur.size === prev.size && cur.ino === prev.ino) return
    version = Date.now()
    changes.dispatchEvent(new Event('change'))
  })
}
