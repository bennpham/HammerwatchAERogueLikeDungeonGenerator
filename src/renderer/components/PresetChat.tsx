import React, { useEffect, useRef, useState } from 'react'
import { applyFullyUpgraded, parseParametersTxt, validateParameters } from '../../generator'
import type { DungeonParameters, ValidationIssue } from '../../generator'
import { buildRepairMessage, buildSystemPrompt } from '../../shared/llm/prompt'
import { LLM_PROVIDERS, effectiveModel, providerById } from '../../shared/llm/providers'
import { diffParams, expandShorthands, extractParametersBlock, fillPerFloorLists } from '../../shared/llm/reply'
import type { ParamChange } from '../../shared/llm/reply'
import type { ChatMessage, LlmConfig, LlmSettings } from '../../shared/llm/types'

interface PresetChatProps {
  /** The live form — the base every proposal is a patch on. */
  params: DungeonParameters
  config: LlmConfig
  onConfigChange: (config: LlmConfig) => void
  /** Same path as loading a preset: replaces the params and raises an undo toast. */
  onApply: (next: DungeonParameters, changedKeys: number) => void
  disabled?: boolean
}

/** What a model reply turned into: a proposed parameter set and how good it is. */
interface Proposal {
  params: DungeonParameters
  changes: ParamChange[]
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  unknownKeys: string[]
  applied: boolean
}

type Entry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; proposal?: Proposal; repaired?: boolean }
  | { kind: 'error'; text: string }

const toSettings = (config: LlmConfig): LlmSettings => ({
  provider: config.provider,
  models: config.models,
  customBaseUrl: config.customBaseUrl,
  hideIcon: config.hideIcon,
  configured: config.configured
})

/** Parses a reply's block on top of `base` and validates it; null when the reply has no block. */
function evaluate(reply: string, base: DungeonParameters, original: DungeonParameters): Proposal | null {
  const block = extractParametersBlock(reply)
  if (block === null) return null
  const expanded = expandShorthands(block)
  const parsed = parseParametersTxt(expanded.text, base)
  if (expanded.fullyUpgraded) parsed.params.playerTweaks = applyFullyUpgraded(parsed.params.playerTweaks)
  const filled = fillPerFloorLists(parsed.params)
  const validation = validateParameters(filled.params)
  return {
    params: filled.params,
    changes: diffParams(original, filled.params),
    errors: validation.errors,
    warnings: filled.note === null ? validation.warnings : [{ field: 'levels', message: filled.note }, ...validation.warnings],
    unknownKeys: parsed.unknownKeys,
    applied: false
  }
}

// a 99-floor proposal or a fully upgraded roster changes hundreds of lines
const MAX_CHANGES_SHOWN = 40

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The chat icon and its dialog. Strictly opt-in: opening it shows the setup
 * screen, and nothing touches the network until the user sends a message (or
 * presses "Refresh models"). The model only ever writes parameters.txt lines;
 * they enter the app through parseParametersTxt + validateParameters like an
 * imported file, and nothing is applied until the user clicks Apply.
 */
