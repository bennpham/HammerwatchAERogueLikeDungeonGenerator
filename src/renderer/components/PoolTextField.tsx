import React, { useRef, useState } from 'react'

interface PoolTextFieldProps {
  label: string
  /** The pool as it stands, in order. */
  value: string[]
  onCommit: (next: string[]) => void
  /**
   * Drop repeated entries. On for a boss wave, where max counts, spawn modes
   * and interval overrides are all keyed by monster and a repeat would silently
   * spawn the same actor twice; off for a dungeon pool, where repeating a type
   * is how you weight it.
   */
  dedupe?: boolean
  hint?: string
}

/** Splits a pasted or typed list into pool entries. Never throws — bad entries are left for validation to report. */
function parsePool(text: string, dedupe: boolean): string[] {
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  return dedupe ? [...new Set(entries)] : entries
}

/**
 * The comma-separated view of a monster pool: the fast way to move a pool
 * between levels or boss tiers, and the escape hatch for anything the checkbox
 * grid cannot express.
 *
 * Edits are held as a draft and committed on blur or Enter rather than re-parsed
 * per keystroke — parsing live eats the comma you just typed, because it round
 * trips through a list that has no empty trailing entry.
 */
export function PoolTextField({ label, value, onCommit, dedupe = false, hint }: PoolTextFieldProps) {
  const serialized = value.join(',')
  const input = useRef<HTMLInputElement>(null)
  // null means "show the committed value"; a string is an edit in progress. The
  // draft is dropped whenever the pool changes underneath it — ticking a
  // checkbox must not leave a stale line of text sitting in the box.
  const [draft, setDraft] = useState<string | null>(null)
  const [lastSerialized, setLastSerialized] = useState(serialized)
  if (lastSerialized !== serialized) {
    setLastSerialized(serialized)
    setDraft(null)
  }

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const next = parsePool(draft, dedupe)
    if (next.join(',') !== serialized) onCommit(next)
  }

  const copy = () => {
    // A packaged renderer runs from file://, which Chromium does not treat as a
    // secure context, so the async clipboard API can be missing entirely.
    // Selecting the text and asking the document to copy works either way.
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(serialized)
      return
    }
    input.current?.select()
    document.execCommand('copy')
  }

  return (
    <label className="pool-raw">
      <span className="pool-raw-head">
        {label}
        <button type="button" onClick={copy} title="Copy this list to the clipboard">
          Copy
        </button>
      </span>
      <input
        ref={input}
        type="text"
        value={draft ?? serialized}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setDraft(null)
          }
        }}
      />
      {hint && <span className="pool-raw-hint">{hint}</span>}
    </label>
  )
}
