import React from 'react'

interface InfoTipProps {
  /** The full explanation, shown on hover and to screen readers. */
  text: string
}

/** A small (i) marker that carries a longer explanation than the line it sits on. */
export function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text} title={text}>
      i
    </span>
  )
}
