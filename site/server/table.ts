import * as fs from 'node:fs/promises'

import { hasMove, parseRef, refUrl, type Ref, type Row } from '../app/shared/refs.ts'
import { tablePath } from './config.ts'

export { hasMove, parseRef, refUrl, type Ref, type Row }

export interface Table {
  postedAt: number | null
  rows: Row[]
  links: { label: string; url: string }[]
  error?: string
}

function keyOf(r: Partial<Row>): string {
  if (r.key) return r.key
  if (r.issue && r.issue !== '-') return r.issue
  if (r.pr && r.pr !== '-') return 'pr ' + r.pr
  return r.item ?? ''
}

export async function readTable(): Promise<Table> {
  let raw: any
  try {
    raw = JSON.parse(await fs.readFile(tablePath, 'utf8'))
  } catch (error: any) {
    return { postedAt: null, rows: [], links: [], error: `${tablePath}: ${error.message}` }
  }
  let rows: Row[] = (raw.rows ?? []).map((r: any) => ({
    key: keyOf(r),
    item: String(r.item ?? '-'),
    agent: String(r.agent ?? '-'),
    issue: String(r.issue ?? '-'),
    pr: String(r.pr ?? '-'),
    doing: String(r.doing ?? '-'),
    yourMove: String(r.yourMove ?? '–'),
    why: String(r.why ?? '-'),
  }))
  let links = (raw.links ?? []).map((l: string) => {
    let i = String(l).indexOf(': ')
    return i < 0 ? { label: String(l), url: '' } : { label: l.slice(0, i), url: l.slice(i + 2) }
  })
  return { postedAt: typeof raw.postedAt === 'number' ? raw.postedAt : null, rows, links }
}
