import { clientEntry, css, type Handle } from 'remix/component'

const STALE_MS = 15 * 60 * 1000

/**
 * Keeps the board current: the server sends an event whenever table.json or an actions file
 * changes, and this reloads the named board frame. Renders a small connection dot.
 */
export const LiveUpdates = clientEntry(
  import.meta.url,
  function LiveUpdates(handle: Handle<{ eventsHref: string; frame: string }>) {
    let connected = false

    handle.queueTask(() => {
      let reloading: Promise<unknown> | null = null
      let again = false
      let reload = () => {
        if (reloading) {
          again = true
          return
        }
        reloading = Promise.resolve(handle.frames.get(handle.props.frame)?.reload())
          .catch((error) => console.error('board reload failed', error))
          .finally(() => {
            reloading = null
            if (again) {
              again = false
              reload()
            }
          })
      }
      let lostConnection = false
      let source = new EventSource(handle.props.eventsHref)
      source.addEventListener('change', reload)
      source.addEventListener('open', () => {
        connected = true
        handle.update()
        // Anything may have changed while we were disconnected.
        if (lostConnection) reload()
      })
      source.addEventListener('error', () => {
        connected = false
        lostConnection = true
        handle.update()
      })
      // A minute's tick re-renders server-side relative times even when nothing changed.
      let timer = setInterval(reload, 60_000)
      handle.signal.addEventListener('abort', () => {
        source.close()
        clearInterval(timer)
      })
    })

    return () => (
      <span
        title={connected ? 'Live: updates as the table changes' : 'Not connected; retrying'}
        mix={css({ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '12px' })}
      >
        <span
          mix={css({ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' })}
          style={{ background: connected ? 'var(--ok)' : 'var(--muted)' }}
        />
        {connected ? 'live' : 'offline'}
      </span>
    )
  },
)

function ago(ms: number): string {
  let s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  let m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  let h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${m % 60} min ago`
  return `${Math.floor(h / 24)} days ago`
}

/** "Updated 3 min ago", ticking; "stale" in red once the table is older than 15 minutes. */
export const UpdatedAt = clientEntry(
  import.meta.url,
  function UpdatedAt(handle: Handle<{ postedAt: number | null; renderedAt: number }>) {
    let now = handle.props.renderedAt

    handle.queueTask(() => {
      now = Date.now()
      let timer = setInterval(() => {
        now = Date.now()
        handle.update()
      }, 15_000)
      handle.signal.addEventListener('abort', () => clearInterval(timer))
      handle.update()
    })

    return () => {
      let { postedAt } = handle.props
      if (postedAt == null) return <span mix={css({ color: 'var(--danger)' })}>table never posted</span>
      let age = now - postedAt
      let stale = age > STALE_MS
      let stamp = new Date(postedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      return (
        <span title={new Date(postedAt).toISOString()}>
          Table updated {ago(age)} <span mix={css({ color: 'var(--muted)' })}>({stamp})</span>
          {stale ? (
            <strong
              mix={css({
                marginLeft: '8px',
                color: '#fff',
                background: 'var(--danger)',
                borderRadius: '4px',
                padding: '1px 6px',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              })}
            >
              stale
            </strong>
          ) : null}
        </span>
      )
    }
  },
)
