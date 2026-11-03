import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** Two rows as scripts/table writes them: one needs the owner, one is in progress. */
export const table = {
  postedAt: Date.now() - 2 * 60_000,
  rows: [
    {
      key: 'vm 33',
      item: 'VM snapshots ADR',
      agent: 'adr-vm-33',
      issue: 'vm 33',
      pr: '-',
      doing: 'ADR drafted, waiting on a decision',
      yourMove: 'Answer the box: snapshot format',
      why: 'needs-decision',
    },
    {
      key: '454',
      item: 'Flaky Windows test',
      agent: 'deliver-454',
      issue: '454',
      pr: '-',
      doing: 'Reproducing on CI',
      yourMove: '–',
      why: '-',
    },
  ],
  links: ['Manager site: http://localhost:4400'],
}

/** A scratch state directory holding table.json, for SITE_STATE_DIR. */
export function makeStateDir(): string {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manager-site-test-'))
  fs.writeFileSync(path.join(dir, 'table.json'), JSON.stringify(table))
  return dir
}
