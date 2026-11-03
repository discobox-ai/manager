import { unsafeHTML, type Handle } from 'remix/component'

import { host } from '../store/index.ts'

// The documents arrive sanitized (GitHub's body_html, and server/markdown.ts for ADRs); this is
// the page's own second pass, since anyone who can write the artifact's database could put HTML
// in a document.
const ALLOWED = new Set(
  'a p br hr h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code em strong b i del s ins sup sub table thead tbody tfoot tr th td details summary span div kbd dl dt dd input g-emoji img'.split(
    ' ',
  ),
)
const DROP = new Set(
  'script style iframe object embed link meta base form frame frameset noscript template svg math textarea select button'.split(' '),
)

// The artifact can load no outside images, and links only make sense on GitHub; the box can load
// images, and its own ADR viewer links are paths on the same site.
const imagesLoad = host === 'box'
const localLinks = host === 'box'

function safeUrl(u: string): string | null {
  if (localLinks && /^\/(?!\/)/.test(u)) return u
  try {
    let url = new URL(u, 'https://github.com/')
    return /^(https?:|mailto:)$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function sanitize(html: string): string {
  let doc = new DOMParser().parseFromString(`<div>${html ?? ''}</div>`, 'text/html')
  let root = doc.body.firstElementChild!

  let clean = (n: Element, tag: string) => {
    for (let a of [...n.attributes]) {
      let name = a.name.toLowerCase()
      let keep =
        (tag === 'a' && (name === 'href' || name === 'title' || name === 'target' || name === 'class')) ||
        (tag === 'img' && (name === 'src' || name === 'alt' || name === 'width' || name === 'height')) ||
        ((tag === 'th' || tag === 'td') && name === 'align') ||
        (tag === 'td' && name === 'colspan' && /^\d{1,2}$/.test(a.value)) ||
        ((tag === 'code' || tag === 'pre' || tag === 'span' || tag === 'div') && name === 'class' && /^[\w\s-]*$/.test(a.value)) ||
        (tag === 'input' && (name === 'type' || name === 'checked' || name === 'disabled')) ||
        (tag === 'details' && name === 'open')
      if (!keep) n.removeAttribute(a.name)
    }
    if (tag === 'a') {
      let href = safeUrl(n.getAttribute('href') ?? '')
      if (!href) {
        n.removeAttribute('href')
        n.removeAttribute('target')
      } else {
        n.setAttribute('href', href)
        let local = href.startsWith('/')
        if (!local || n.getAttribute('target') === '_blank') {
          n.setAttribute('target', '_blank')
          n.setAttribute('rel', local ? 'noopener' : 'noopener noreferrer')
        }
      }
    }
    if (tag === 'img') {
      let src = safeUrl(n.getAttribute('src') ?? '')
      if (src) n.setAttribute('src', src)
      else n.removeAttribute('src')
    }
    if (tag === 'input') {
      if (n.getAttribute('type') !== 'checkbox') n.remove()
      else n.setAttribute('disabled', '')
    }
  }

  let walk = (node: Element) => {
    for (let child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove()
        continue
      }
      let el = child as Element
      let tag = el.tagName.toLowerCase()
      if (DROP.has(tag)) {
        el.remove()
        continue
      }
      if (tag === 'img' && !imagesLoad) {
        // Keep a link to the image instead.
        let src = safeUrl(el.getAttribute('src') ?? '')
        let rep = doc.createElement(src ? 'a' : 'span')
        rep.className = 'img'
        rep.textContent = `[${el.getAttribute('alt') || 'image'}]`
        if (src) rep.setAttribute('href', src)
        el.replaceWith(rep)
        if (src) clean(rep, 'a')
        continue
      }
      if (!ALLOWED.has(tag)) {
        walk(el)
        el.replaceWith(...el.childNodes)
        continue
      }
      clean(el, tag)
      walk(el)
      if (tag === 'table') {
        let wrap = doc.createElement('div')
        wrap.className = 'tablewrap'
        el.replaceWith(wrap)
        wrap.append(el)
      }
    }
  }
  walk(root)
  return root.innerHTML
}

/** Rendered markdown or GitHub HTML, sanitized. */
export function Markdown(handle: Handle<{ html: string; class?: string }>) {
  let source: string | null = null
  let clean = ''
  return () => {
    if (handle.props.html !== source) {
      source = handle.props.html
      clean = sanitize(source)
    }
    return <div class={handle.props.class ? `md ${handle.props.class}` : 'md'} innerHTML={unsafeHTML(clean)} />
  }
}
