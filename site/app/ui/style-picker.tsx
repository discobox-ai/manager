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

export function StylePicker(handle: Handle<{ layouts?: boolean }>) {
  let onLayout = () => handle.update()
  layoutEvents.addEventListener('change', onLayout)
  handle.signal.addEventListener('abort', () => layoutEvents.removeEventListener('change', onLayout))
  return () => {
    let current = document.documentElement.dataset.style ?? ''
    let layout = layoutNow()
    return (
      <div class="picker-dock">
      {handle.props.layouts ? (
        <div class="style-picker" role="group" aria-label="Prototype layout">
          {LAYOUTS.map((l) => (
            <button key={l.id || 'cards'} type="button" aria-pressed={layout === l.id} mix={on('click', () => setLayout(l.id))}>
              {l.label}
            </button>
          ))}
        </div>
      ) : null}
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
      </div>
    )
  }
}

// The same for the board's layout: eight prototypes over the current one.
export const LAYOUTS = [
  { id: '', label: 'Cards' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'lines', label: 'Lines' },
  { id: 'next', label: 'Next up' },
  { id: 'grouped', label: 'Grouped' },
  { id: 'kanban', label: 'Board' },
  { id: 'keys', label: 'Keys' },
  { id: 'rail', label: 'Rail' },
  { id: 'summary', label: 'Summary' },
] as const

const LAYOUT_KEY = 'manager-site-layout'
export const layoutEvents = new EventTarget()

export function chosenLayout(): string {
  let fromUrl = new URLSearchParams(location.search).get('layout')
  if (fromUrl != null && LAYOUTS.some((l) => l.id === fromUrl)) return fromUrl
  try {
    return localStorage.getItem(LAYOUT_KEY) ?? ''
  } catch {
    return ''
  }
}

let currentLayout: string | null = null

export function layoutNow(): string {
  return (currentLayout ??= chosenLayout())
}

export function setLayout(id: string) {
  currentLayout = id
  try {
    localStorage.setItem(LAYOUT_KEY, id)
  } catch {}
  layoutEvents.dispatchEvent(new Event('change'))
}
