// Read-only GitHub REST calls, made from the server with GH_TOKEN. Never a write: every request is a GET.
import type { Ref } from './table.ts'

const API = 'https://api.github.com'
const TTL_MS = 30_000

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

interface Fetched {
  json: any
  link: string | null
}

let cache = new Map<string, { at: number; value: Promise<Fetched> }>()

async function get(path: string): Promise<Fetched> {
  let hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  let value = (async () => {
    let token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
    let headers: Record<string, string> = {
      // full+json adds body_html: GitHub's own rendering of the markdown, already sanitized by GitHub.
      Accept: 'application/vnd.github.full+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'discobox-manager-site',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    let res = await fetch(API + path, { method: 'GET', headers, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      let text = (await res.text()).slice(0, 300)
      let msg = text
      try {
        msg = JSON.parse(text).message ?? text
      } catch {}
      throw new GitHubError(`GET ${path}: ${res.status} ${msg}`.trim(), res.status)
    }
    return { json: await res.json(), link: res.headers.get('link') }
  })()
  cache.set(path, { at: Date.now(), value })
  value.catch(() => cache.delete(path))
  return value
}

function lastPageUrl(link: string | null): string | null {
  let m = link?.match(/<https:\/\/api\.github\.com([^>]+)>;\s*rel="last"/)
  return m ? m[1] : null
}

export interface Label {
  name: string
  color: string
}

export interface Comment {
  author: string
  at: string
  url: string
  bodyHtml: string
}

export interface IssueDetails {
  title: string
  state: string
  stateReason: string | null
  author: string
  url: string
  bodyHtml: string
  labels: Label[]
  comments: Comment[]
}

export interface Check {
  name: string
  status: string
  conclusion: string | null
  url: string | null
}

export interface ChangedFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

export interface PullDetails extends IssueDetails {
  draft: boolean
  merged: boolean
  mergeable: boolean | null
  mergeableState: string
  headSha: string
  headRef: string
  baseRef: string
  checks: Check[]
  files: ChangedFile[]
  filesTruncated: boolean
  additions: number
  deletions: number
}

function labels(raw: any[]): Label[] {
  return (raw ?? []).map((l: any) => ({ name: String(l.name), color: String(l.color ?? '888888') }))
}

async function lastComments(ref: Ref, count = 5): Promise<Comment[]> {
  let base = `/repos/${ref.fullName}/issues/${ref.number}/comments?per_page=100`
  let first = await get(base)
  let last = lastPageUrl(first.link)
  let page = last ? await get(last) : first
  let items: any[] = page.json
  if (last && items.length < count) {
    // The last page is short: the page before it holds the rest.
    let prev = Number(new URL('https://x' + last).searchParams.get('page')) - 1
    if (prev >= 1) items = [...(await get(`${base}&page=${prev}`)).json, ...items]
  }
  return items.slice(-count).map((c: any) => ({
    author: c.user?.login ?? 'ghost',
    at: c.created_at,
    url: c.html_url,
    bodyHtml: c.body_html ?? '',
  }))
}

export async function getIssue(ref: Ref): Promise<IssueDetails> {
  let [{ json: i }, comments] = await Promise.all([
    get(`/repos/${ref.fullName}/issues/${ref.number}`),
    lastComments(ref),
  ])
  return {
    title: i.title,
    state: i.state,
    stateReason: i.state_reason ?? null,
    author: i.user?.login ?? 'ghost',
    url: i.html_url,
    bodyHtml: i.body_html ?? '',
    labels: labels(i.labels),
    comments,
  }
}

async function checksFor(ref: Ref, sha: string): Promise<Check[]> {
  let [runs, status] = await Promise.all([
    get(`/repos/${ref.fullName}/commits/${sha}/check-runs?per_page=100`),
    get(`/repos/${ref.fullName}/commits/${sha}/status`).catch(() => null),
  ])
  let checks: Check[] = (runs.json.check_runs ?? []).map((c: any) => ({
    name: c.name,
    status: c.status,
    conclusion: c.conclusion ?? null,
    url: c.html_url ?? null,
  }))
  for (let s of status?.json.statuses ?? []) {
    checks.push({
      name: s.context,
      status: s.state === 'pending' ? 'in_progress' : 'completed',
      conclusion: s.state === 'pending' ? null : s.state,
      url: s.target_url ?? null,
    })
  }
  return checks.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getPull(ref: Ref): Promise<PullDetails> {
  let [{ json: p }, files, comments] = await Promise.all([
    get(`/repos/${ref.fullName}/pulls/${ref.number}`),
    get(`/repos/${ref.fullName}/pulls/${ref.number}/files?per_page=100`),
    lastComments(ref),
  ])
  let checks = await checksFor(ref, p.head.sha)
  return {
    title: p.title,
    state: p.state,
    stateReason: null,
    author: p.user?.login ?? 'ghost',
    url: p.html_url,
    bodyHtml: p.body_html ?? '',
    labels: labels(p.labels),
    comments,
    draft: Boolean(p.draft),
    merged: Boolean(p.merged),
    mergeable: p.mergeable ?? null,
    mergeableState: p.mergeable_state ?? 'unknown',
    headSha: p.head.sha,
    headRef: p.head.label ?? p.head.ref,
    baseRef: p.base.ref,
    checks,
    files: (files.json as any[]).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
    filesTruncated: p.changed_files > (files.json as any[]).length,
    additions: p.additions,
    deletions: p.deletions,
  }
}
