import { on, ref, type Handle } from 'remix/component'

import type { ActionKind } from '../shared/docs.ts'
import { detailsId, type Ref } from '../shared/refs.ts'
import type { ActionInput, Store } from '../store/index.ts'
import { DetailsPanel } from './details.tsx'

export interface RefInfo extends Ref {
  label: string // "vm 38"
  href: string // on GitHub
}

export interface RowControlsProps {
  rowKey: string
  issue: RefInfo | null
  pr: RefInfo | null
  merge: { href: string; prominent: boolean } | null // the PR on GitHub, when it's open
  store: Store
  /** Show the GitHub details from the start (a layout's detail pane). */
  detailsOpen?: boolean
  /** The row's move, when the owner can mark it resolved (it asks something, and isn't resolved). */
  resolvable?: string | null
}

const KIND_LABEL: Record<ActionKind, string> = {
  'close-pr': 'Close / reject PR',
  'close-issue': 'Close issue',
  prioritize: 'Prioritize',
  instruct: 'Instruction',
  resolve: 'Resolve…',
}

type Values = Pick<ActionInput, 'reason' | 'stateReason' | 'priority' | 'text'>

/**
 * A row's buttons: merge on GitHub, its GitHub details, and the actions the owner can record. An
 * action only records a line for the manager to carry out: pick one, fill it in, then confirm.
 */
