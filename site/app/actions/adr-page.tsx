import type { Handle } from 'remix/component'
import { css, unsafeHTML } from 'remix/component'

import { githubOrg } from '../config.ts'
import { adrViewerHref } from '../data/markdown.ts'
import { routes } from '../routes.ts'
import { Document } from './document.tsx'

export interface AdrPageProps {
  repo: string
  ref?: string
  file?: string // absent on the index
  title: string
  html: string | null // rendered, sanitized markdown
  error?: string
  entries?: string[] // the index's ADR filenames
}

export function AdrPage(handle: Handle<AdrPageProps>) {
  return () => {
    let { repo, ref, file, title, html, error, entries } = handle.props
    let refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : ''
    let ghPath = file ? `blob/${ref ?? 'HEAD'}/docs/adr/${file}` : `tree/${ref ?? 'HEAD'}/docs/adr`
    return (
      <Document title={`${title} · ${repo} ADRs`}>
        <main mix={css({ maxWidth: '900px', margin: '0 auto', padding: '20px 16px 60px', display: 'grid', gap: '14px' })}>
          <nav mix={css({ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', color: 'var(--muted)', fontSize: '13px' })}>
            <a href={routes.home.href()}>Manager</a>
            <span>/</span>
            <a href={routes.adrIndex.href({ repo }) + refQuery}>
              {githubOrg}/{repo} ADRs
            </a>
            {file ? (
              <>
                <span>/</span>
                <span class="mono">{file}</span>
              </>
            ) : null}
            <span mix={css({ marginLeft: 'auto' })}>
              {ref ? (
                <>
                  at <span class="mono">{ref.length === 40 ? ref.slice(0, 10) : ref}</span> ·{' '}
                </>
              ) : (
                'default branch · '
              )}
              <a href={`https://github.com/${githubOrg}/${repo}/${ghPath}`} target="_blank" rel="noopener noreferrer">
                on GitHub
              </a>
            </span>
          </nav>
          {error ? <p mix={css({ color: 'var(--danger)' })}>Couldn't load {file ?? 'the ADR index'}: {error}</p> : null}
          {html ? <article class="md" mix={articleStyle} innerHTML={unsafeHTML(html)} /> : null}
          {entries?.length ? (
            <section mix={articleStyle}>
              <h2 mix={css({ marginTop: 0, fontSize: '16px' })}>All ADR files ({entries.length})</h2>
              <ul mix={css({ margin: 0, paddingLeft: '18px' })}>
                {entries.map((name) => (
                  <li key={name}>
                    <a href={adrViewerHref(repo, name, ref)} class="mono">
                      {name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </main>
      </Document>
    )
  }
}

const articleStyle = css({
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '20px 24px',
  minWidth: 0,
})
