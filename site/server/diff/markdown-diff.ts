// A markdown file's change, rendered: the head version as HTML, with <ins> and <del> where words
// changed and whole blocks marked where blocks were added or removed.
import { Lexer } from 'marked'

import { diffSequence } from '../../app/shared/sequence.ts'
import { renderMarkdown, type MarkdownContext } from '../markdown.ts'

interface Block {
  type: string
  raw: string
}

function blocks(markdown: string): Block[] {
  return Lexer.lex(markdown, { gfm: true })
    .filter((t) => t.type !== 'space')
    .map((t) => ({ type: t.type, raw: t.raw.trim() }))
}

/**
 * Compares block by block (paragraphs, headings, lists, code), then word by word inside a block
 * that changed into one of the same type.
 */
export function markdownDiff(before: string, after: string, ctx: MarkdownContext, { context = 2 } = {}): string {
  // A new file is all new, and reads best plain; a removed one is shown struck through.
  if (!before.trim()) return renderMarkdown(after, ctx)
  if (!after.trim()) return `<div class="md-del">${renderMarkdown(before, ctx)}</div>`
  let a = blocks(before)
  let b = blocks(after)
  let render = (block: Block) => renderMarkdown(block.raw, ctx)
  let out: { html: string; changed: boolean }[] = []
  let push = (html: string, changed = true) => out.push({ html, changed })
  let runs = diffSequence(a, b, (x, y) => x.raw === y.raw)
  for (let i = 0; i < runs.length; i++) {
    let r = runs[i]
    if (r.op === 'equal') {
      for (let j = r.bStart; j < r.bEnd; j++) out.push({ html: render(b[j]), changed: false })
      continue
    }
    // A delete followed by an insert is a replacement: pair blocks of the same type in order.
    let removed = r.op === 'delete' ? a.slice(r.aStart, r.aEnd) : []
    let added = r.op === 'insert' ? b.slice(r.bStart, r.bEnd) : []
    let next = runs[i + 1]
    if (r.op === 'delete' && next?.op === 'insert') {
      added = b.slice(next.bStart, next.bEnd)
      i++
    }
    let ai = 0
    let bi = 0
    while (ai < removed.length || bi < added.length) {
      let x = removed[ai]
      let y = added[bi]
      if (x && y && x.type === y.type) {
        let merged = htmlDiff(render(x), render(y))
        push(x.type === 'table' ? foldRows(merged, context) : merged)
        ai++
        bi++
      } else if (x && (!y || removed.length - ai >= added.length - bi)) {
        push(`<div class="md-del">${render(x)}</div>`)
        ai++
      } else {
        push(`<div class="md-ins">${render(y!)}</div>`)
        bi++
      }
    }
  }
  return collapse(out, context)
}

/** Keeps `context` unchanged blocks either side of each change; longer stretches become a marker. */
function collapse(items: { html: string; changed: boolean }[], context: number): string {
  let keep = items.map(() => false)
  items.forEach((item, i) => {
    if (!item.changed) return
    for (let j = Math.max(0, i - context); j <= Math.min(items.length - 1, i + context); j++) keep[j] = true
  })
  let html: string[] = []
  let skipped = 0
  let flush = () => {
    if (skipped) html.push(`<div class="md-skip">${skipped} unchanged ${skipped === 1 ? 'block' : 'blocks'}</div>`)
    skipped = 0
  }
  items.forEach((item, i) => {
    if (keep[i]) {
      flush()
      html.push(item.html)
    } else skipped++
  })
  flush()
  return html.join('\n')
}

/** A changed table keeps its head, its changed rows and `context` rows around them. */
function foldRows(html: string, context: number): string {
  return html.replace(/<tbody>([\s\S]*?)<\/tbody>/, (_m, body: string) => {
    let rows = body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []
    let columns = (rows[0]?.match(/<td[\s>]/g) ?? []).length || 1
    let changed = rows.map((r) => /<(ins|del)>/.test(r))
    let keep = rows.map((_, i) => changed.slice(Math.max(0, i - context), i + context + 1).some(Boolean))
    let out: string[] = []
    let skipped = 0
    let flush = () => {
      if (skipped) out.push(`<tr><td colspan="${columns}"><div class="md-skip">${skipped} unchanged ${skipped === 1 ? 'row' : 'rows'}</div></td></tr>`)
      skipped = 0
    }
    rows.forEach((row, i) => {
      if (keep[i]) {
        flush()
        out.push(row)
      } else skipped++
    })
    flush()
    return `<tbody>\n${out.join('\n')}\n</tbody>`
  })
}

const TOKEN = /<[^>]*>|&[#\w]+;|[\p{L}\p{N}_'’-]+|\s+|[^\s<&\p{L}\p{N}_]/gu

/**
 * Two renderings of one block, merged word by word. The result keeps exactly the new version's
 * tags, so it stays well-formed: removed words come back as text inside <del>, never their tags.
 */
export function htmlDiff(before: string, after: string): string {
  let a = before.match(TOKEN) ?? []
  let b = after.match(TOKEN) ?? []
  let isTag = (t: string) => t.startsWith('<')
  let out = ''
  let open: 'ins' | 'del' | null = null
  let close = () => {
    if (open) out += `</${open}>`
    open = null
  }
  let text = (kind: 'ins' | 'del', token: string) => {
    if (open !== kind) {
      close()
      // Don't open a mark for whitespace alone; it carries over to the next word.
      if (/^\s+$/.test(token)) {
        out += token
        return
      }
      out += `<${kind}>`
      open = kind
    }
    out += token
  }
  for (let r of diffSequence(a, b)) {
    if (r.op === 'equal') {
      close()
      out += b.slice(r.bStart, r.bEnd).join('')
    } else if (r.op === 'delete') {
      for (let t of a.slice(r.aStart, r.aEnd)) {
        if (isTag(t)) close()
        else text('del', t)
      }
    } else {
      for (let t of b.slice(r.bStart, r.bEnd)) {
        if (isTag(t)) {
          close()
          out += t
        } else text('ins', t)
      }
    }
  }
  close()
  return out
}
