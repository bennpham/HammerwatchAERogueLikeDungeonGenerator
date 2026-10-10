import React, { useState } from 'react'
import {
  SHOP_PRICE_MAX,
  EXTRA_LIFE_UPGRADES,
  STAT_GROUPS,
  applyCostPolicy,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlock,
  applySkillUnlocks,
  applyStatFactor,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  resetQuickSetup,
  totalShopCost,
  SKILL_UNLOCKS,
  TWEAK_BASELINE
} from '../../generator'
import type { CostPolicy, PlayerTweaks, StatGroupId } from '../../generator'
import { BoolField, CurveField, Subsection, ToggleGroup } from './fields'

interface QuickSetupProps {
  tweaks: PlayerTweaks
  onChange: (tweaks: PlayerTweaks) => void
}

/** Skill flags grouped by the class that owns them, in baseline order. */
const SKILLS_BY_CLASS = ((): Array<{ fileId: string; label: string; flags: string[] }> => {
  const order: string[] = []
  const flags = new Map<string, string[]>()
  for (const unlock of SKILL_UNLOCKS) {
    if (!flags.has(unlock.fileId)) {
      flags.set(unlock.fileId, [])
      order.push(unlock.fileId)
    }
    flags.get(unlock.fileId)?.push(unlock.flag)
  }
  return order.map((fileId) => ({
    fileId,
    label: TWEAK_BASELINE.find((file) => file.id === fileId)?.label ?? fileId,
    flags: flags.get(fileId) ?? []
  }))
})()

/**
 * Skills the game switches on by STATS rather than a bool flag, so
 * SKILL_UNLOCKS (which collects bool flags) never lists them and they get no
 * checkbox. Only the warlock's gargoyle: stock `garg-dmg` and `garg-dur` are 0,
 * and its shop upgrade `garg` raises them — there is no `garg=true`. Each one
 * gets an explanation in the checkbox's place instead; the stats are read off
 * the baseline upgrade so the note cannot drift from the numbers.
 */
const STAT_GATED_SKILLS = [{ fileId: 'warlock', name: 'gargoyle', upgradeId: 'garg' }].map((skill) => {
  const file = TWEAK_BASELINE.find((candidate) => candidate.id === skill.fileId)
  const upgrade = file?.kind === 'unit' ? file.upgrades.find((u) => u.id === skill.upgradeId) : undefined
  return {
    ...skill,
    cost: upgrade?.cost,
    stats: (upgrade?.children ?? [])
      .filter((child) => child.name !== 'lvl' && typeof child.value === 'number')
      .map((child) => `${child.name} ${String(child.value)}`)
  }
})