export function PresetChat({ params, config, onConfigChange, onApply, disabled }: PresetChatProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const listEnd = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'setup' | 'chat'>(config.configured ? 'chat' : 'setup')
  const [entries, setEntries] = useState<Entry[]>([])
  // raw user/assistant turns sent back to the model (the system prompt is rebuilt per send)
  const history = useRef<ChatMessage[]>([])
  // The newest proposal not yet applied. Follow-ups ("make it harder") patch
  // this, not the form, so they build on what the model already proposed —
  // which is what its own history says it did. Cleared on Apply and New chat.
  const pendingBase = useRef<DungeonParameters | null>(null)
  // set by Cancel; checked after a rate-limit wait, which main cannot abort
  const cancelled = useRef(false)
  const [input, setInput] = useState('')
  const [working, setWorking] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [draft, setDraft] = useState<LlmSettings>(toSettings(config))
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [setupNote, setSetupNote] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // the repair turn runs inside an async closure and needs the latest cooldown
  const cooldownUntilRef = useRef(0)
  cooldownUntilRef.current = cooldownUntil

  const provider = providerById(config.provider)
  const draftProvider = providerById(draft.provider)
  const remainingMs = Math.max(0, cooldownUntil - now)

  // tick only while a cooldown is running
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [cooldownUntil])

  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: 'end' })
  }, [entries, working])

  const open = () => {
    setDraft(toSettings(config))
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()

  const saveDraft = async (extra: Partial<LlmSettings> = {}) => {
    const saved = await window.api.llmSaveConfig({ ...draft, ...extra })
    onConfigChange(saved)
    return saved
  }

  const startChatting = async () => {
    const problem =
      draftProvider.needsKey && config.hasKey[draft.provider] !== true
        ? `${draftProvider.label} needs an API key first.`
        : draft.provider === 'custom' && draft.customBaseUrl.trim() === ''
          ? 'Enter a base URL for the custom provider.'
          : effectiveModel(draftProvider, draft.models[draft.provider]) === ''
            ? 'Enter a model name.'
            : ''
    if (problem !== '') {
      setSetupNote(problem)
      return
    }
    setSetupNote('')
    await saveDraft({ configured: true })
    setView('chat')
  }

  const saveKey = async (remove: boolean) => {
    const outcome = await window.api.llmSetKey(draft.provider, remove ? '' : keyInput)
    onConfigChange(outcome.config)
    setSetupNote(outcome.message)
    if (outcome.ok) setKeyInput('')
  }

  const refreshModels = async () => {
    // the main process reads the saved base URL, so persist the draft first
    await saveDraft()
    const outcome = await window.api.llmListModels(draft.provider)
    if (outcome.ok) {
      setModels(outcome.models)
      setSetupNote(`${outcome.models.length} models found.`)
    } else {
      setModels([])
      setSetupNote(outcome.message)
    }
  }

  const newChat = () => {
    history.current = []
    pendingBase.current = null
    setEntries([])
  }

  /** One request, honouring the provider's minimum gap (a repair turn waits it out). */
  const ask = async (messages: ChatMessage[], waitFor: number) => {
    if (waitFor > 0) {
      setWorking(`Waiting ${Math.ceil(waitFor / 1000)} s for the rate limit...`)
      await sleep(waitFor)
      if (cancelled.current) return { ok: false as const, message: 'Cancelled.', cancelled: true }
    }
    setWorking('Waiting for the model...')
    const result = await window.api.llmChat({
      provider: config.provider,
      model: effectiveModel(provider, config.models[config.provider]),
      messages
    })
    const wait = result.ok ? provider.minIntervalMs : (result.retryAfterMs ?? provider.minIntervalMs)
    if (wait > 0) {
      setCooldownUntil(Date.now() + wait)
      setNow(Date.now())
    }
    return result
  }

  const send = async () => {
    const text = input.trim()
    if (text === '' || working !== null || remainingMs > 0) return
    setInput('')
    setEntries((prev) => [...prev, { kind: 'user', text }])
    cancelled.current = false
    const base = pendingBase.current ?? params
    const system: ChatMessage = { role: 'system', content: buildSystemPrompt(base) }
    const turn: ChatMessage[] = [...history.current, { role: 'user', content: text }]
    try {
      const first = await ask([system, ...turn], 0)
      if (!first.ok) {
        setEntries((prev) => [...prev, { kind: 'error', text: first.message }])
        return
      }
      turn.push({ role: 'assistant', content: first.text })
      let proposal = evaluate(first.text, base, params)
      let shown = first.text
      let repaired = false

      // One automatic repair turn when the proposal is broken or names keys the parser dropped.
      if (proposal !== null && (proposal.errors.length > 0 || proposal.unknownKeys.length > 0)) {
        turn.push({ role: 'user', content: buildRepairMessage(proposal.errors, proposal.unknownKeys) })
        const wait = Math.max(0, cooldownUntilRef.current - Date.now())
        const second = await ask([system, ...turn], wait)
        if (second.ok) {
          turn.push({ role: 'assistant', content: second.text })
          // the repair is a patch on the first attempt, not on the form, so the fixes stack
          const fixed = evaluate(second.text, proposal.params, params)
          if (fixed !== null) {
            proposal = fixed
            shown = second.text
            repaired = true
          }
        } else {
          setEntries((prev) => [
            ...prev,
            { kind: 'assistant', text: first.text, proposal: proposal ?? undefined },
            { kind: 'error', text: `The automatic repair request failed: ${second.message}` }
          ])
          history.current = turn.slice(0, -1)
          if (proposal !== null) pendingBase.current = proposal.params
          return
        }
      }
      history.current = turn
      if (proposal !== null) pendingBase.current = proposal.params
      setEntries((prev) => [...prev, { kind: 'assistant', text: shown, proposal: proposal ?? undefined, repaired }])
    } finally {
      setWorking(null)
    }
  }

  const cancel = () => {
    cancelled.current = true
    void window.api.llmCancel()
  }

  const lastProposalIndex = entries.reduce((last, e, i) => (e.kind === 'assistant' && e.proposal ? i : last), -1)

  const apply = (index: number, proposal: Proposal) => {
    onApply(proposal.params, proposal.changes.length)
    pendingBase.current = null
    setEntries((prev) =>
      prev.map((e, i) => (i === index && e.kind === 'assistant' && e.proposal ? { ...e, proposal: { ...e.proposal, applied: true } } : e))
    )
    close()
  }

  const setHideIcon = async (hideIcon: boolean) => {
    const saved = await saveDraft({ hideIcon })
    setDraft(toSettings(saved))
    if (hideIcon) close()
  }

  const renderProposal = (index: number, proposal: Proposal) => {
    const blocked = proposal.errors.length > 0
    const latest = index === lastProposalIndex
    return (
      <div className="chat-proposal">
        <strong>
          {proposal.changes.length === 0
            ? 'No changes from your current settings'
            : `${proposal.changes.length} setting${proposal.changes.length === 1 ? '' : 's'} would change`}
        </strong>
        {proposal.changes.length > 0 && (
          <ul className="chat-changes">
            {proposal.changes.slice(0, MAX_CHANGES_SHOWN).map((c) => (
              <li key={c.key}>
                <code>{c.key}</code>
                <span className="chat-before">{c.before ?? '(unset)'}</span>
                <span aria-hidden="true">→</span>
                <span className="chat-after">{c.after ?? '(removed)'}</span>
              </li>
            ))}
            {proposal.changes.length > MAX_CHANGES_SHOWN && (
              <li className="chat-dim">…and {proposal.changes.length - MAX_CHANGES_SHOWN} more</li>
            )}
          </ul>
        )}
        {proposal.errors.length > 0 && (
          <div className="banner banner-error">
            <strong>Cannot be applied yet:</strong>
            <ul>
              {proposal.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
            <span>Ask the assistant to fix it, or adjust your request.</span>
          </div>
        )}
        {proposal.unknownKeys.length > 0 && (
          <div className="banner banner-warning">
            <strong>Ignored (not understood):</strong> {proposal.unknownKeys.join(', ')}
          </div>
        )}
        {proposal.warnings.length > 0 && !blocked && (
          <div className="banner banner-warning">
            <ul>
              {proposal.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          className="primary"
          disabled={blocked || proposal.applied || !latest || proposal.changes.length === 0 || disabled}
          onClick={() => apply(index, proposal)}
          title={latest ? undefined : 'Only the newest proposal can be applied'}
        >
          {proposal.applied ? 'Applied' : 'Apply to settings'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="preset-guide-button chat-button"
        aria-label="AI preset assistant"
        title="AI preset assistant (optional)"
        onClick={open}
      >
        💬
      </button>
      <dialog
        ref={dialog}
        className="preset-guide preset-chat"
        aria-labelledby="preset-chat-title"
        onClick={(e) => {
          if (e.target === dialog.current) close()
        }}
      >
        <div className="preset-guide-body">
          <div className="preset-guide-head">
            <h2 id="preset-chat-title">{view === 'setup' ? 'AI preset assistant' : 'Describe your campaign'}</h2>
            <div className="chat-head-actions">
              {view === 'chat' && (
                <>
                  <button type="button" onClick={newChat} disabled={working !== null}>
                    New chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(toSettings(config))
                      setView('setup')
                    }}
                    aria-label="Assistant settings"
                    title="Assistant settings"
                  >
                    ⚙
                  </button>
                </>
              )}
              <button type="button" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          {view === 'setup' ? (
            <div className="chat-setup">
              <p className="preset-guide-note">
                Optional. Describe a campaign in plain words and an AI model fills in the settings for you to review.
                Nothing is sent anywhere until you send a message.
              </p>
              {config.keyStorage === 'weak' && !bannerDismissed && (
                <div className="banner banner-warning">
                  No system keyring was found, so saved API keys are only weakly protected on this computer.
                  <button type="button" onClick={() => setBannerDismissed(true)}>Dismiss</button>
                </div>
              )}
              {config.keyStorage === 'unavailable' && (
                <div className="banner banner-warning">
                  This system cannot encrypt API keys, so keys cannot be saved. Keyless providers still work.
                </div>
              )}
              <div className="chat-providers" role="radiogroup" aria-label="Provider">
                {LLM_PROVIDERS.map((p) => (
                  <label key={p.id} className={draft.provider === p.id ? 'chat-provider selected' : 'chat-provider'}>
                    <input
                      type="radio"
                      name="llm-provider"
                      checked={draft.provider === p.id}
                      onChange={() => {
                        setDraft({ ...draft, provider: p.id })
                        setModels([])
                        setSetupNote('')
                      }}
                    />
                    <span>
                      <strong>{p.label}</strong>
                      <span className="chat-dim">{p.blurb}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="chat-privacy">{draftProvider.privacyNote}</p>

              {draft.provider === 'custom' && (
                <label className="field">
                  <span className="field-label">Base URL</span>
                  <input
                    type="text"
                    placeholder="http://localhost:1234/v1"
                    value={draft.customBaseUrl}
                    onChange={(e) => setDraft({ ...draft, customBaseUrl: e.target.value })}
                  />
                </label>
              )}

              {(draftProvider.needsKey || draftProvider.optionalKey) && (
                <div className="field">
                  <span className="field-label">
                    API key{draftProvider.optionalKey ? ' (optional)' : ''}{' '}
                    {config.hasKey[draft.provider] && <span className="chat-key-saved">saved</span>}
                  </span>
                  <div className="path-row">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={config.hasKey[draft.provider] ? 'Saved — paste a new key to replace it' : 'Paste your key'}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                    />
                    <button type="button" disabled={keyInput.trim() === ''} onClick={() => void saveKey(false)}>
                      Save key
                    </button>
                    {config.hasKey[draft.provider] && (
                      <button type="button" onClick={() => void saveKey(true)}>
                        Remove
                      </button>
                    )}
                  </div>
                  {draftProvider.signupUrl && (
                    <a href={draftProvider.signupUrl} target="_blank" rel="noreferrer">
                      Get a free key
                    </a>
                  )}
                </div>
              )}

              <div className="field">
                <span className="field-label">Model</span>
                <div className="path-row">
                  <input
                    type="text"
                    list="llm-models"
                    placeholder={draftProvider.defaultModel || 'model name'}
                    value={draft.models[draft.provider] ?? ''}
                    onChange={(e) => setDraft({ ...draft, models: { ...draft.models, [draft.provider]: e.target.value } })}
                  />
                  <datalist id="llm-models">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {draftProvider.modelsPath !== null && (
                    <button type="button" onClick={() => void refreshModels()} title="Ask the provider which models it offers (sends a request)">
                      Refresh models
                    </button>
                  )}
                </div>
              </div>

              {setupNote !== '' && <p className="chat-note">{setupNote}</p>}

              <label className="checkbox">
                <input type="checkbox" checked={draft.hideIcon} onChange={(e) => void setHideIcon(e.target.checked)} />
                Hide the chat icon (turn it back on under Hammerwatch install folder)
              </label>

              <div className="chat-setup-actions">
                <button type="button" className="primary" onClick={() => void startChatting()}>
                  {config.configured ? 'Save and chat' : 'Enable and start'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="preset-guide-note">
                {provider.label}: {provider.privacyNote} Proposals are only previews until you click Apply.
              </p>
              <div className="chat-log" aria-live="polite">
                {entries.length === 0 && (
                  <p className="chat-dim">
                    Try: "4 icy floors, a boss on the last one, lots of traps". With a campaign loaded, ask for tweaks
                    like "make it harder" and only those settings change.
                  </p>
                )}
                {entries.map((entry, i) =>
                  entry.kind === 'user' ? (
                    <div key={i} className="chat-msg chat-user">{entry.text}</div>
                  ) : entry.kind === 'error' ? (
                    <div key={i} className="banner banner-error">{entry.text}</div>
                  ) : (
                    <div key={i} className="chat-msg chat-assistant">
                      <div className="chat-text">{entry.text}</div>
                      {entry.repaired && <p className="chat-dim">The first answer had problems, so one automatic fix was requested.</p>}
                      {entry.proposal && renderProposal(i, entry.proposal)}
                    </div>
                  )
                )}
                {working !== null && <div className="chat-dim">{working}</div>}
                <div ref={listEnd} />
              </div>
              <form
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
              >
                <textarea
                  rows={2}
                  placeholder="Describe the campaign you want..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                {working !== null ? (
                  <button type="button" onClick={cancel}>Cancel</button>
                ) : (
                  <button type="submit" className="primary" disabled={input.trim() === '' || remainingMs > 0}>
                    {remainingMs > 0 ? `Wait ${Math.ceil(remainingMs / 1000)} s` : 'Send'}
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