export function RowControls(handle: Handle<RowControlsProps>) {
  let expanded = handle.props.detailsOpen ?? false
  let open: ActionKind | null = null
  let confirming: Values | null = null
  let pending = false
  let error: string | null = null
  let flash: string | null = null

  function choose(kind: ActionKind) {
    resolving = false
    open = open === kind ? null : kind
    confirming = null
    error = null
    flash = null
    handle.update()
  }

  function summary(kind: ActionKind, v: Values): string {
    let { issue, pr, rowKey } = handle.props
    let reason = v.reason ? `, reason: “${v.reason}”` : ''
    switch (kind) {
      case 'close-pr':
        return `Close PR ${pr?.label}${reason}`
      case 'close-issue':
        return `Close issue ${issue?.label} as ${v.stateReason === 'not_planned' ? 'not planned' : 'completed'}${reason}`
      case 'prioritize':
        return `Label issue ${issue?.fullName}#${issue?.number} ${v.priority}`
      case 'instruct':
        return `Instruction for ${rowKey}: “${v.text}”`
      case 'resolve':
        return `Resolved: ${handle.props.resolvable ?? ''}`
    }
  }

  async function record() {
    if (!open || !confirming) return
    let { rowKey, issue, pr, store } = handle.props
    pending = true
    handle.update()
    try {
      let id = await store.record({ key: rowKey, kind: open, issue, pr, ...confirming })
      flash =
        store.host === 'artifact'
          ? `Recorded ${id}. The manager picks it up at the next sync.`
          : `Recorded ${id} for the manager.`
      open = null
      confirming = null
      error = null
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
      confirming = null
      if (!store.canRecord()) open = null
    }
    pending = false
    handle.update()
  }

  // Resolve opens a small confirm with an optional note for the manager; only Mark resolved records
  // it, and then the row moves to Resolved.
  let resolving = false
  let resolveNote = ''

  async function resolve() {
    let { rowKey, issue, pr, store, resolvable } = handle.props
    if (!resolvable) return
    pending = true
    error = null
    handle.update()
    try {
      await store.record({ key: rowKey, kind: 'resolve', issue, pr, move: resolvable, ...(resolveNote.trim() ? { reason: resolveNote.trim() } : {}) })
      resolving = false
      resolveNote = ''
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    pending = false
    handle.update()
  }

  return () => {
    let { issue, pr, rowKey, merge, store, resolvable } = handle.props
    let kinds: ActionKind[] = store.canRecord()
      ? [...(pr ? (['close-pr'] as const) : []), ...(issue ? (['close-issue', 'prioritize'] as const) : []), 'instruct']
      : []
    let ids = [...(pr ? [detailsId(pr.repo, 'pull', pr.number)] : []), ...(issue ? [detailsId(issue.repo, 'issues', issue.number)] : [])]

    return (
      <>
        <div class="controls">
          {merge ? (
            <a
              class={merge.prominent ? 'btn merge big' : 'btn merge'}
              href={merge.href}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens the PR on GitHub; merge it there. Nothing is recorded."
            >
              Merge on GitHub ↗
            </a>
          ) : null}
          {resolvable && store.canRecord() ? (
            <button
              type="button"
              class="resolve"
              aria-expanded={resolving}
              disabled={pending}
              title="Tell the manager this move is handled; the row moves to Resolved. The manager reopens it if it still needs you."
              mix={on('click', () => {
                resolving = !resolving
                open = null
                confirming = null
                error = null
                handle.update()
              })}
            >
              {KIND_LABEL.resolve}
            </button>
          ) : null}
          {ids.length ? (
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
            <button key={kind} type="button" aria-pressed={open === kind} mix={on('click', () => choose(kind))}>
              {KIND_LABEL[kind]}
            </button>
          ))}
          {flash ? <span class="flash">{flash}</span> : null}
        </div>

        {resolving && resolvable ? (
          <div class="confirm resolve-confirm" role="group" aria-label="Resolve this move">
            <span>
              Mark <strong>{resolvable}</strong> as resolved? The row moves to Resolved; the manager checks it, and reopens it if it
              still needs you.
            </span>
            <input
              type="text"
              id={`resolve-note-${rowKey}`}
              placeholder="Note for the manager (optional): what you did"
              aria-label="Note for the manager"
              value={resolveNote}
              mix={[
                ref((el: HTMLInputElement) => el.focus()),
                on('input', (event) => {
                  resolveNote = (event.currentTarget as HTMLInputElement).value
                }),
                on('keydown', (event) => {
                  if (event.key === 'Enter') void resolve()
                  if (event.key === 'Escape') {
                    resolving = false
                    handle.update()
                  }
                }),
              ]}
            />
            <button type="button" class="primary" disabled={pending} mix={on('click', resolve)}>
              {pending ? 'Recording…' : 'Mark resolved'}
            </button>
            <button
              type="button"
              disabled={pending}
              mix={on('click', () => {
                resolving = false
                handle.update()
              })}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {open ? (
          <ActionForm
            key={open}
            kind={open}
            rowKey={rowKey}
            locked={confirming !== null}
            onSubmit={(values) => {
              confirming = values
              error = null
              handle.update()
            }}
            onCancel={() => choose(open!)}
          />
        ) : null}
        {open && confirming && (open === 'close-pr' || open === 'close-issue') ? (
          <CloseDialog
            kind={open}
            target={open === 'close-pr' ? `PR ${pr?.fullName}#${pr?.number}` : `issue ${issue?.fullName}#${issue?.number}`}
            values={confirming}
            pending={pending}
            onConfirm={record}
            onCancel={() => {
              if (pending) return
              confirming = null
              handle.update()
            }}
          />
        ) : open && confirming ? (
          <div class="confirm" role="alertdialog" aria-label="Confirm action">
            <span>
              Record for the manager: <strong>{summary(open, confirming)}</strong>?
            </span>
            <button type="button" class="primary" disabled={pending} mix={[on('click', record), ref((b: HTMLButtonElement) => b.focus())]}>
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
        ) : null}
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}

        {expanded ? (
          <div class="details">
            {ids.map((id) => (
              <DetailsPanel key={id} id={id} store={store} />
            ))}
          </div>
        ) : null}
      </>
    )
  }
}

function ActionForm(
  handle: Handle<{
    kind: ActionKind
    rowKey: string
    locked: boolean
    onSubmit: (values: Values) => void
    onCancel: () => void
  }>,
) {
  return () => {
    let { kind, rowKey, locked, onSubmit, onCancel } = handle.props
    let id = (s: string) => `f-${rowKey.replace(/[^\w-]/g, '_')}-${s}`
    let reason = (
      <input type="text" name="reason" id={id('reason')} aria-label="Reason" placeholder="Reason (optional), posted with the close" />
    )
    return (
      <form
        class="act"
        hidden={locked}
        mix={[
          ref((form: HTMLFormElement) => form.querySelector<HTMLElement>('input[type=text], textarea')?.focus()),
          on('submit', (event) => {
            event.preventDefault()
            let form = event.currentTarget
            if (!form.reportValidity()) return
            let data = new FormData(form)
            let value = (name: string) => String(data.get(name) ?? '').trim() || undefined
            onSubmit({
              reason: value('reason'),
              stateReason: kind === 'close-issue' ? (value('stateReason') === 'not_planned' ? 'not_planned' : 'completed') : undefined,
              priority: kind === 'prioritize' ? (value('priority') === 'priority/critical' ? 'priority/critical' : 'priority/high') : undefined,
              text: value('text'),
            })
          }),
        ]}
      >
        {kind === 'close-pr' ? reason : null}
        {kind === 'close-issue' ? (
          <>
            <div class="choices" role="radiogroup" aria-label="Close as">
              <label>
                <input type="radio" name="stateReason" value="completed" id={id('completed')} defaultChecked /> completed
              </label>
              <label>
                <input type="radio" name="stateReason" value="not_planned" id={id('notplanned')} /> not planned
              </label>
            </div>
            {reason}
          </>
        ) : null}
        {kind === 'prioritize' ? (
          <div class="choices" role="radiogroup" aria-label="Priority">
            <label>
              <input type="radio" name="priority" value="priority/high" id={id('high')} defaultChecked /> priority/high
            </label>
            <label>
              <input type="radio" name="priority" value="priority/critical" id={id('critical')} /> priority/critical
            </label>
          </div>
        ) : null}
        {kind === 'instruct' ? (
          <textarea
            name="text"
            id={id('text')}
            rows={3}
            required
            aria-label="Instruction"
            placeholder={`What should the manager do about ${rowKey}?`}
          />
        ) : null}
        <div class="row">
          <button type="submit" class="primary">
            {KIND_LABEL[kind]}…
          </button>
          <button type="button" mix={on('click', onCancel)}>
            Cancel
          </button>
        </div>
      </form>
    )
  }
}

/**
 * A real modal for closing a PR or issue: showModal() makes the rest of the page inert, Escape or
 * Cancel closes it with nothing recorded, and Cancel has the first focus.
 */
function CloseDialog(
  handle: Handle<{
    kind: 'close-pr' | 'close-issue'
    target: string
    values: Values
    pending: boolean
    onConfirm: () => void
    onCancel: () => void
  }>,
) {
  return () => {
    let { kind, target, values, pending, onConfirm, onCancel } = handle.props
    let question =
      kind === 'close-pr'
        ? `Close ${target} without merging?`
        : `Close ${target} as ${values.stateReason === 'not_planned' ? 'not planned' : 'completed'}?`
    let consequence =
      kind === 'close-pr' ? 'Its branch is kept, and the PR can be reopened.' : 'Its labels and comments stay, and it can be reopened.'
    return (
      <dialog
        aria-labelledby="close-dialog-title"
        mix={[
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
            event.preventDefault()
            let i = buttons.indexOf(document.activeElement as HTMLButtonElement)
            buttons[(i + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus()
          }),
        ]}
      >
        <div class="top" />
        <div class="in">
          <h2 id="close-dialog-title">{question}</h2>
          <p>{consequence}</p>
          <p>
            {values.reason ? (
              <>
                Reason, posted with it: <strong>“{values.reason}”</strong>
              </>
            ) : (
              <span class="small">No reason given.</span>
            )}
          </p>
          <p class="small">This records the action; the manager carries it out on GitHub.</p>
          <div class="buttons">
            <button type="button" data-cancel disabled={pending} mix={on('click', onCancel)}>
              Cancel
            </button>
            <button type="button" class="danger" disabled={pending} mix={on('click', onConfirm)}>
              {pending ? 'Recording…' : kind === 'close-pr' ? 'Close PR' : 'Close issue'}
            </button>
          </div>
        </div>
      </dialog>
    )
  }
}
