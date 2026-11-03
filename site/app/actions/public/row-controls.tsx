import { clientEntry, css, Frame, on, type Handle } from 'remix/component'

export interface RefProps {
  label: string // "vm 38"
  href: string // GitHub URL
  detailsSrc: string // this site's details frame route
}

export interface RowControlsProps {
  rowKey: string
  issue: RefProps | null
  pr: RefProps | null
  recordHref: string
  boardFrame: string
}

type Kind = 'close-pr' | 'close-issue' | 'prioritize' | 'instruct'

const KIND_LABEL: Record<Kind, string> = {
  'close-pr': 'Close / reject PR',
  'close-issue': 'Close issue',
  prioritize: 'Prioritize',
  instruct: 'Instruction',
}

/**
 * The row's expand toggle (GitHub details, loaded into frames) and its action buttons. An action
 * only records a line for the manager to carry out: pick one, fill it in, then confirm.
 */
export const RowControls = clientEntry(
  import.meta.url,
  function RowControls(handle: Handle<RowControlsProps>) {
    let expanded = false
    let open: Kind | null = null
    let confirming: FormData | null = null
    let summary = ''
    let pending = false
    let error: string | null = null
    let flash: string | null = null

    function choose(kind: Kind) {
      open = open === kind ? null : kind
      confirming = null
      error = null
      flash = null
      handle.update()
    }

    function describe(form: FormData): string {
      let kind = form.get('kind') as Kind
      let { issue, pr } = handle.props
      let reason = String(form.get('reason') ?? '').trim()
      let withReason = reason ? `, reason: “${reason}”` : ''
      switch (kind) {
        case 'close-pr':
          return `Close PR ${pr?.label}${withReason}`
        case 'close-issue':
          return `Close issue ${issue?.label} as ${form.get('stateReason') === 'not_planned' ? 'not planned' : 'completed'}${withReason}`
        case 'prioritize':
          return `Label issue ${issue?.label} ${form.get('priority')}`
        case 'instruct':
          return `Instruction for ${handle.props.rowKey}: “${String(form.get('text') ?? '').trim()}”`
      }
    }

    return () => {
      let { issue, pr, recordHref, rowKey } = handle.props
      let kinds: Kind[] = [
        ...(pr ? (['close-pr'] as Kind[]) : []),
        ...(issue ? (['close-issue', 'prioritize'] as Kind[]) : []),
        'instruct',
      ]

      return (
        <div mix={css({ display: 'grid', gap: '8px' })}>
          <div mix={css({ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' })}>
            {issue || pr ? (
              <button
                type="button"
                aria-expanded={expanded}
                mix={on('click', () => {
                  expanded = !expanded
                  handle.update()
                })}
              >
                {expanded ? '▾ Hide details' : '▸ Details'}
              </button>
            ) : null}
            {kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={open === kind}
                style={open === kind ? { borderColor: 'var(--accent)', background: 'var(--accent-bg)' } : undefined}
                mix={on('click', () => choose(kind))}
              >
                {KIND_LABEL[kind]}
              </button>
            ))}
            {flash ? <span mix={css({ color: 'var(--ok)' })}>{flash}</span> : null}
          </div>

          {open ? (
            <form
              key={open}
              action={recordHref}
              method="post"
              mix={[
                formStyle,
                on('submit', async (event, signal) => {
                  event.preventDefault()
                  let form = event.currentTarget
                  if (!confirming) {
                    if (!form.reportValidity()) return
                    confirming = new FormData(form)
                    summary = describe(confirming)
                    error = null
                    handle.update()
                    return
                  }
                  pending = true
                  handle.update()
                  try {
                    let res = await fetch(recordHref, {
                      method: 'POST',
                      body: confirming,
                      headers: { Accept: 'application/json' },
                      signal,
                    })
                    let body = await res.json().catch(() => ({}))
                    if (signal.aborted) return
                    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
                    flash = `Recorded ${body.action?.id ?? ''} for the manager.`
                    open = null
                    confirming = null
                  } catch (caught) {
                    if (signal.aborted) return
                    error = caught instanceof Error ? caught.message : String(caught)
                  }
                  pending = false
                  handle.update()
                  await handle.frames.get(handle.props.boardFrame)?.reload()
                }),
              ]}
            >
              <input type="hidden" name="key" value={rowKey} />
              <input type="hidden" name="kind" value={open} />
              <fieldset disabled={confirming !== null} mix={css({ border: 0, padding: 0, margin: 0, display: 'grid', gap: '8px' })}>
                {open === 'close-pr' ? (
                  <ReasonField placeholder="Reason (optional), posted with the close" />
                ) : null}
                {open === 'close-issue' ? (
                  <>
                    <div mix={css({ display: 'flex', gap: '16px' })}>
                      <label>
                        <input type="radio" name="stateReason" value="completed" defaultChecked /> completed
                      </label>
                      <label>
                        <input type="radio" name="stateReason" value="not_planned" /> not planned
                      </label>
                    </div>
                    <ReasonField placeholder="Reason (optional), posted with the close" />
                  </>
                ) : null}
                {open === 'prioritize' ? (
                  <div mix={css({ display: 'flex', gap: '16px' })}>
                    <label>
                      <input type="radio" name="priority" value="priority/high" defaultChecked /> priority/high
                    </label>
                    <label>
                      <input type="radio" name="priority" value="priority/critical" /> priority/critical
                    </label>
                  </div>
                ) : null}
                {open === 'instruct' ? (
                  <textarea name="text" rows={3} required placeholder={`What should the manager do about ${rowKey}?`} />
                ) : null}
              </fieldset>
              {confirming ? (
                <div
                  role="alertdialog"
                  aria-label="Confirm action"
                  mix={css({
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'var(--warn-bg)',
                    border: '1px solid var(--move-border)',
                  })}
                >
                  <span mix={css({ flex: '1 1 16rem' })}>
                    Record for the manager: <strong>{summary}</strong>?
                  </span>
                  <button type="submit" class={open === 'instruct' || open === 'prioritize' ? 'primary' : 'danger'} disabled={pending}>
                    {pending ? 'Recording…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    mix={on('click', () => {
                      confirming = null
                      handle.update()
                    })}
                  >
                    Back
                  </button>
                </div>
              ) : (
                <div mix={css({ display: 'flex', gap: '8px' })}>
                  <button type="submit" class="primary">
                    {KIND_LABEL[open]}…
                  </button>
                  <button type="button" mix={on('click', () => choose(open!))}>
                    Cancel
                  </button>
                </div>
              )}
              {error ? <p role="alert" mix={css({ margin: 0, color: 'var(--danger)' })}>{error}</p> : null}
            </form>
          ) : null}

          {expanded ? (
            <div mix={css({ display: 'grid', gap: '12px' })}>
              {pr ? (
                <Frame src={pr.detailsSrc} fallback={<Loading what={`PR ${pr.label}`} />} />
              ) : null}
              {issue ? (
                <Frame src={issue.detailsSrc} fallback={<Loading what={`issue ${issue.label}`} />} />
              ) : null}
            </div>
          ) : null}
        </div>
      )
    }
  },
)

function ReasonField(handle: Handle<{ placeholder: string }>) {
  return () => <input type="text" name="reason" placeholder={handle.props.placeholder} />
}

function Loading(handle: Handle<{ what: string }>) {
  return () => (
    <p mix={css({ margin: 0, color: 'var(--muted)', fontStyle: 'italic' })}>Loading {handle.props.what} from GitHub…</p>
  )
}

const formStyle = css({
  display: 'grid',
  gap: '8px',
  padding: '10px',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  background: 'var(--bg)',
})
