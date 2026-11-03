export function ago(ms: number): string {
  let s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  let m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  let h = Math.floor(m / 60)
  return h < 48 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} days ago`
}

/** "Nov 3, 03:52 PM", in the viewer's locale and zone. */
export function stamp(t: number): string {
  return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "2026-11-03 15:52Z" */
export function utc(iso: string | null | undefined): string {
  if (!iso) return ''
  let d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}
