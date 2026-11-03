import { clientEntry, css, Frame, on, ref, type Handle } from 'remix/component'

export interface RefProps {
  label: string // "vm 38"
  fullName: string // "discobox-ai/vm"
  number: number
  href: string // GitHub URL
  detailsSrc: string // this site's details frame route
}

export interface RowControlsProps {
  rowKey: string
  issue: RefProps | null
  pr: RefProps | null
  merge: { href: string; prominent: boolean } | null // the PR on GitHub, when it's open
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
        <div mix={css({ display: 'grid', gap: '8px', gridTemplateColumns: 'minmax(0, 1fr)' })}>
          <div mix={css({ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' })}>
            {handle.props.merge ? (
              <a
                class={handle.props.merge.prominent ? 'btn merge-prominent' : 'btn'}
                href={handle.props.merge.href}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens the PR on GitHub; merge it there. Nothing is recorded."
              >
                Merge on GitHub ↗
              </a>
            ) : null}
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
              {confirming && isDestructive(open) ? (
                <DestructiveDialog
                  kind={open}
                  target={open === 'close-pr' ? `PR ${pr?.fullName}#${pr?.number}` : `issue ${issue?.fullName}#${issue?.number}`}
                  form={confirming}
                  pending={pending}
                  onCancel={() => {
                    if (pending) return
                    confirming = null
                    handle.update()
                  }}
                />
              ) : confirming ? (
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
                  <button type="submit" class="primary" disabled={pending}>
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
            <div mix={css({ display: 'grid', gap: '12px', gridTemplateColumns: 'minmax(0, 1fr)' })}>
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

function isDestructive(kind: Kind | null): kind is 'close-pr' | 'close-issue' {
  return kind === 'close-pr' || kind === 'close-issue'
}

/**
 * A real modal for closing a PR or issue: showModal() makes the rest of the page inert (focus is
 * trapped), Escape or Cancel closes it with nothing recorded, and Cancel has the initial focus.
 */
function DestructiveDialog(
  handle: Handle<{
    kind: 'close-pr' | 'close-issue'
    target: string
    form: FormData
    pending: boolean
    onCancel: () => void
  }>,
) {
  return () => {
    let { kind, target, form, pending, onCancel } = handle.props
    let reason = String(form.get('reason') ?? '').trim()
    let notPlanned = form.get('stateReason') === 'not_planned'
    let question =
      kind === 'close-pr'
        ? `Close ${target} without merging?`
        : `Close ${target} as ${notPlanned ? 'not planned' : 'completed'}?`
    let consequence =
      kind === 'close-pr'
        ? 'Its branch is kept, and the PR can be reopened.'
        : 'Its labels and comments stay, and it can be reopened.'
    let label = kind === 'close-pr' ? 'Close PR' : 'Close issue'
    return (
      <dialog
        aria-labelledby="destructive-dialog-title"
        mix={[
          dialogStyle,
          ref((node: HTMLDialogElement) => {
            if (!node.open) node.showModal()
            node.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
          }),
          on('cancel', (event) => {
            event.preventDefault()
            onCancel()
          }),
          // showModal() makes the page inert, but Tab can still leave for the browser's own UI;
          // wrap it so focus stays on the dialog's buttons.
          on('keydown', (event) => {
            if (event.key !== 'Tab') return
            let buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
            if (!buttons.length) return
            let first = buttons[0]
            let last = buttons[buttons.length - 1]
            let active = document.activeElement
            if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
              event.preventDefault()
              first.focus()
            }
          }),
        ]}
      >
        <h2 id="destructive-dialog-title" mix={css({ margin: '0 0 8px', fontSize: '17px' })}>
          {question}
        </h2>
        <p mix={css({ margin: '0 0 8px' })}>{consequence}</p>
        <p mix={css({ margin: '0 0 8px' })}>
          {reason ? (
            <>
              Reason, posted with it: <strong>“{reason}”</strong>
            </>
          ) : (
            <span mix={css({ color: 'var(--muted)' })}>No reason given.</span>
          )}
        </p>
        <p mix={css({ margin: '0 0 16px', fontSize: '12px', color: 'var(--muted)' })}>
          This records the action; the manager carries it out on GitHub.
        </p>
        <div mix={css({ display: 'flex', justifyContent: 'flex-end', gap: '8px' })}>
          <button type="button" data-cancel disabled={pending} mix={on('click', () => onCancel())}>
            Cancel
          </button>
          <button type="submit" class="danger" disabled={pending}>
            {pending ? 'Recording…' : label}
          </button>
        </div>
      </dialog>
    )
  }
}

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

const dialogStyle = css({
  maxWidth: 'min(32rem, calc(100vw - 32px))',
  border: '1px solid var(--border)',
  borderTop: '4px solid var(--danger)',
  borderRadius: '10px',
  padding: '20px 22px',
  background: 'var(--card)',
  color: 'var(--fg)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
})
