// Markdown rendering for ADR files (GitHub's /markdown API isn't reachable with our token) and
// link rewriting so ADR links open in this site's viewer.
import { Marked, type Tokens } from 'marked'

import { githubOrg } from '../config.ts'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SAFE_URL = /^(https?:|mailto:|#|\/(?!\/)|\.{0,2}\/|[\w.-]+(?:[/?#]|$))/i

export function adrViewerHref(repo: string, file: string, ref?: string): string {
  return `/adr/${encodeURIComponent(repo)}/${encodeURIComponent(file)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`
}

export interface MarkdownContext {
  repo: string // short name: "vm"
  ref?: string // the ref the file was read at
  dir: string // the file's directory, e.g. "docs/adr"
}

function isAbsolute(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')
}

/** A relative link in a repo file, as a repository path. */
function resolvePath(href: string, dir: string): { path: string; frag: string } {
  let [pathPart, frag = ''] = href.split('#', 2)
  let parts = (pathPart.startsWith('/') ? [] : dir.split('/')).filter(Boolean)
  for (let seg of pathPart.split('?')[0].split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return { path: parts.join('/'), frag: frag ? `#${frag}` : '' }
}

/** Other ADRs open in the viewer, the ADR directory in the index, everything else on GitHub. */
function resolveLink(href: string, ctx: MarkdownContext): string {
  if (isAbsolute(href)) return href
  let { path, frag } = resolvePath(href, ctx.dir)
  let adr = path.match(/^docs\/adr\/([^/]+\.md)$/)
  if (adr) return adrViewerHref(ctx.repo, adr[1], ctx.ref) + frag
  if (path === 'docs/adr') return `/adr/${encodeURIComponent(ctx.repo)}${ctx.ref ? `?ref=${encodeURIComponent(ctx.ref)}` : ''}`
  return `https://github.com/${githubOrg}/${ctx.repo}/blob/${ctx.ref ?? 'HEAD'}/${path}${frag}`
}

function resolveImage(href: string, ctx: MarkdownContext): string {
  if (isAbsolute(href)) return href
  return `https://github.com/${githubOrg}/${ctx.repo}/raw/${ctx.ref ?? 'HEAD'}/${resolvePath(href, ctx.dir).path}`
}

/**
 * Markdown to HTML with no raw HTML passing through: HTML blocks and inline tags in the source are
 * shown as text, URLs are limited to safe schemes, and a final pass strips script/style/on*.
 */
export function renderMarkdown(markdown: string, ctx: MarkdownContext): string {
  let marked = new Marked({
    gfm: true,
    async: false,
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text)
      },
    },
    walkTokens(token) {
      if (token.type === 'link' || token.type === 'image') {
        let t = token as Tokens.Link | Tokens.Image
        let href = t.href.trim()
        if (!SAFE_URL.test(href)) t.href = '#'
        else t.href = token.type === 'link' ? resolveLink(href, ctx) : resolveImage(href, ctx)
      }
    },
  })
  let html = marked.parse(markdown) as string
  return externalLinksInNewTab(stripDangerous(html))
}

export function stripDangerous(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/<[a-z][^>]*>/gi, (tag) =>
      tag
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*"\s*(javascript|vbscript|data):[^"]*"/gi, '$1="#"'),
    )
}

function externalLinksInNewTab(html: string): string {
  return html.replace(/<a (?![^>]*\btarget=)([^>]*href="(?:https?:)?\/\/)/g, '<a target="_blank" rel="noopener noreferrer" $1')
}

const ADR_BLOB = new RegExp(
  `<a ([^>]*?)href="https://github\\.com/${githubOrg}/([\\w.-]+)/blob/([\\w.-]+)/docs/adr/([^"/#?]+\\.md)(#[^"]*)?"([^>]*)>([\\s\\S]*?)</a>`,
  'g',
)

/**
 * GitHub's body_html (already sanitized by GitHub): ADR links, including relative ones GitHub
 * resolved to blob URLs, open in this site's viewer with an "on GitHub" link beside them.
 */
export function rewriteGithubHtml(html: string, repo: string): string {
  // GitHub leaves some relative links in body_html ("../blob/main/docs/adr/x.md", relative to
  // .../<repo>/issues/<n>); make them absolute first so one rule handles both forms.
  let absolute = stripDangerous(html).replace(
    /href="\.\.\/((?:blob|tree|pull|issues|commit|compare)\/[^"]*)"/g,
    (_m, rest) => `href="https://github.com/${githubOrg}/${repo}/${rest}"`,
  )
  let out = absolute.replace(ADR_BLOB, (_m, pre, repo, ref, file, frag = '', post, text) => {
    let gh = `https://github.com/${githubOrg}/${repo}/blob/${ref}/docs/adr/${file}${frag}`
    let viewer = adrViewerHref(repo, file, ref === 'main' || ref === 'master' ? undefined : ref) + frag
    let attrs = `${pre}${post}`.replace(/\s*(target|rel)="[^"]*"/g, '')
    return `<a ${attrs.trim()} href="${viewer}" target="_blank" rel="noopener" class="adr-link">${text}</a> <a href="${gh}" target="_blank" rel="noopener noreferrer" class="gh-link">(on GitHub)</a>`
  })
  return out.replace(/<a (?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer" ')
}
