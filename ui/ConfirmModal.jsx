import React, { useEffect, useRef } from 'react'

export function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel }) {
  // The mobius app sandbox lacks allow-modals, so this is a real in-app dialog,
  // not a native confirm(). That makes it OUR job to honor the dialog a11y
  // contract: while it is open, keyboard focus must stay inside it, Escape must
  // cancel, and on close focus must return to whatever opened it — otherwise a
  // keyboard or screen-reader user is stranded behind an invisible scrim.
  const cancelRef = useRef(null)
  const dialogRef = useRef(null)
  const titleId = useRef(`wk-confirm-title-${Math.random().toString(36).slice(2, 9)}`).current

  useEffect(() => {
    // Restore focus to the opener on unmount so closing returns the user exactly
    // where they were; capture it before we steal focus into the dialog.
    const opener = document.activeElement
    cancelRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      // Tab-trap: keep focus cycling among the dialog's focusable controls so it
      // can never escape to the (inert, scrim-covered) page behind the modal.
      const focusable = dialogRef.current?.querySelectorAll(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [onCancel])

  return (
    <div className="wk-modal-scrim" onClick={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="wk-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 className="wk-modal-title" id={titleId}>{title}</h3>
        <p className="wk-modal-body">{body}</p>
        <div className="wk-modal-btns">
          <button ref={cancelRef} className="wk-btn-secondary" onClick={onCancel} aria-label="Cancel">Cancel</button>
          <button
            className="wk-btn-secondary is-danger"
            onClick={onConfirm}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