/** A checkbox-shaped row whose (i) opens the note on how to unlock the skill. */
function StatGatedSkill({ skill }: { skill: (typeof STAT_GATED_SKILLS)[number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="stat-gated-skill">
      <button
        type="button"
        className="stat-gated-skill-toggle"
        aria-expanded={open}
        title={`Why ${skill.name} has no checkbox`}
        onClick={() => setOpen(!open)}
      >
        <span className="info-tip" aria-hidden="true">
          i
        </span>
        <span>{skill.name}</span>
      </button>
      {open && (
        <p className="stat-gated-skill-note">
          The {skill.name} has no on/off switch in the game&apos;s files, so it cannot be ticked here and{' '}
          <em>Start with all skills unlocked</em> leaves it out. The game keeps it locked by giving it 0 damage
          and 0 duration. To start with it, open the{' '}
          {TWEAK_BASELINE.find((file) => file.id === skill.fileId)?.label ?? skill.fileId} section below and,
          under <em>Starting stats</em>, set {skill.stats.join(', ')} — what its shop upgrade (
          <code>{skill.upgradeId}</code>
          {skill.cost !== undefined && `, ${gold(skill.cost)}g`}) gives. Or keep that upgrade in the shop and
          buy it as usual.
        </p>
      )}
    </div>
  )
}

type ShopChoice =Exclude<CostPolicy, 'mixed'> | 'mixed'

const SHOP_OPTIONS: Array<{ value: ShopChoice; label: string; title: string }> = [
  { value: 'stock', label: 'Stock prices', title: 'The prices the game ships with' },
  {
    value: 'free',
    label: 'All free',
    title: 'Every upgrade costs 0, so a character can be fully kitted out — every skill included — at any shop'
  },
  {
    value: 'removed',
    label: 'No upgrades',
    title: 'Every upgrade is taken out of the shop, so the party plays the whole campaign on its starting stats'
  },
  {
    value: 'custom',
    label: 'Set a price',
    title: 'One price for every upgrade. A negative price pays the player instead of charging them.'
  }
]

const gold = (value: number): string => value.toLocaleString('en-US')

/**
 * Bulk editor for the whole roster, sitting above the per-class sections.
 *
 * It owns no state of its own: every knob reads its value back out of `tweaks`
 * and writes ordinary `player.*` overrides, so what you set here shows up in the
 * class sections below, exports to parameters.txt, and disappears entirely at
 * ×1 — which is what keeps a stock run from emitting a tweak/ folder.
 */
export function QuickSetup({ tweaks, onChange }: QuickSetupProps) {
  // UI-only: what gets stored is the price itself, on every upgrade
  const [price, setPrice] = React.useState(SHOP_PRICE_MAX)

  const master = deriveMasterFactor(tweaks)
  const policy = deriveCostPolicy(tweaks, price)
  const skills = deriveSkillUnlocks(tweaks)
  const noLives = deriveShopRemovals(EXTRA_LIFE_UPGRADES, tweaks)

  const setPolicy = (choice: ShopChoice) => {
    if (choice === 'mixed') return
    const next = applyCostPolicy(choice, price, tweaks)
    // free upgrades exist so a character can reach every skill, so switch them on
    // at the same time rather than making it a second step
    onChange(choice === 'free' ? applySkillUnlocks(true, next) : next)
  }

  const setCustomPrice = (value: number) => {
    setPrice(value)
    if (policy === 'custom' && Number.isFinite(value)) {
      onChange(applyCostPolicy('custom', value, tweaks))
    }
  }

  return (
    <>
      <p className="hint">
        Scales starting stats <em>and</em> every upgrade tier that writes them, across all seven
        classes at once. <code>×1</code> is the stock game and stores nothing. Switch to the{' '}
        <strong>Loadout</strong> tab to see what a character ends up with.
      </p>

      <Subsection title="Stat multipliers" defaultOpen>
        <div className="field-grid quick-setup-master">
          <CurveField
            label={`all stats${master.uniform ? '' : ' · mixed'}`}
            value={master.factor}
            step={0.1}
            onChange={(v) => onChange(applyMasterFactor(v, tweaks))}
            title="Sets every group below at once"
          />
        </div>
        <div className="field-grid">
          {STAT_GROUPS.map((group) => {
            const derived = deriveStatFactor(group.id, tweaks)
            return (
              <CurveField
                key={group.id}
                label={`${group.label}${derived.uniform ? '' : ' · custom'}`}
                value={derived.factor}
                step={0.1}
                onChange={(v) => onChange(applyStatFactor(group.id as StatGroupId, v, tweaks))}
                title={group.hint}
              />
            )
          })}
        </div>
        <p className="hint">
          Higher is always stronger: mana regen and skill costs are divided rather than multiplied,
          because a lower period and a cheaper spell are the better ones. Stats the game leaves
          unset — a locked skill&apos;s duration, for instance — are skipped so their sentinels stay
          intact.
        </p>
      </Subsection>

      <Subsection title="Upgrade shop" defaultOpen>
        <ToggleGroup
          label="prices"
          value={policy}
          options={
            policy === 'mixed'
              ? [...SHOP_OPTIONS, { value: 'mixed' as ShopChoice, label: 'Mixed', title: 'Prices have been edited by hand' }]
              : SHOP_OPTIONS
          }
          onChange={setPolicy}
        />

        {policy === 'custom' && (
          <>
            <div className="field-grid">
              <CurveField
                label="price each"
                value={price}
                step={100}
                onChange={setCustomPrice}
                title={`Every upgrade costs this. Max ${SHOP_PRICE_MAX} — the most the shop can display.`}
              />
            </div>
            {price < 0 && (
              <p className="hint">
                A negative price <strong>pays</strong> the player {gold(-price)} gold per upgrade.
                Pair it with high starting stats for a shop where you sell your character down.
              </p>
            )}
          </>
        )}

        {policy === 'removed' && (
          <p className="hint">
            Every upgrade is left out of the emitted files, so the shop has nothing to sell. Starting
            stats are untouched — set those with the multipliers above.
          </p>
        )}

        <div className="quick-setup-checks">
          <BoolField
            label="Remove extra lives from the shop (life)"
            checked={noLives}
            onChange={(on) => onChange(applyShopRemovals(EXTRA_LIFE_UPGRADES, on, tweaks))}
            title="Extra lives are repeatable, so players can farm them by leaving a level and coming back. Rejuvenation stays — it is a one-off full heal, not another life."
          />
        </div>

        <p className="hint">Gold to buy every upgrade in the game: {gold(totalShopCost(tweaks))}.</p>
      </Subsection>

      <Subsection title="Skills unlocked at start" defaultOpen>
        <div className="quick-setup-checks">
          <BoolField
            label="Start with all skills unlocked"
            checked={skills}
            onChange={(on) => onChange(applySkillUnlocks(on, tweaks))}
            title="Every class, every bool-gated skill. Also fills in each skill's stats and its projectile or buff path, which the game leaves unset until the upgrade is bought"
          />
        </div>
        <div className="skill-grid">
          {SKILLS_BY_CLASS.map((group) => (
            <div className="skill-class" key={group.fileId}>
              <span className="skill-class-name">{group.label}</span>
              {group.flags.map((flag) => (
                <BoolField
                  key={flag}
                  label={flag}
                  checked={tweaks[`player.${group.fileId}.param.${flag}`] === 1}
                  onChange={(on) => onChange(applySkillUnlock(group.fileId, flag, on, tweaks))}
                />
              ))}
              {STAT_GATED_SKILLS.filter((skill) => skill.fileId === group.fileId).map((skill) => (
                <StatGatedSkill key={skill.name} skill={skill} />
              ))}
            </div>
          ))}
        </div>
        <p className="hint">
          Normally bought at a shop. Ticking one also fills in the skill&apos;s stats and its
          projectile or buff path, which the game leaves unset until the upgrade is purchased.
        </p>
      </Subsection>

      <Subsection title="Presets" defaultOpen>
        <div className="quick-setup-presets">
          <button type="button" onClick={() => onChange(applyFullyUpgraded(tweaks))}>
            Fully upgraded roster
          </button>
          <button type="button" onClick={() => onChange(resetQuickSetup(tweaks))}>
            Reset quick setup
          </button>
        </div>
        <p className="hint">
          <strong>Fully upgraded</strong> bakes every upgrade&apos;s result into the starting stats
          and unlocks every skill, so nobody has to shop at all — set your multipliers first, since
          it captures the ladder as it stands. <strong>Reset</strong> returns every character stat,
          price and skill to the stock game, leaving enemy difficulty alone and extra lives out of
          the shop.
        </p>
      </Subsection>
    </>
  )
}
