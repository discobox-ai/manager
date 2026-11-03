import { on, type Handle } from 'remix/component'

// A prototype: four candidate looks for the site (public/styles/prototypes.css), switched here
// and remembered in this browser. Signal is the owner's pick (2026-11-03), so it's the default. ?style=<name> picks one from a link.
export const STYLES = [
  { id: '', label: 'Current' },
  { id: 'hairline', label: 'Hairline' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'signal', label: 'Signal' },
] as const

const KEY = 'manager-site-style'

export function chosenStyle(): string {
  let fromUrl = new URLSearchParams(location.search).get('style')
  if (fromUrl != null && STYLES.some((s) => s.id === fromUrl)) return fromUrl
  try {
    return localStorage.getItem(KEY) ?? 'signal'
  } catch {
    return 'signal'
  }
}

export function applyStyle(id: string) {
  if (id) document.documentElement.dataset.style = id
  else delete document.documentElement.dataset.style
  try {
    localStorage.setItem(KEY, id)
  } catch {}
}

export function StylePicker(handle: Handle) {
  return () => {
    let current = document.documentElement.dataset.style ?? ''
    return (
      <div class="style-picker" role="group" aria-label="Prototype style">
        {STYLES.map((s) => (
          <button
            key={s.id || 'current'}
            type="button"
            aria-pressed={current === s.id}
            mix={on('click', () => {
              applyStyle(s.id)
              handle.update()
            })}
          >
            {s.label}
          </button>
        ))}
      </div>
    )
  }
}
