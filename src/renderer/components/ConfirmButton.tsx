import React, { useId, useRef } from 'react'

interface ConfirmButtonProps {
  /** the header button's text */
  label: string
  /** `danger` is red (Reset all), `warning` orange (the per-tab Reset) */
  variant: 'danger' | 'warning'
  /** the confirm dialog's heading, e.g. "Reset everything?" */
  heading: string
  /** what will be lost — the dialog's main paragraph */
  body: React.ReactNode
  /** the confirming button's text, e.g. "Reset everything" */
  confirmLabel: string
  title?: string
  disabled?: boolean
  onConfirm: () => void
}

/**
 * A header button that asks before it acts — both Reset buttons. Even a
 * one-tab reset can throw away a lot of careful editing, so neither fires on a
 * single click. The confirm is a native `<dialog>` like the other header
 * dialogs: Escape and a backdrop click both cancel, and Cancel holds the
 * initial focus so a stray Enter cannot confirm. The caller's toast still
 * offers an Undo afterwards.
 */
export function ConfirmButton({
  label,
  variant,
  heading,
  body,
  confirmLabel,
  title,
  disabled,
  onConfirm
}: ConfirmButtonProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = () => dialog.current?.close()
  // two of these share the header, so the aria ids must not collide
  const id = useId()

  return (
    <>
      <button
        type="button"
        className={variant}
        disabled={disabled}
        title={title}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="preset-guide confirm-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-text`}
        onClick={(e) => {
          // a click on the dialog element itself is a click on the backdrop
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <h2 id={`${id}-title`}>{heading}</h2>
          <p id={`${id}-text`}>{body}</p>
          <p className="preset-guide-note">Your Hammerwatch folder and other settings are kept.</p>
          <div className="confirm-actions">
            <button type="button" autoFocus onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className={variant}
              onClick={() => {
                close()
                onConfirm()
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
