import * as fs from 'node:fs/promises'

import { defaultRepo, githubOrg, tablePath } from '../config.ts'

export interface Row {
  key: string
  item: string
  agent: string
  issue: string
  pr: string
  doing: string
  yourMove: string
  why: string
}

export interface Table {
  postedAt: number | null
  rows: Row[]
  links: { label: string; url: string }[]
  error?: string
}

/** A reference to an issue or PR: "454" is discobox-ai/discobox, "vm 33" is discobox-ai/vm. */
export interface Ref {
  repo: string // short name, e.g. "vm"
  fullName: string // "discobox-ai/vm"
  number: number
}

export function parseRef(value: string | undefined): Ref | null {
  if (!value) return null
  let m = value.trim().match(/^(?:(?:pr\s+)?([A-Za-z][\w.-]*)\s+)?#?(\d+)\b/)
  if (!m) return null
  let repo = m[1] ?? defaultRepo
  return { repo, fullName: `${githubOrg}/${repo}`, number: Number(m[2]) }
}

export function refUrl(ref: Ref, kind: 'issue' | 'pr'): string {
  return `https://github.com/${ref.fullName}/${kind === 'pr' ? 'pull' : 'issues'}/${ref.number}`
}

export function hasMove(row: Row): boolean {
  let m = (row.yourMove ?? '').trim()
  return m !== '' && m !== '–' && m !== '-' && m !== '—'
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
