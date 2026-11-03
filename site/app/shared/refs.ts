// Shared by the browser app and the server: no DOM, no Node.

export const githubOrg = 'discobox-ai'
export const defaultRepo = 'discobox'

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

/** A reference to an issue or PR: "454" is discobox-ai/discobox, "vm 33" is discobox-ai/vm. */
export interface Ref {
  repo: string // short name, e.g. "vm"
  fullName: string // "discobox-ai/vm"
  number: number
}

export function parseRef(value: string | undefined | null): Ref | null {
  if (!value) return null
  let m = value.trim().match(/^(?:(?:pr\s+)?([A-Za-z][\w.-]*)\s+)?#?(\d+)\b/)
  if (!m) return null
  let repo = m[1] ?? defaultRepo
  return { repo, fullName: `${githubOrg}/${repo}`, number: Number(m[2]) }
}

export function refUrl(ref: Ref, kind: 'issue' | 'pr'): string {
  return `https://github.com/${ref.fullName}/${kind === 'pr' ? 'pull' : 'issues'}/${ref.number}`
}

export function hasMove(row: Pick<Row, 'yourMove'>): boolean {
  let m = (row.yourMove ?? '').trim()
  return m !== '' && m !== '–' && m !== '-' && m !== '—'
}

/** The details document for an issue or PR: "vm~pull~38". */
export function detailsId(repo: string, kind: 'pull' | 'issues', n: number): string {
  return `${repo}~${kind}~${n}`
}
