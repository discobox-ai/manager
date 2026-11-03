// Builds the documents both views read (app/shared/docs.ts) from the table, actions.jsonl and
// GitHub. The box's API serves them directly; sync.ts sends them to the artifact's database.
import type { ActionDoc, DetailsDoc, DoneDoc, IssueDoc, MetaDoc, PullDoc, RowDoc } from '../app/shared/docs.ts'
import { detailsId, githubOrg, hasMove, parseRef, type Row } from '../app/shared/refs.ts'
import type { ActionWithStatus } from './actions.ts'
import { getIssue, getPull, pullIsOpen, type IssueDetails, type PullDetails } from './github.ts'
import { renderMarkdown, rewriteGithubHtml } from './markdown.ts'
import type { Table } from './table.ts'

/**
 * Where ADR links in rendered HTML point: the box's own ADR viewer, or GitHub (the artifact has no
 * viewer, and can't reach the box).
 */
export type AdrLinks = 'viewer' | 'github'

export function issueDoc(repo: string, n: number, d: IssueDetails, adrLinks: AdrLinks): IssueDoc {
  return {
    kind: 'issue',
    repo,
    number: n,
    title: d.title,
    state: d.state,
    stateReason: d.stateReason,
    author: d.author,
    url: d.url,
    labels: d.labels,
    bodyHtml: rewriteGithubHtml(d.bodyHtml, repo, { adrLinks }),
    comments: d.comments.map((c) => ({
      author: c.author,
      at: c.at,
      url: c.url,
      html: rewriteGithubHtml(c.bodyHtml, repo, { adrLinks }),
    })),
  }
}

export function pullDoc(repo: string, n: number, d: PullDetails, adrLinks: AdrLinks): PullDoc {
  return {
    ...issueDoc(repo, n, d, adrLinks),
    kind: 'pull',
    draft: d.draft,
    merged: d.merged,
    mergeable: d.mergeable,
    mergeableState: d.mergeableState,
    headSha: d.headSha,
    headRef: d.headRef,
    baseRef: d.baseRef,
    checks: d.checks,
    files: d.files.map(({ patch: _p, ...f }) => f),
    filesTruncated: d.filesTruncated,
    additions: d.additions,
    deletions: d.deletions,
    adrs: d.adrs.map((a) => ({
      path: a.path,
      filename: a.filename,
      status: a.status,
      title: a.title,
      html: a.error ? '' : renderMarkdown(a.markdown, { repo, ref: d.headSha, dir: 'docs/adr', adrLinks }),
      ...(a.patch ? { patch: a.patch } : {}),
      ...(a.error ? { error: a.error } : {}),
    })),
  }
}

/** One issue's or PR's details; a GitHub failure becomes an error document, not a throw. */
export async function detailsDoc(repo: string, kind: 'pull' | 'issues', n: number, adrLinks: AdrLinks): Promise<DetailsDoc> {
  let ref = { repo, fullName: `${githubOrg}/${repo}`, number: n }
  try {
    return kind === 'pull' ? pullDoc(repo, n, await getPull(ref), adrLinks) : issueDoc(repo, n, await getIssue(ref), adrLinks)
  } catch (error: any) {
    return {
      kind: kind === 'pull' ? 'pull' : 'issue',
      repo,
      number: n,
      error: String(error?.message ?? error).slice(0, 500),
    }
  }
}

/** Every issue and PR the table's rows name, as details ids. */
export function wantedDetails(rows: Row[]): Map<string, { repo: string; kind: 'pull' | 'issues'; n: number }> {
  let wanted = new Map<string, { repo: string; kind: 'pull' | 'issues'; n: number }>()
  for (let row of rows) {
    let pr = parseRef(row.pr)
    let issue = parseRef(row.issue)
    if (pr) wanted.set(detailsId(pr.repo, 'pull', pr.number), { repo: pr.repo, kind: 'pull', n: pr.number })
    if (issue) wanted.set(detailsId(issue.repo, 'issues', issue.number), { repo: issue.repo, kind: 'issues', n: issue.number })
  }
  return wanted
}

export function rowFields(row: Row): Row {
  return {
    key: row.key,
    item: row.item,
    agent: row.agent,
    issue: row.issue,
    pr: row.pr,
    doing: row.doing,
    yourMove: row.yourMove,
    why: row.why,
  }
}

/**
 * The table's rows in order, each with whether its PR is open (for the merge button). A details
 * document already fetched answers that; otherwise one quick PR lookup does (null: unknown).
 */
export async function rowDocs(table: Table, details?: Map<string, DetailsDoc>): Promise<RowDoc[]> {
  return Promise.all(
    table.rows.map(async (row, rank) => {
      let pr = parseRef(row.pr)
      let prOpen: boolean | null = null
      let doc = pr ? details?.get(detailsId(pr.repo, 'pull', pr.number)) : undefined
      if (doc && !('error' in doc) && doc.kind === 'pull') prOpen = doc.state === 'open' && !doc.merged
      else if (pr) prOpen = await pullIsOpen(pr)
      return { ...rowFields(row), rank, prOpen }
    }),
  )
}

export function metaDoc(table: Table): MetaDoc {
  return {
    postedAt: table.postedAt,
    rowCount: table.rows.length,
    needYou: table.rows.filter((r) => r.key !== 'finished' && hasMove(r)).length,
    links: table.links,
    ...(table.slots ? { slots: table.slots } : {}),
    ...(table.error ? { error: table.error } : {}),
  }
}

export function actionDoc(a: ActionWithStatus): ActionDoc {
  let { done: _d, doneAt: _a, note: _n, unresolved: _u, ...doc } = a
  return doc
}

export function doneDoc(a: ActionWithStatus): DoneDoc | null {
  return a.done ? { id: a.id, done: true, at: a.doneAt ?? null, note: a.note ?? null, ...(a.unresolved ? { unresolved: true } : {}) } : null
}
