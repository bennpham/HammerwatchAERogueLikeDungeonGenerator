import type { TweakFile, TweakGeneralFile, TweakParam, TweakUnitFile, TweakUpgrade } from './types'

/**
 * The stock Hammerwatch balance tables, transcribed from
 * `<Hammerwatch>/editor/assetsExtract/tweak/*.xml`.
 *
 * Because a campaign's tweak file replaces the base file wholesale (see types.ts),
 * we need the complete stock content here to emit a valid file after a single edit.
 *
 * XML comments and commented-out blocks in the originals (the warlock's cut
 * lifesteal skill, the superseded shared speed tiers) are deliberately dropped —
 * they carry no gameplay meaning.
 *
 * Human-readable tables of the same data: reference/hammerwatch-tweak-stats.md
 */

const i = (name: string, value: number): TweakParam => ({ name, type: 'int', value })
const f = (name: string, value: number): TweakParam => ({ name, type: 'float', value })
const b = (name: string, value: boolean): TweakParam => ({ name, type: 'bool', value })
const s = (name: string, value: string): TweakParam => ({ name, type: 'string', value })

interface UpgradeOpts {
  req?: string
  extra?: Record<string, string>
  children?: TweakParam[]
}

const U = (
  id: string,
  cost: number,
  cat: string,
  nameKey: string,
  descKey: string,
  opts: UpgradeOpts = {}
): TweakUpgrade => ({
  id,
  cost,
  cat,
  nameKey,
  descKey,
  req: opts.req,
  extra: opts.extra,
  children: opts.children ?? []
})

// ---------------------------------------------------------------- general.xml

const general: TweakGeneralFile = {
  kind: 'general',
  file: 'general.xml',
  id: 'general',
  label: 'Enemy difficulty',
  difficulties: [
    {
      name: 'easy',
      values: [
        f('EnemyHealthAll', 0.75),
        f('EnemyHealthBase', 0.75),
        f('EnemyHealthIncr', 0.35),
        f('EnemySpeedMultiplier', 0.85),
        f('EnemyDamageBase', 0.75),
        f('EnemyDamageIncr', 0.1),
        f('SpawnFreqBase', 1.2),
        f('SpawnFreqDecr', 0.1),
        f('MoneyBase', 1.2),
        f('MoneyIncr', 0)
      ]
    },
    {
      name: 'medium',
      values: [
        f('EnemyHealthAll', 1),
        f('EnemyHealthBase', 1),
        f('EnemyHealthIncr', 0.5),
        f('EnemySpeedMultiplier', 1),
        f('EnemyDamageBase', 1),
        f('EnemyDamageIncr', 0.15),
        f('SpawnFreqBase', 1),
        f('SpawnFreqDecr', 0.1),
        f('MoneyBase', 1),
        f('MoneyIncr', 0)
      ]
    },
    {
      name: 'hard',
      values: [
        f('EnemyHealthAll', 1.1),
        f('EnemyHealthBase', 1.1),
        f('EnemyHealthIncr', 0.65),
        f('EnemySpeedMultiplier', 1.33),
        f('EnemyDamageBase', 1.75),
        f('EnemyDamageIncr', 0.3),
        f('SpawnFreqBase', 0.75),
        f('SpawnFreqDecr', 0.1),
        f('MoneyBase', 0.75),
        f('MoneyIncr', 0)
      ]
    }
  ]
}

// ----------------------------------------------------------------- shared.xml

const shared: TweakUnitFile = {
  kind: 'unit',
  file: 'shared.xml',
  id: 'shared',
  label: 'Shared — potions, speed, combo',
  params: [
    f('move-speed', 0.9),
    f('dmg-mul', 1.0),
    b('combo', false),
    f('combo-timer', 0.75),
    i('combo-heal', 0),
    i('combo-mana', 0),
    i('combo-nova-dmg', 0),
    i('combo-nova-parts', 0),
    s('combo-nova-projectile', '')
  ],
  upgrades: [
    U('life', 350, 'power', 'life-uname', 'life-udesc', { extra: { 'life-cost-scale': '2.6' } }),
    U('rejuv', 175, 'power', 'rejuv-uname', 'rejuv-udesc'),
    U('pot-dmg', 300, 'power', 'pot-dmg-uname', 'pot-dmg-udesc'),
    U('pot-rejuv', 300, 'power', 'pot-rejuv-uname', 'pot-rejuv-udesc'),
    U('pot-invul', 300, 'power', 'pot-invul-uname', 'pot-invul-udesc'),

    U('speed-1', 600, 'misc3', 'speed-uname', 'speed-udesc', { children: [i('lvl', 1), f('move-speed', 1)] }),
    U('speed-2', 1200, 'misc4', 'speed-uname', 'speed-udesc', {
      req: 'speed-1',
      children: [i('lvl', 2), f('move-speed', 1.1)]
    }),
    U('speed-3', 1600, 'misc5', 'speed-uname', 'speed-udesc', {
      req: 'speed-2',
      children: [i('lvl', 3), f('move-speed', 1.2)]
    }),

    U('combo', 250, 'combo1', 'combo-uname', 'combo-udesc', { children: [b('combo', true)] }),

    U('combo-time-1', 800, 'combo1', 'combo-time-uname', 'combo-time-udesc', {
      req: 'combo',
      children: [i('lvl', 1), f('combo-timer', 1)]
    }),
    U('combo-time-2', 1200, 'combo2', 'combo-time-uname', 'combo-time-udesc', {
      req: 'combo-time-1',
      children: [i('lvl', 2), f('combo-timer', 1.25)]
    }),
    U('combo-time-3', 1600, 'combo3', 'combo-time-uname', 'combo-time-udesc', {
      req: 'combo-time-2',
      children: [i('lvl', 3), f('combo-timer', 1.5)]
    }),
    U('combo-time-4', 2600, 'combo4', 'combo-time-uname', 'combo-time-udesc', {
      req: 'combo-time-3',
      children: [i('lvl', 4), f('combo-timer', 1.75)]
    }),
    U('combo-time-5', 3800, 'combo5', 'combo-time-uname', 'combo-time-udesc', {
      req: 'combo-time-4',
      children: [i('lvl', 5), f('combo-timer', 2)]
    }),

    U('combo-nova-1', 800, 'combo1', 'combo-nova-uname', 'combo-nova-udesc-1', {
      req: 'combo',
      children: [
        i('lvl', 1),
        i('combo-nova-dmg', 12),
        i('combo-nova-parts', 6),
        s('combo-nova-projectile', 'projectiles/player_combo_nova_1.xml')
      ]
    }),
    U('combo-nova-2', 1200, 'combo2', 'combo-nova-uname', 'combo-nova-udesc-2', {
      req: 'combo-nova-1',
      children: [i('lvl', 2), i('combo-nova-dmg', 17), i('combo-nova-parts', 10)]
    }),
    U('combo-nova-3', 1600, 'combo3', 'combo-nova-uname', 'combo-nova-udesc-2', {
      req: 'combo-nova-2',
      children: [
        i('lvl', 3),
        i('combo-nova-dmg', 26),
        i('combo-nova-parts', 14),
        s('combo-nova-projectile', 'projectiles/player_combo_nova_2.xml')
      ]
    }),
    U('combo-nova-4', 2600, 'combo4', 'combo-nova-uname', 'combo-nova-udesc-2', {
      req: 'combo-nova-3',
      children: [i('lvl', 4), i('combo-nova-dmg', 34), i('combo-nova-parts', 18)]
    }),
    U('combo-nova-5', 3800, 'combo5', 'combo-nova-uname', 'combo-nova-udesc-2', {
      req: 'combo-nova-4',
      children: [
        i('lvl', 5),
        i('combo-nova-dmg', 42),
        i('combo-nova-parts', 22),
        s('combo-nova-projectile', 'projectiles/player_combo_nova_3.xml')
      ]
    }),

    U('combo-heal-1', 800, 'combo1', 'combo-heal-uname', 'combo-heal-udesc-1', {
      req: 'combo',
      children: [i('lvl', 1), i('combo-heal', 2)]
    }),
    U('combo-heal-2', 1200, 'combo2', 'combo-heal-uname', 'combo-heal-udesc-2', {
      req: 'combo-heal-1',
      children: [i('lvl', 2), i('combo-heal', 4)]
    }),
    U('combo-heal-3', 1600, 'combo3', 'combo-heal-uname', 'combo-heal-udesc-2', {
      req: 'combo-heal-2',
      children: [i('lvl', 3), i('combo-heal', 6)]
    }),
    U('combo-heal-4', 2600, 'combo4', 'combo-heal-uname', 'combo-heal-udesc-2', {
      req: 'combo-heal-3',
      children: [i('lvl', 4), i('combo-heal', 8)]
    }),
    U('combo-heal-5', 3800, 'combo5', 'combo-heal-uname', 'combo-heal-udesc-2', {
      req: 'combo-heal-4',
      children: [i('lvl', 5), i('combo-heal', 10)]
    }),

    U('combo-mana-1', 800, 'combo1', 'combo-mana-uname', 'combo-mana-udesc-1', {
      req: 'combo',
      children: [i('lvl', 1), i('combo-mana', 4)]
    }),
    U('combo-mana-2', 1200, 'combo2', 'combo-mana-uname', 'combo-mana-udesc-2', {
      req: 'combo-mana-1',
      children: [i('lvl', 2), i('combo-mana', 6)]
    }),
    U('combo-mana-3', 1600, 'combo3', 'combo-mana-uname', 'combo-mana-udesc-2', {
      req: 'combo-mana-2',
      children: [i('lvl', 3), i('combo-mana', 8)]
    }),
    U('combo-mana-4', 2600, 'combo4', 'combo-mana-uname', 'combo-mana-udesc-2', {
      req: 'combo-mana-3',
      children: [i('lvl', 4), i('combo-mana', 10)]
    }),
    U('combo-mana-5', 3800, 'combo5', 'combo-mana-uname', 'combo-mana-udesc-2', {
      req: 'combo-mana-4',
      children: [i('lvl', 5), i('combo-mana', 12)]
    })
  ]
}

// ----------------------------------------------------------------- knight.xml

const knight: TweakUnitFile = {
  kind: 'unit',
  file: 'knight.xml',
  id: 'knight',
  label: 'Knight',
  params: [
    i('max-health', 75),
    i('max-mana', 50),
    i('dmg-reduction', 2),
    i('mana-regen', 1100),
    i('sword-dmg', 9),
    i('sword-arc', 90),
    s('sword-arc-gfx', 'effects/knight_slash_90.xml'),
    f('sword-range', 1),
    f('charge-dist', 3),
    f('charge-speed', 3),
    f('charge-dmg-multiplier', 1.75),
    i('charge-mana-cost', 10),
    b('heal', false),
    i('heal-amount', -1),
    i('heal-mana-cost', -1),
    b('whirl', false),
    f('whirl-range', 1.5),
    i('whirl-dur', -1),
    f('whirl-dmg-multiplier', -1),
    i('whirl-mana-cost', 50),
    i('shield-arc', 75),
    i('bash-chance', 0)
  ],
  upgrades: [
    U('health-1', 600, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 120)] }),
    U('health-2', 1200, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 165)]
    }),
    U('health-3', 1800, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 210)]
    }),
    U('health-4', 2400, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 255)]
    }),
    U('health-5', 3000, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 300)]
    }),

    U('mana-1', 800, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 75), i('mana-regen', 1000)]
    }),
    U('mana-2', 1900, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 100), i('mana-regen', 900)]
    }),
    U('mana-3', 3000, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 125), i('mana-regen', 800)]
    }),
    U('mana-4', 4100, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 150), i('mana-regen', 700)]
    }),
    U('mana-5', 5200, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 175), i('mana-regen', 600)]
    }),

    U('dmg1', 800, 'off1', 'knidmg-uname', 'knidmg-udesc', { children: [i('lvl', 1), i('sword-dmg', 14)] }),
    U('dmg2', 1600, 'off2', 'knidmg-uname', 'knidmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('sword-dmg', 20)]
    }),
    U('dmg3', 2700, 'off3', 'knidmg-uname', 'knidmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('sword-dmg', 26)]
    }),
    U('dmg4', 3900, 'off4', 'knidmg-uname', 'knidmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('sword-dmg', 32)]
    }),
    U('dmg5', 5200, 'off5', 'knidmg-uname', 'knidmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('sword-dmg', 38)]
    }),

    U('arc1', 250, 'off1', 'kniarc-uname', 'kniarc-udesc', {
      children: [i('lvl', 1), i('sword-arc', 120), s('sword-arc-gfx', 'effects/knight_slash_120.xml')]
    }),
    U('arc2', 700, 'off2', 'kniarc-uname', 'kniarc-udesc', {
      req: 'arc1',
      children: [i('lvl', 2), i('sword-arc', 150), s('sword-arc-gfx', 'effects/knight_slash_150.xml')]
    }),
    U('arc3', 1500, 'off3', 'kniarc-uname', 'kniarc-udesc', {
      req: 'arc2',
      children: [i('lvl', 3), i('sword-arc', 180), s('sword-arc-gfx', 'effects/knight_slash_180.xml')]
    }),
    U('arc4', 2200, 'off4', 'kniarc-uname', 'kniarc-udesc', {
      req: 'arc3',
      children: [i('lvl', 4), i('sword-arc', 210), s('sword-arc-gfx', 'effects/knight_slash_210.xml')]
    }),
    U('arc5', 2700, 'off5', 'kniarc-uname', 'kniarc-udesc', {
      req: 'arc4',
      children: [i('lvl', 5), i('sword-arc', 240), s('sword-arc-gfx', 'effects/knight_slash_240.xml')]
    }),

    U('chrgdmg1', 1600, 'off2', 'chrgdmg-uname', 'chrgdmg-udesc', {
      children: [i('lvl', 1), f('charge-dmg-multiplier', 2.0)]
    }),
    U('chrgdmg2', 3000, 'off3', 'chrgdmg-uname', 'chrgdmg-udesc', {
      req: 'chrgdmg1',
      children: [i('lvl', 2), f('charge-dmg-multiplier', 2.25)]
    }),
    U('chrgdmg3', 4200, 'off4', 'chrgdmg-uname', 'chrgdmg-udesc', {
      req: 'chrgdmg2',
      children: [i('lvl', 3), f('charge-dmg-multiplier', 2.5)]
    }),

    U('chrgrng1', 500, 'off2', 'chrgrng-uname', 'chrgrng-udesc', {
      children: [i('lvl', 1), f('charge-dist', 4), f('charge-speed', 4)]
    }),
    U('chrgrng2', 1200, 'off3', 'chrgrng-uname', 'chrgrng-udesc', {
      req: 'chrgrng1',
      children: [i('lvl', 2), f('charge-dist', 5), f('charge-speed', 5)]
    }),
    U('chrgrng3', 1800, 'off4', 'chrgrng-uname', 'chrgrng-udesc', {
      req: 'chrgrng2',
      children: [i('lvl', 3), f('charge-dist', 6), f('charge-speed', 6)]
    }),

    U('whirl', 2200, 'off3', 'whirl-uname', 'whirl-udesc', {
      children: [b('whirl', true), i('whirl-dur', 4), f('whirl-dmg-multiplier', 1.5)]
    }),
    U('whirldmg1', 2800, 'off4', 'whirldmg-uname', 'whirldmg-udesc', {
      req: 'whirl',
      children: [i('lvl', 1), f('whirl-dmg-multiplier', 2)]
    }),
    U('whirldmg2', 3800, 'off5', 'whirldmg-uname', 'whirldmg-udesc', {
      req: 'whirldmg1',
      children: [i('lvl', 2), f('whirl-dmg-multiplier', 2.5)]
    }),
    U('whirldur1', 3000, 'off4', 'whirldur-uname', 'whirldur-udesc', {
      req: 'whirl',
      children: [i('lvl', 1), i('whirl-dur', 6)]
    }),
    // stock file really does call the second duration tier "whirldur", not "whirldur2"
    U('whirldur', 4000, 'off5', 'whirldur-uname', 'whirldur-udesc', {
      req: 'whirldur1',
      children: [i('lvl', 2), i('whirl-dur', 8)]
    }),

    U('bash1', 700, 'def1', 'bash-uname', 'bash-udesc-1', { children: [i('lvl', 1), i('bash-chance', 10)] }),
    U('bash2', 1600, 'def2', 'bash-uname', 'bash-udesc-2', {
      req: 'bash1',
      children: [i('lvl', 2), i('bash-chance', 20)]
    }),
    U('bash3', 2600, 'def3', 'bash-uname', 'bash-udesc-2', {
      req: 'bash2',
      children: [i('lvl', 3), i('bash-chance', 30)]
    }),

    U('armor-1', 600, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 4)] }),
    U('armor-2', 1200, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 6)]
    }),
    U('armor-3', 2000, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 8)]
    }),
    U('armor-4', 2500, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 9)]
    }),
    U('armor-5', 3200, 'def5', 'armor-uname', 'armor-udesc', {
      req: 'armor-4',
      children: [i('lvl', 5), i('dmg-reduction', 10)]
    }),

    U('heal', 700, 'def2', 'heal-uname', 'heal-udesc', {
      children: [b('heal', true), i('heal-amount', 5), i('heal-mana-cost', 10)]
    }),
    U('healeff1', 1700, 'def3', 'healeff-uname', 'healeff-udesc', {
      req: 'heal',
      children: [i('lvl', 1), i('heal-amount', 6), i('heal-mana-cost', 8)]
    }),
    U('healeff2', 2600, 'def4', 'healeff-uname', 'healeff-udesc', {
      req: 'healeff1',
      children: [i('lvl', 2), i('heal-amount', 7), i('heal-mana-cost', 7)]
    }),
    U('healeff3', 3500, 'def5', 'healeff-uname', 'healeff-udesc', {
      req: 'healeff2',
      children: [i('lvl', 3), i('heal-amount', 8), i('heal-mana-cost', 6)]
    }),

    U('shield1', 750, 'def1', 'shield-uname', 'shield-udesc-1', { children: [i('lvl', 1), i('shield-arc', 120)] }),
    U('shield2', 1500, 'def2', 'shield-uname', 'shield-udesc-2', {
      req: 'shield1',
      children: [i('lvl', 2), i('shield-arc', 180)]
    }),
    U('shield3', 3000, 'def3', 'shield-uname', 'shield-udesc-2', {
      req: 'shield2',
      children: [i('lvl', 3), i('shield-arc', 240)]
    })
  ]
}

// ----------------------------------------------------------------- priest.xml

const priest: TweakUnitFile = {
  kind: 'unit',
  file: 'priest.xml',
  id: 'priest',
  label: 'Priest',
  params: [
    i('max-health', 30),
    i('max-mana', 70),
    i('dmg-reduction', 0),
    i('mana-regen', 570),
    i('smite-dmg', 6),
    f('smite-range', 2.75),
    f('smite-area', 1.15),
    s('smite-effect', 'effects/explodes.xml:priest_smite'),
    i('smite-speed-pen', 100),
    i('beam-dmg', 19),
    i('beam-heal', 3),
    f('beam-range', 5),
    i('beam-mana-cost', 3),
    b('area', false),
    f('area-range', 0),
    i('area-duration', 0),
    s('area-effect', 'effects/player_effects.xml:priest_drain_area'),
    i('area-dmg', 0),
    f('area-heal-mul', 0),
    i('area-limit', 0),
    i('area-mana-cost', 35),
    b('aura', false),
    f('aura-range', 0),
    s('aura-effect', 'effects/player_effects.xml:priest_cripple_aura'),
    s('aura-buff', ''),
    i('aura-mana-cost', 50),
    i('aura-mana-drain', 0),
    i('shield-distr', 50),
    f('shield-dmg-per-mana', 0.25),
    s('shield-effect', 'effects/misc.xml:magicshield'),
    f('hp-regen', 0)
  ],
  upgrades: [
    U('health-1', 800, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 40)] }),
    U('health-2', 1500, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 50)]
    }),
    U('health-3', 2200, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 55)]
    }),
    U('health-4', 2900, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 60)]
    }),
    U('health-5', 3600, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 65)]
    }),

    U('mana-1', 800, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 130), i('mana-regen', 500)]
    }),
    U('mana-2', 1400, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 190), i('mana-regen', 444)]
    }),
    U('mana-3', 2200, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 250), i('mana-regen', 400)]
    }),
    U('mana-4', 3000, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 310), i('mana-regen', 333)]
    }),
    U('mana-5', 3800, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 370), i('mana-regen', 285)]
    }),

    U('dmg1', 600, 'off1', 'pridmg-uname', 'pridmg-udesc', {
      children: [i('lvl', 1), i('smite-dmg', 10), f('smite-area', 1.2)]
    }),
    U('dmg2', 1200, 'off2', 'pridmg-uname', 'pridmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('smite-dmg', 15), f('smite-area', 1.25)]
    }),
    U('dmg3', 1800, 'off3', 'pridmg-uname', 'pridmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('smite-dmg', 22), f('smite-area', 1.3)]
    }),
    U('dmg4', 2500, 'off4', 'pridmg-uname', 'pridmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('smite-dmg', 29), f('smite-area', 1.35)]
    }),
    U('dmg5', 3200, 'off5', 'pridmg-uname', 'pridmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('smite-dmg', 34), f('smite-area', 1.4)]
    }),

    U('sspeed1', 250, 'off1', 'prispe-uname', 'prispe-udesc', {
      children: [i('lvl', 1), i('smite-speed-pen', 80)]
    }),
    U('sspeed2', 550, 'off2', 'prispe-uname', 'prispe-udesc', {
      req: 'sspeed1',
      children: [i('lvl', 2), i('smite-speed-pen', 70)]
    }),
    U('sspeed3', 1200, 'off3', 'prispe-uname', 'prispe-udesc', {
      req: 'sspeed2',
      children: [i('lvl', 3), i('smite-speed-pen', 60)]
    }),
    U('sspeed4', 2500, 'off4', 'prispe-uname', 'prispe-udesc', {
      req: 'sspeed3',
      children: [i('lvl', 4), i('smite-speed-pen', 50)]
    }),
    U('sspeed5', 3300, 'off5', 'prispe-uname', 'prispe-udesc', {
      req: 'sspeed4',
      children: [i('lvl', 5), i('smite-speed-pen', 40)]
    }),

    U('beamdmg1', 1200, 'off2', 'beamdmg-uname', 'beamdmg-udesc', {
      children: [i('lvl', 1), i('beam-dmg', 25), i('beam-heal', 4)]
    }),
    U('beamdmg2', 2000, 'off3', 'beamdmg-uname', 'beamdmg-udesc', {
      req: 'beamdmg1',
      children: [i('lvl', 2), i('beam-dmg', 37), i('beam-heal', 4)]
    }),
    U('beamdmg3', 3000, 'off4', 'beamdmg-uname', 'beamdmg-udesc', {
      req: 'beamdmg2',
      children: [i('lvl', 3), i('beam-dmg', 48), i('beam-heal', 5)]
    }),
    U('beamdmg4', 4300, 'off5', 'beamdmg-uname', 'beamdmg-udesc', {
      req: 'beamdmg3',
      children: [i('lvl', 4), i('beam-dmg', 60), i('beam-heal', 5)]
    }),

    U('beamrng1', 600, 'off2', 'beamrng-uname', 'beamrng-udesc', { children: [i('lvl', 1), f('beam-range', 6)] }),
    U('beamrng2', 1200, 'off3', 'beamrng-uname', 'beamrng-udesc', {
      req: 'beamrng1',
      children: [i('lvl', 2), f('beam-range', 7)]
    }),
    U('beamrng3', 2000, 'off4', 'beamrng-uname', 'beamrng-udesc', {
      req: 'beamrng2',
      children: [i('lvl', 3), f('beam-range', 8)]
    }),
    U('beamrng4', 2800, 'off5', 'beamrng-uname', 'beamrng-udesc', {
      req: 'beamrng3',
      children: [i('lvl', 4), f('beam-range', 9)]
    }),

    U('area', 2000, 'off2', 'area-uname', 'area-udesc', {
      children: [
        b('area', true),
        f('area-range', 2.25),
        i('area-duration', 7000),
        i('area-dmg', 16),
        f('area-heal-mul', 0.1),
        i('area-limit', 1)
      ]
    }),
    U('areadmg-1', 2000, 'off3', 'areadmg-uname', 'areadmg-udesc', {
      req: 'area',
      children: [i('lvl', 1), i('area-dmg', 24)]
    }),
    U('areadmg-2', 3500, 'off4', 'areadmg-uname', 'areadmg-udesc', {
      req: 'areadmg-1',
      children: [i('lvl', 2), i('area-dmg', 32)]
    }),
    U('areadmg-3', 4500, 'off5', 'areadmg-uname', 'areadmg-udesc', {
      req: 'areadmg-2',
      children: [i('lvl', 3), i('area-dmg', 38)]
    }),
    U('areanum-1', 3000, 'off3', 'areanum-uname', 'areanum-udesc', {
      req: 'area',
      children: [i('lvl', 1), i('area-limit', 2)]
    }),
    U('areanum-2', 4000, 'off4', 'areanum-uname', 'areanum-udesc', {
      req: 'areanum-1',
      children: [i('lvl', 2), i('area-limit', 3)]
    }),

    U('armor-1', 1200, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 1)] }),
    U('armor-2', 2400, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 2)]
    }),
    U('armor-3', 3600, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 3)]
    }),
    U('armor-4', 4800, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 4)]
    }),
    U('armor-5', 6000, 'def5', 'armor-uname', 'armor-udesc', {
      req: 'armor-4',
      children: [i('lvl', 5), i('dmg-reduction', 5)]
    }),

    U('aura', 3500, 'def3', 'aura-uname', 'aura-udesc', {
      children: [
        b('aura', true),
        f('aura-range', 5),
        s('aura-buff', 'buffs/priest_cripple_1.xml'),
        i('aura-mana-drain', 1),
        i('slow', 30)
      ]
    }),
    U('auraslow-1', 3500, 'def4', 'auraslow-uname', 'auraslow-udesc', {
      req: 'aura',
      children: [i('lvl', 1), s('aura-buff', 'buffs/priest_cripple_2.xml'), i('slow', 50)]
    }),
    U('auraslow-2', 4500, 'def5', 'auraslow-uname', 'auraslow-udesc', {
      req: 'auraslow-1',
      children: [i('lvl', 2), s('aura-buff', 'buffs/priest_cripple_3.xml'), i('slow', 70)]
    }),
    U('auradrain', 5000, 'def3', 'auradrain-uname', 'auradrain-udesc', {
      req: 'aura',
      children: [i('aura-mana-drain', 0)]
    }),

    U('hpregen1', 500, 'def1', 'hpregen-uname', 'hpregen-udesc-1', { children: [i('lvl', 1), f('hp-regen', 5)] }),
    U('hpregen2', 1000, 'def2', 'hpregen-uname', 'hpregen-udesc-2', {
      req: 'hpregen1',
      children: [i('lvl', 2), f('hp-regen', 2.5)]
    }),
    U('hpregen3', 1500, 'def3', 'hpregen-uname', 'hpregen-udesc-2', {
      req: 'hpregen2',
      children: [i('lvl', 3), f('hp-regen', 1.67)]
    }),
    U('hpregen4', 2000, 'def4', 'hpregen-uname', 'hpregen-udesc-2', {
      req: 'hpregen3',
      children: [i('lvl', 4), f('hp-regen', 1.25)]
    }),
    U('hpregen5', 2500, 'def5', 'hpregen-uname', 'hpregen-udesc-2', {
      req: 'hpregen4',
      children: [i('lvl', 5), f('hp-regen', 1)]
    }),

    U('mshield1', 500, 'def1', 'mshield-uname', 'mshield-udesc', {
      children: [i('lvl', 1), f('shield-dmg-per-mana', 0.5)]
    }),
    U('mshield2', 1200, 'def2', 'mshield-uname', 'mshield-udesc', {
      req: 'mshield1',
      children: [i('lvl', 2), f('shield-dmg-per-mana', 0.75)]
    }),
    U('mshield3', 1800, 'def3', 'mshield-uname', 'mshield-udesc', {
      req: 'mshield2',
      children: [i('lvl', 3), f('shield-dmg-per-mana', 1.0)]
    }),
    U('mshield4', 2600, 'def4', 'mshield-uname', 'mshield-udesc', {
      req: 'mshield3',
      children: [i('lvl', 4), f('shield-dmg-per-mana', 1.25)]
    }),
    U('mshield5', 3200, 'def5', 'mshield-uname', 'mshield-udesc', {
      req: 'mshield4',
      children: [i('lvl', 5), f('shield-dmg-per-mana', 1.5)]
    })
  ]
}

// ----------------------------------------------------------------- ranger.xml

const ranger: TweakUnitFile = {
  kind: 'unit',
  file: 'ranger.xml',
  id: 'ranger',
  label: 'Ranger',
  params: [
    i('max-health', 50),
    i('max-mana', 50),
    i('dmg-reduction', 0),
    i('mana-regen', 1000),
    i('bow-dmg', 12),
    i('bow-penetration', 2),
    s('bow-projectile', 'projectiles/player_arrow_1.xml'),
    s('bomb-item', 'items/ranger_bomb.xml'),
    f('bomb-splash', 2.5),
    i('bomb-dmg', 30),
    i('bomb-mana-cost', 20),
    b('growth', false),
    f('growth-range', -1),
    f('growth-duration', -1),
    i('growth-mana-cost', 20),
    b('spread', false),
    i('spread-arrows', -1),
    i('spread-waves', -1),
    i('spread-mana-cost', 50),
    i('crit-chance', 0),
    i('dodge-chance', 0)
  ],
  upgrades: [
    U('health-1', 700, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 70)] }),
    U('health-2', 1400, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 90)]
    }),
    U('health-3', 2200, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 110)]
    }),
    U('health-4', 2900, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 130)]
    }),
    U('health-5', 3500, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 150)]
    }),

    U('mana-1', 700, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 80), i('mana-regen', 900)]
    }),
    U('mana-2', 1400, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 110), i('mana-regen', 800)]
    }),
    U('mana-3', 2200, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 140), i('mana-regen', 700)]
    }),
    U('mana-4', 2900, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 170), i('mana-regen', 600)]
    }),
    U('mana-5', 3500, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 200), i('mana-regen', 500)]
    }),

    U('dmg1', 800, 'off1', 'rngdmg-uname', 'rngdmg-udesc', { children: [i('lvl', 1), i('bow-dmg', 17)] }),
    U('dmg2', 1600, 'off2', 'rngdmg-uname', 'rngdmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('bow-dmg', 22), s('bow-projectile', 'projectiles/player_arrow_2.xml')]
    }),
    U('dmg3', 2700, 'off3', 'rngdmg-uname', 'rngdmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('bow-dmg', 27)]
    }),
    U('dmg4', 4000, 'off4', 'rngdmg-uname', 'rngdmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('bow-dmg', 32), s('bow-projectile', 'projectiles/player_arrow_3.xml')]
    }),
    U('dmg5', 6000, 'off5', 'rngdmg-uname', 'rngdmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('bow-dmg', 37)]
    }),

    U('pen1', 700, 'off1', 'rngpen-uname', 'rngpen-udesc', { children: [i('lvl', 1), i('bow-penetration', 3)] }),
    U('pen2', 1400, 'off2', 'rngpen-uname', 'rngpen-udesc', {
      req: 'pen1',
      children: [i('lvl', 2), i('bow-penetration', 4)]
    }),
    U('pen3', 2300, 'off3', 'rngpen-uname', 'rngpen-udesc', {
      req: 'pen2',
      children: [i('lvl', 3), i('bow-penetration', 5)]
    }),
    U('pen4', 3200, 'off4', 'rngpen-uname', 'rngpen-udesc', {
      req: 'pen3',
      children: [i('lvl', 4), i('bow-penetration', 6)]
    }),
    U('pen5', 4000, 'off5', 'rngpen-uname', 'rngpen-udesc', {
      req: 'pen4',
      children: [i('lvl', 5), i('bow-penetration', 7)]
    }),

    U('bombdmg-1', 900, 'off2', 'bombdmg-uname', 'bombdmg-udesc', { children: [i('lvl', 1), i('bomb-dmg', 43)] }),
    U('bombdmg-2', 2000, 'off3', 'bombdmg-uname', 'bombdmg-udesc', {
      req: 'bombdmg-1',
      children: [i('lvl', 2), i('bomb-dmg', 57)]
    }),
    U('bombdmg-3', 3200, 'off4', 'bombdmg-uname', 'bombdmg-udesc', {
      req: 'bombdmg-2',
      children: [i('lvl', 3), i('bomb-dmg', 72)]
    }),

    U('spread', 1800, 'off3', 'spread-uname', 'spread-udesc', {
      children: [b('spread', true), i('spread-arrows', 12), i('spread-waves', 2)]
    }),
    U('spreadshts-1', 3500, 'off4', 'spreadshts-uname', 'spreadshts-udesc', {
      req: 'spread',
      children: [i('lvl', 1), i('spread-arrows', 16)]
    }),
    U('spreadshts-2', 4000, 'off5', 'spreadshts-uname', 'spreadshts-udesc', {
      req: 'spreadshts-1',
      children: [i('lvl', 2), i('spread-arrows', 20)]
    }),
    U('spreadwvs-1', 3800, 'off4', 'spreadwvs-uname', 'spreadwvs-udesc', {
      req: 'spread',
      children: [i('lvl', 1), i('spread-waves', 3)]
    }),
    U('spreadwvs-2', 4500, 'off5', 'spreadwvs-uname', 'spreadwvs-udesc', {
      req: 'spreadwvs-1',
      children: [i('lvl', 2), i('spread-waves', 4)]
    }),

    U('crit1', 1200, 'off2', 'crit-uname', 'crit-udesc-1', { children: [i('lvl', 1), i('crit-chance', 10)] }),
    U('crit2', 2500, 'off3', 'crit-uname', 'crit-udesc-2', {
      req: 'crit1',
      children: [i('lvl', 2), i('crit-chance', 15)]
    }),
    U('crit3', 4000, 'off4', 'crit-uname', 'crit-udesc-2', {
      req: 'crit2',
      children: [i('lvl', 3), i('crit-chance', 20)]
    }),
    U('crit4', 5500, 'off5', 'crit-uname', 'crit-udesc-2', {
      req: 'crit3',
      children: [i('lvl', 4), i('crit-chance', 25)]
    }),

    U('armor-1', 600, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 1)] }),
    U('armor-2', 1200, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 2)]
    }),
    U('armor-3', 2000, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 3)]
    }),
    U('armor-4', 2700, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 4)]
    }),
    U('armor-5', 3500, 'def5', 'armor-uname', 'armor-udesc', {
      req: 'armor-4',
      children: [i('lvl', 5), i('dmg-reduction', 5)]
    }),

    U('dodge1', 1000, 'def1', 'dodge-uname', 'dodge-udesc-1', { children: [i('lvl', 1), i('dodge-chance', 10)] }),
    U('dodge2', 2000, 'def2', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge1',
      children: [i('lvl', 2), i('dodge-chance', 20)]
    }),
    U('dodge3', 3000, 'def3', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge2',
      children: [i('lvl', 3), i('dodge-chance', 30)]
    }),
    U('dodge4', 4000, 'def4', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge3',
      children: [i('lvl', 4), i('dodge-chance', 40)]
    }),
    U('dodge5', 5000, 'def5', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge4',
      children: [i('lvl', 5), i('dodge-chance', 50)]
    }),

    U('growth', 900, 'def2', 'growth-uname', 'growth-udesc', {
      children: [b('growth', true), f('growth-range', 5), f('growth-duration', 3)]
    }),
    U('growthdur-1', 1500, 'def3', 'growthdur-uname', 'growthdur-udesc', {
      req: 'growth',
      children: [i('lvl', 1), f('growth-duration', 4)]
    }),
    U('growthdur-2', 2100, 'def4', 'growthdur-uname', 'growthdur-udesc', {
      req: 'growthdur-1',
      children: [i('lvl', 2), f('growth-duration', 5)]
    }),
    U('growthrng-1', 1500, 'def4', 'growthrng-uname', 'growthrng-udesc', {
      req: 'growth',
      children: [i('lvl', 1), f('growth-range', 6)]
    }),
    U('growthrng-2', 2500, 'def5', 'growthrng-uname', 'growthrng-udesc', {
      req: 'growthrng-1',
      children: [i('lvl', 2), f('growth-range', 6.5)]
    })
  ]
}

// --------------------------------------------------------------- sorcerer.xml

const sorcerer: TweakUnitFile = {
  kind: 'unit',
  file: 'sorcerer.xml',
  id: 'sorcerer',
  label: 'Sorcerer',
  params: [
    i('max-health', 35),
    i('max-mana', 75),
    i('dmg-reduction', 0),
    i('mana-regen', 600),
    i('shard-dmg', 8),
    f('shard-range', 6),
    i('shard-bounces', 3),
    s('shard-projectile', 'projectiles/sorcerer_ice_shard.xml'),
    f('shard-bounce-range-mul', 0.75),
    f('shard-bounce-dmg-mul', 1),
    i('comet-dmg', 50),
    f('comet-dist', 2.5),
    i('comet-mana-cost', 25),
    f('comet-freeze', 2.5),
    b('nova', false),
    i('nova-shards', -1),
    i('nova-mana-cost', 9999),
    b('orb', false),
    i('orb-mana-cost', 90),
    s('orb-projectile', 'projectiles/sorcerer_ice_orb.xml'),
    s('orb-shard', 'projectiles/sorcerer_orb_shard.xml'),
    i('orb-shard-dmg', 0),
    f('orb-time', 0),
    i('shield-chance', 0),
    b('chill', false),
    i('chill-slow', 0),
    f('chill-dur', -1)
  ],
  upgrades: [
    U('health-1', 800, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 45)] }),
    U('health-2', 1500, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 60)]
    }),
    U('health-3', 2200, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 70)]
    }),
    U('health-4', 2900, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 85)]
    }),
    U('health-5', 3600, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 100)]
    }),

    U('mana-1', 600, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 130), i('mana-regen', 500)]
    }),
    U('mana-2', 1400, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 180), i('mana-regen', 400)]
    }),
    U('mana-3', 2200, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 230), i('mana-regen', 350)]
    }),
    U('mana-4', 3000, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 275), i('mana-regen', 300)]
    }),
    U('mana-5', 3800, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 320), i('mana-regen', 250)]
    }),

    U('dmg1', 800, 'off1', 'srcdmg-uname', 'srcdmg-udesc', { children: [i('lvl', 1), i('shard-dmg', 11)] }),
    U('dmg2', 1600, 'off2', 'srcdmg-uname', 'srcdmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('shard-dmg', 14)]
    }),
    U('dmg3', 2700, 'off3', 'srcdmg-uname', 'srcdmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('shard-dmg', 17)]
    }),
    U('dmg4', 4500, 'off4', 'srcdmg-uname', 'srcdmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('shard-dmg', 21)]
    }),
    U('dmg5', 6000, 'off5', 'srcdmg-uname', 'srcdmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('shard-dmg', 24)]
    }),

    U('rng1', 500, 'off1', 'srcrng-uname', 'srcrng-udesc', {
      children: [i('lvl', 1), f('shard-range', 6.5), i('shard-bounces', 4)]
    }),
    U('rng2', 1000, 'off2', 'srcrng-uname', 'srcrng-udesc', {
      req: 'rng1',
      children: [i('lvl', 2), f('shard-range', 7), i('shard-bounces', 5)]
    }),
    U('rng3', 1700, 'off3', 'srcrng-uname', 'srcrng-udesc', {
      req: 'rng2',
      children: [i('lvl', 3), f('shard-range', 7.5), i('shard-bounces', 6)]
    }),
    U('rng4', 2500, 'off4', 'srcrng-uname', 'srcrng-udesc', {
      req: 'rng3',
      children: [i('lvl', 4), f('shard-range', 8), i('shard-bounces', 7)]
    }),
    U('rng5', 3000, 'off5', 'srcrng-uname', 'srcrng-udesc', {
      req: 'rng4',
      children: [i('lvl', 5), f('shard-range', 8.5), i('shard-bounces', 8)]
    }),

    U('cometdmg1', 1000, 'off2', 'cometdmg-uname', 'cometdmg-udesc', {
      children: [i('lvl', 1), i('comet-dmg', 80)]
    }),
    U('cometdmg2', 1800, 'off3', 'cometdmg-uname', 'cometdmg-udesc', {
      req: 'cometdmg1',
      children: [i('lvl', 2), i('comet-dmg', 110), i('comet-mana-cost', 30)]
    }),
    U('cometdmg3', 2400, 'off4', 'cometdmg-uname', 'cometdmg-udesc', {
      req: 'cometdmg2',
      children: [i('lvl', 3), i('comet-dmg', 150)]
    }),
    U('cometdmg4', 3200, 'off5', 'cometdmg-uname', 'cometdmg-udesc', {
      req: 'cometdmg3',
      children: [i('lvl', 4), i('comet-dmg', 190), i('comet-mana-cost', 35)]
    }),

    U('orb', 2200, 'off3', 'orb-uname', 'orb-udesc', {
      children: [b('orb', true), i('orb-shard-dmg', 17), f('orb-time', 3.5)]
    }),
    U('orbtime-1', 2000, 'off3', 'orbtime-uname', 'orbtime-udesc', {
      req: 'orb',
      children: [i('lvl', 1), f('orb-time', 5)]
    }),
    U('orbtime-2', 3000, 'off4', 'orbtime-uname', 'orbtime-udesc', {
      req: 'orbtime-1',
      children: [i('lvl', 2), f('orb-time', 6.5)]
    }),
    U('orbtime-3', 4000, 'off5', 'orbtime-uname', 'orbtime-udesc', {
      req: 'orbtime-2',
      children: [i('lvl', 3), f('orb-time', 8)]
    }),
    U('orbdmg-1', 4000, 'off4', 'orbdmg-uname', 'orbdmg-udesc', {
      req: 'orb',
      children: [i('lvl', 1), i('orb-shard-dmg', 23)]
    }),
    U('orbdmg-2', 5000, 'off5', 'orbdmg-uname', 'orbdmg-udesc', {
      req: 'orbdmg-1',
      children: [i('lvl', 2), i('orb-shard-dmg', 29)]
    }),

    U('chill', 1200, 'off2', 'chill-uname', 'chill-udesc', {
      children: [b('chill', true), i('chill-slow', 20), f('chill-dur', 2)]
    }),
    U('chillslow1', 1800, 'off3', 'chillslow-uname', 'chillslow-udesc', {
      req: 'chill',
      children: [i('lvl', 1), i('chill-slow', 35)]
    }),
    U('chillslow2', 3000, 'off4', 'chillslow-uname', 'chillslow-udesc', {
      req: 'chillslow1',
      children: [i('lvl', 2), i('chill-slow', 50)]
    }),
    U('chillslow3', 4500, 'off5', 'chillslow-uname', 'chillslow-udesc', {
      req: 'chillslow2',
      children: [i('lvl', 3), i('chill-slow', 65)]
    }),
    U('chilldur1', 1400, 'off3', 'chilldur-uname', 'chilldur-udesc', {
      req: 'chill',
      children: [i('lvl', 1), f('chill-dur', 3)]
    }),
    U('chilldur2', 2200, 'off4', 'chilldur-uname', 'chilldur-udesc', {
      req: 'chilldur1',
      children: [i('lvl', 2), f('chill-dur', 4)]
    }),
    U('chilldur3', 3500, 'off5', 'chilldur-uname', 'chilldur-udesc', {
      req: 'chilldur2',
      children: [i('lvl', 3), f('chill-dur', 5)]
    }),

    U('armor-1', 600, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 1)] }),
    U('armor-2', 1200, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 2)]
    }),
    U('armor-3', 1800, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 3)]
    }),
    U('armor-4', 2400, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 4)]
    }),

    U('nova', 1300, 'def2', 'nova-uname', 'nova-udesc', {
      children: [b('nova', true), i('nova-shards', 9), i('nova-mana-cost', 50)]
    }),
    U('novamana-1', 2000, 'def3', 'novamana-uname', 'novamana-udesc', {
      req: 'nova',
      children: [i('lvl', 1), i('nova-mana-cost', 40)]
    }),
    U('novamana-2', 4000, 'def5', 'novamana-uname', 'novamana-udesc', {
      req: 'novamana-1',
      children: [i('lvl', 2), i('nova-mana-cost', 30)]
    }),
    U('novanum-1', 2000, 'def3', 'novanum-uname', 'novanum-udesc', {
      req: 'nova',
      children: [i('lvl', 1), i('nova-shards', 13)]
    }),
    U('novanum-2', 4000, 'def4', 'novanum-uname', 'novanum-udesc', {
      req: 'novanum-1',
      children: [i('lvl', 2), i('nova-shards', 17)]
    }),

    U('fshield1', 1000, 'def1', 'fshield-uname', 'fshield-udesc-1', {
      children: [i('lvl', 1), i('shield-chance', 20)]
    }),
    U('fshield2', 2000, 'def2', 'fshield-uname', 'fshield-udesc-2', {
      req: 'fshield1',
      children: [i('lvl', 2), i('shield-chance', 40)]
    }),
    U('fshield3', 3000, 'def3', 'fshield-uname', 'fshield-udesc-2', {
      req: 'fshield2',
      children: [i('lvl', 3), i('shield-chance', 60)]
    }),
    U('fshield4', 4000, 'def4', 'fshield-uname', 'fshield-udesc-2', {
      req: 'fshield3',
      children: [i('lvl', 4), i('shield-chance', 80)]
    }),
    U('fshield5', 5000, 'def5', 'fshield-uname', 'fshield-udesc-2', {
      req: 'fshield4',
      children: [i('lvl', 5), i('shield-chance', 100)]
    })
  ]
}

// ------------------------------------------------------------------ thief.xml

const thief: TweakUnitFile = {
  kind: 'unit',
  file: 'thief.xml',
  id: 'thief',
  label: 'Thief',
  params: [
    i('max-health', 40),
    i('max-mana', 40),
    i('dmg-reduction', 1),
    i('mana-regen', 1000),
    i('knives-dmg', 5),
    i('knives-arc', 210),
    s('knives-arc-gfx', 'effects/thief_slash.xml'),
    f('knives-range', 1),
    f('knives-speed-mod', -0.6),
    i('kfan-dmg', 10),
    i('kfan-projs', 5),
    i('kfan-arc', 50),
    s('kfan-projectile', 'projectiles/player_knife.xml'),
    i('kfan-mana-cost', 15),
    i('kfan-money-cost', 0),
    b('smoke', false),
    f('smoke-range', 0),
    s('smoke-buff', 'buffs/thief_smoke.xml'),
    i('smoke-mana-cost', 25),
    i('smoke-money-cost', 1000),
    b('chain', false),
    s('chain-buff', 'buffs/thief_stun_1.xml'),
    f('chain-range', 8),
    f('chain-speed', 4),
    i('chain-mana-cost', 5),
    i('chain-money-cost', 1000),
    i('money-chance', 0),
    i('max-fervor', 0),
    i('dodge-chance', 0)
  ],
  upgrades: [
    U('health-1', 600, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 60)] }),
    U('health-2', 1300, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 75)]
    }),
    U('health-3', 1950, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 90)]
    }),
    U('health-4', 2600, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 105)]
    }),
    U('health-5', 3000, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 120)]
    }),

    U('mana-1', 800, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 65), i('mana-regen', 900)]
    }),
    U('mana-2', 1900, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 90), i('mana-regen', 800)]
    }),
    U('mana-3', 3000, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 115), i('mana-regen', 700)]
    }),
    U('mana-4', 4100, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 140), i('mana-regen', 600)]
    }),
    U('mana-5', 5200, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 165), i('mana-regen', 500)]
    }),

    U('dmg1', 800, 'off1', 'thidmg-uname', 'thidmg-udesc', { children: [i('lvl', 1), i('knives-dmg', 8)] }),
    U('dmg2', 1700, 'off2', 'thidmg-uname', 'thidmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('knives-dmg', 12)]
    }),
    U('dmg3', 2800, 'off3', 'thidmg-uname', 'thidmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('knives-dmg', 16)]
    }),
    U('dmg4', 4100, 'off4', 'thidmg-uname', 'thidmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('knives-dmg', 19)]
    }),
    U('dmg5', 5400, 'off5', 'thidmg-uname', 'thidmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('knives-dmg', 23)]
    }),

    U('aspeed1', 250, 'off1', 'aspeed-uname', 'aspeed-udesc', {
      children: [i('lvl', 1), f('knives-speed-mod', -0.5)]
    }),
    U('aspeed2', 700, 'off2', 'aspeed-uname', 'aspeed-udesc', {
      req: 'aspeed1',
      children: [i('lvl', 2), f('knives-speed-mod', -0.4)]
    }),
    U('aspeed3', 1500, 'off3', 'aspeed-uname', 'aspeed-udesc', {
      req: 'aspeed2',
      children: [i('lvl', 3), f('knives-speed-mod', -0.3)]
    }),
    U('aspeed4', 2200, 'off4', 'aspeed-uname', 'aspeed-udesc', {
      req: 'aspeed3',
      children: [i('lvl', 4), f('knives-speed-mod', -0.2)]
    }),

    U('kfandmg1', 1700, 'off2', 'kfandmg-uname', 'kfandmg-udesc', { children: [i('lvl', 1), i('kfan-dmg', 16)] }),
    U('kfandmg2', 3100, 'off3', 'kfandmg-uname', 'kfandmg-udesc', {
      req: 'kfandmg1',
      children: [i('lvl', 2), i('kfan-dmg', 23)]
    }),
    U('kfandmg3', 4300, 'off4', 'kfandmg-uname', 'kfandmg-udesc', {
      req: 'kfandmg2',
      children: [i('lvl', 3), i('kfan-dmg', 30)]
    }),

    U('kfanprojs1', 700, 'off2', 'kfanprojs-uname', 'kfanprojs-udesc', {
      children: [i('lvl', 1), i('kfan-projs', 6), i('kfan-arc', 55)]
    }),
    U('kfanprojs2', 1400, 'off3', 'kfanprojs-uname', 'kfanprojs-udesc', {
      req: 'kfanprojs1',
      children: [i('lvl', 2), i('kfan-projs', 7), i('kfan-arc', 60)]
    }),
    U('kfanprojs3', 2000, 'off4', 'kfanprojs-uname', 'kfanprojs-udesc', {
      req: 'kfanprojs2',
      children: [i('lvl', 3), i('kfan-projs', 8), i('kfan-arc', 65)]
    }),

    U('fervor1', 800, 'off2', 'fervor-uname', 'fervor-udesc-1', { children: [i('lvl', 1), i('max-fervor', 4)] }),
    U('fervor2', 1700, 'off3', 'fervor-uname', 'fervor-udesc-2', {
      req: 'fervor1',
      children: [i('lvl', 2), i('max-fervor', 7)]
    }),
    U('fervor3', 2800, 'off4', 'fervor-uname', 'fervor-udesc-2', {
      req: 'fervor2',
      children: [i('lvl', 3), i('max-fervor', 10)]
    }),

    U('dodge1', 800, 'def1', 'dodge-uname', 'dodge-udesc-1', { children: [i('lvl', 1), i('dodge-chance', 10)] }),
    U('dodge2', 1600, 'def2', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge1',
      children: [i('lvl', 2), i('dodge-chance', 20)]
    }),
    U('dodge3', 2400, 'def3', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge2',
      children: [i('lvl', 3), i('dodge-chance', 30)]
    }),
    U('dodge4', 3200, 'def4', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge3',
      children: [i('lvl', 4), i('dodge-chance', 40)]
    }),
    U('dodge5', 3800, 'def5', 'dodge-uname', 'dodge-udesc-2', {
      req: 'dodge4',
      children: [i('lvl', 5), i('dodge-chance', 50)]
    }),

    U('armor-1', 400, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 2)] }),
    U('armor-2', 700, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 3)]
    }),
    U('armor-3', 1100, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 4)]
    }),
    U('armor-4', 1500, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 5)]
    }),
    U('armor-5', 2000, 'def5', 'armor-uname', 'armor-udesc', {
      req: 'armor-4',
      children: [i('lvl', 5), i('dmg-reduction', 6)]
    }),

    U('chain', 900, 'def2', 'chain-uname', 'chain-udesc', {
      children: [b('chain', true), i('chain-money-cost', 0)]
    }),
    U('chainrng1', 1700, 'def2', 'chainrng-uname', 'chainrng-udesc', {
      req: 'chain',
      children: [i('lvl', 1), f('chain-range', 10)]
    }),
    U('chainrng2', 2600, 'def3', 'chainrng-uname', 'chainrng-udesc', {
      req: 'chainrng1',
      children: [i('lvl', 2), f('chain-range', 12)]
    }),
    U('chainstn1', 1700, 'def3', 'chainstn-uname', 'chainstn1-udesc', {
      req: 'chain',
      children: [i('lvl', 1), s('chain-buff', 'buffs/thief_stun_2.xml')]
    }),
    U('chainstn2', 2600, 'def4', 'chainstn-uname', 'chainstn2-udesc', {
      req: 'chainstn1',
      children: [i('lvl', 2), s('chain-buff', 'buffs/thief_stun_3.xml')]
    }),

    U('smoke', 1200, 'def3', 'smoke-uname', 'smoke-udesc', {
      children: [b('smoke', true), f('smoke-range', 4), i('smoke-money-cost', 0)]
    }),
    U('smokerng1', 2000, 'def4', 'smokerng-uname', 'smokerng-udesc', {
      req: 'smoke',
      children: [i('lvl', 1), f('smoke-range', 5)]
    }),
    U('smokerng2', 2600, 'def5', 'smokerng-uname', 'smokerng-udesc', {
      req: 'smokerng1',
      children: [i('lvl', 2), f('smoke-range', 5.5)]
    })
  ]
}

// ---------------------------------------------------------------- warlock.xml

const warlock: TweakUnitFile = {
  kind: 'unit',
  file: 'warlock.xml',
  id: 'warlock',
  label: 'Warlock',
  params: [
    i('max-health', 75),
    i('max-mana', 75),
    i('dmg-reduction', 0),
    i('mana-regen', 600),
    i('dagger-dmg', 9),
    i('poison-dur', 2500),
    i('poison-dmg', 10),
    i('lightning-dmg', 18),
    i('lightning-bounces', 5),
    i('lightning-mana-cost', 25),
    i('garg-dmg', 0),
    f('garg-dur', 0),
    s('garg-projectile', 'projectiles/player_gargoyle_fireball.xml'),
    i('garg-mana-cost', 35),
    b('storm', false),
    i('storm-dur', -1),
    i('storm-dmg', -1),
    i('storm-mana-cost', 175),
    i('kill-heal', 0),
    i('kill-mana', 0)
  ],
  upgrades: [
    U('health-1', 600, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 90)] }),
    U('health-2', 1200, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 100)]
    }),
    U('health-3', 1800, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 110)]
    }),
    U('health-4', 2400, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 120)]
    }),
    U('health-5', 3000, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 130)]
    }),

    U('mana-1', 800, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 150), i('mana-regen', 550)]
    }),
    U('mana-2', 1400, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 225), i('mana-regen', 500)]
    }),
    U('mana-3', 2200, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 300), i('mana-regen', 450)]
    }),
    U('mana-4', 3000, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 375), i('mana-regen', 400)]
    }),
    U('mana-5', 3800, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 450), i('mana-regen', 350)]
    }),

    U('dmg1', 800, 'off1', 'wardmg-uname', 'wardmg-udesc', { children: [i('lvl', 1), i('dagger-dmg', 14)] }),
    U('dmg2', 1600, 'off2', 'wardmg-uname', 'wardmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('dagger-dmg', 20)]
    }),
    U('dmg3', 2700, 'off3', 'wardmg-uname', 'wardmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('dagger-dmg', 26)]
    }),
    U('dmg4', 3800, 'off4', 'wardmg-uname', 'wardmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('dagger-dmg', 32)]
    }),
    U('dmg5', 4800, 'off5', 'wardmg-uname', 'wardmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('dagger-dmg', 38)]
    }),

    U('poison1', 250, 'off1', 'warpoi-uname', 'warpoi-udesc', { children: [i('lvl', 1), i('poison-dmg', 14)] }),
    U('poison2', 700, 'off2', 'warpoi-uname', 'warpoi-udesc', {
      req: 'poison1',
      children: [i('lvl', 2), i('poison-dmg', 18)]
    }),
    U('poison3', 1500, 'off3', 'warpoi-uname', 'warpoi-udesc', {
      req: 'poison2',
      children: [i('lvl', 3), i('poison-dmg', 22)]
    }),
    U('poison4', 2800, 'off4', 'warpoi-uname', 'warpoi-udesc', {
      req: 'poison3',
      children: [i('lvl', 4), i('poison-dmg', 26)]
    }),
    U('poison5', 3800, 'off5', 'warpoi-uname', 'warpoi-udesc', {
      req: 'poison4',
      children: [i('lvl', 5), i('poison-dmg', 30)]
    }),

    U('lightningdmg1', 1400, 'off2', 'lightningdmg-uname', 'lightningdmg-udesc', {
      children: [i('lvl', 1), i('lightning-dmg', 22)]
    }),
    U('lightningdmg2', 2400, 'off3', 'lightningdmg-uname', 'lightningdmg-udesc', {
      req: 'lightningdmg1',
      children: [i('lvl', 2), i('lightning-dmg', 26)]
    }),
    U('lightningdmg3', 3200, 'off4', 'lightningdmg-uname', 'lightningdmg-udesc', {
      req: 'lightningdmg2',
      children: [i('lvl', 3), i('lightning-dmg', 30)]
    }),
    U('lightningdmg4', 4500, 'off5', 'lightningdmg-uname', 'lightningdmg-udesc', {
      req: 'lightningdmg3',
      children: [i('lvl', 4), i('lightning-dmg', 35)]
    }),

    U('lightningtrg1', 800, 'off2', 'lightningtrg-uname', 'lightningtrg-udesc', {
      children: [i('lvl', 1), i('lightning-bounces', 6), i('lightning-mana-cost', 28)]
    }),
    U('lightningtrg2', 1400, 'off3', 'lightningtrg-uname', 'lightningtrg-udesc', {
      req: 'lightningtrg1',
      children: [i('lvl', 2), i('lightning-bounces', 7), i('lightning-mana-cost', 31)]
    }),
    U('lightningtrg3', 2600, 'off4', 'lightningtrg-uname', 'lightningtrg-udesc', {
      req: 'lightningtrg2',
      children: [i('lvl', 3), i('lightning-bounces', 8), i('lightning-mana-cost', 34)]
    }),
    U('lightningtrg4', 3600, 'off5', 'lightningtrg-uname', 'lightningtrg-udesc', {
      req: 'lightningtrg3',
      children: [i('lvl', 4), i('lightning-bounces', 9), i('lightning-mana-cost', 37)]
    }),

    U('storm', 2200, 'off3', 'storm-uname', 'storm-udesc', {
      children: [b('storm', true), i('storm-dur', 7), i('storm-dmg', 16)]
    }),
    U('stormdmg-1', 3500, 'off4', 'stormdmg-uname', 'stormdmg-udesc', {
      req: 'storm',
      children: [i('lvl', 1), i('storm-dmg', 28)]
    }),
    U('stormdmg-2', 4500, 'off5', 'stormdmg-uname', 'stormdmg-udesc', {
      req: 'stormdmg-1',
      children: [i('lvl', 2), i('storm-dmg', 40)]
    }),
    U('stormdur-1', 3500, 'off4', 'stormdur-uname', 'stormdur-udesc', {
      req: 'storm',
      children: [i('lvl', 1), i('storm-dur', 9)]
    }),
    U('stormdur-2', 4500, 'off5', 'stormdur-uname', 'stormdur-udesc', {
      req: 'stormdur-1',
      children: [i('lvl', 2), i('storm-dur', 11)]
    }),

    U('kmana1', 3000, 'off2', 'kmana-uname', 'kmana-udesc-1', { children: [i('lvl', 1), i('kill-mana', 1)] }),
    U('kmana2', 4000, 'off3', 'kmana-uname', 'kmana-udesc-2', {
      req: 'kmana1',
      children: [i('lvl', 2), i('kill-mana', 2)]
    }),
    U('kmana3', 5000, 'off4', 'kmana-uname', 'kmana-udesc-2', {
      req: 'kmana2',
      children: [i('lvl', 3), i('kill-mana', 3)]
    }),

    U('armor-1', 1200, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 1)] }),
    U('armor-2', 2400, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 2)]
    }),
    U('armor-3', 3600, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 3)]
    }),
    U('armor-4', 4800, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 4)]
    }),
    U('armor-5', 6000, 'def5', 'armor-uname', 'armor-udesc', {
      req: 'armor-4',
      children: [i('lvl', 5), i('dmg-reduction', 5)]
    }),

    // gargdmg1 / gargdur1 carry no req in the stock file
    U('garg', 900, 'def2', 'garg-uname', 'garg-udesc', {
      children: [i('garg-dmg', 15), f('garg-dur', 4.0), i('garg-mana-cost', 35)]
    }),
    U('gargdmg1', 2000, 'def3', 'gargdmg-uname', 'gargdmg-udesc', { children: [i('lvl', 1), i('garg-dmg', 20)] }),
    U('gargdmg2', 3000, 'def4', 'gargdmg-uname', 'gargdmg-udesc', {
      req: 'gargdmg1',
      children: [i('lvl', 2), i('garg-dmg', 25)]
    }),
    U('gargdur1', 2000, 'def3', 'gargdur-uname', 'gargdur-udesc', {
      children: [i('lvl', 1), f('garg-dur', 6.0), i('garg-mana-cost', 40)]
    }),
    U('gargdur2', 3000, 'def4', 'gargdur-uname', 'gargdur-udesc', {
      req: 'gargdur1',
      children: [i('lvl', 2), f('garg-dur', 8.0), i('garg-mana-cost', 45)]
    }),

    U('kheal1', 1000, 'def1', 'kheal-uname', 'kheal-udesc-1', { children: [i('lvl', 1), i('kill-heal', 20)] }),
    U('kheal2', 2000, 'def2', 'kheal-uname', 'kheal-udesc-2', {
      req: 'kheal1',
      children: [i('lvl', 2), i('kill-heal', 40)]
    }),
    U('kheal3', 3000, 'def3', 'kheal-uname', 'kheal-udesc-2', {
      req: 'kheal2',
      children: [i('lvl', 3), i('kill-heal', 60)]
    }),
    U('kheal4', 4000, 'def4', 'kheal-uname', 'kheal-udesc-2', {
      req: 'kheal3',
      children: [i('lvl', 4), i('kill-heal', 80)]
    }),
    U('kheal5', 5000, 'def5', 'kheal-uname', 'kheal-udesc-2', {
      req: 'kheal4',
      children: [i('lvl', 5), i('kill-heal', 100)]
    })
  ]
}

// ----------------------------------------------------------------- wizard.xml

const wizard: TweakUnitFile = {
  kind: 'unit',
  file: 'wizard.xml',
  id: 'wizard',
  label: 'Wizard',
  params: [
    i('max-health', 35),
    i('max-mana', 75),
    i('dmg-reduction', 0),
    i('mana-regen', 600),
    i('fireball-dmg', 10),
    f('fireball-splash', 1),
    f('fireball-range', 3),
    s('fireball-projectile', 'projectiles/player_fireball_3.xml'),
    i('fireball-mana-cost', 0),
    i('spray-dmg', 6),
    f('spray-dist', 3),
    i('spray-mana-cost', 4),
    b('fnova', false),
    i('fnova-ttl', -1),
    i('fnova-flames', -1),
    i('fnova-slow', 0),
    i('fnova-mana-cost', 20),
    b('meteor', false),
    i('meteor-dmg', -1),
    i('meteor-amount', -1),
    i('meteor-mana-cost', 90),
    b('fire-shield', false),
    b('combust', false),
    i('combust-dmg', -1),
    f('combust-dur', -1)
  ],
  upgrades: [
    U('health-1', 800, 'misc1', 'hp-uname', 'hp-udesc', { children: [i('lvl', 1), i('max-health', 45)] }),
    U('health-2', 1500, 'misc2', 'hp-uname', 'hp-udesc', {
      req: 'health-1',
      children: [i('lvl', 2), i('max-health', 60)]
    }),
    U('health-3', 2200, 'misc3', 'hp-uname', 'hp-udesc', {
      req: 'health-2',
      children: [i('lvl', 3), i('max-health', 70)]
    }),
    U('health-4', 2900, 'misc4', 'hp-uname', 'hp-udesc', {
      req: 'health-3',
      children: [i('lvl', 4), i('max-health', 85)]
    }),
    U('health-5', 3600, 'misc5', 'hp-uname', 'hp-udesc', {
      req: 'health-4',
      children: [i('lvl', 5), i('max-health', 100)]
    }),

    U('mana-1', 600, 'misc1', 'mana-uname', 'mana-udesc', {
      children: [i('lvl', 1), i('max-mana', 130), i('mana-regen', 500)]
    }),
    U('mana-2', 1400, 'misc2', 'mana-uname', 'mana-udesc', {
      req: 'mana-1',
      children: [i('lvl', 2), i('max-mana', 185), i('mana-regen', 400)]
    }),
    U('mana-3', 2200, 'misc3', 'mana-uname', 'mana-udesc', {
      req: 'mana-2',
      children: [i('lvl', 3), i('max-mana', 240), i('mana-regen', 350)]
    }),
    U('mana-4', 3000, 'misc4', 'mana-uname', 'mana-udesc', {
      req: 'mana-3',
      children: [i('lvl', 4), i('max-mana', 295), i('mana-regen', 300)]
    }),
    U('mana-5', 3800, 'misc5', 'mana-uname', 'mana-udesc', {
      req: 'mana-4',
      children: [i('lvl', 5), i('max-mana', 350), i('mana-regen', 250)]
    }),

    U('dmg1', 800, 'off1', 'wizdmg-uname', 'wizdmg-udesc', {
      children: [i('lvl', 1), i('fireball-dmg', 14), f('fireball-splash', 1.25)]
    }),
    U('dmg2', 1600, 'off2', 'wizdmg-uname', 'wizdmg-udesc', {
      req: 'dmg1',
      children: [i('lvl', 2), i('fireball-dmg', 18), f('fireball-splash', 1.45)]
    }),
    U('dmg3', 2700, 'off3', 'wizdmg-uname', 'wizdmg-udesc', {
      req: 'dmg2',
      children: [i('lvl', 3), i('fireball-dmg', 22), f('fireball-splash', 1.65)]
    }),
    U('dmg4', 4500, 'off4', 'wizdmg-uname', 'wizdmg-udesc', {
      req: 'dmg3',
      children: [i('lvl', 4), i('fireball-dmg', 25), f('fireball-splash', 1.85)]
    }),
    U('dmg5', 6000, 'off5', 'wizdmg-uname', 'wizdmg-udesc', {
      req: 'dmg4',
      children: [i('lvl', 5), i('fireball-dmg', 28), f('fireball-splash', 2.0)]
    }),

    U('rng1', 500, 'off1', 'wizrng-uname', 'wizrng-udesc', {
      children: [i('lvl', 1), f('fireball-range', 3.5), s('fireball-projectile', 'projectiles/player_fireball_3.xml')]
    }),
    U('rng2', 1000, 'off2', 'wizrng-uname', 'wizrng-udesc', {
      req: 'rng1',
      children: [i('lvl', 2), f('fireball-range', 4), s('fireball-projectile', 'projectiles/player_fireball_4.xml')]
    }),
    U('rng3', 1700, 'off3', 'wizrng-uname', 'wizrng-udesc', {
      req: 'rng2',
      children: [i('lvl', 3), f('fireball-range', 4.5), s('fireball-projectile', 'projectiles/player_fireball_4.xml')]
    }),
    U('rng4', 2500, 'off4', 'wizrng-uname', 'wizrng-udesc', {
      req: 'rng3',
      children: [i('lvl', 4), f('fireball-range', 5), s('fireball-projectile', 'projectiles/player_fireball_5.xml')]
    }),
    U('rng5', 3000, 'off5', 'wizrng-uname', 'wizrng-udesc', {
      req: 'rng4',
      children: [i('lvl', 5), f('fireball-range', 6.5), s('fireball-projectile', 'projectiles/player_fireball_6.xml')]
    }),

    U('spraydmg1', 1000, 'off2', 'spraydmg-uname', 'spraydmg-udesc', { children: [i('lvl', 1), i('spray-dmg', 10)] }),
    U('spraydmg2', 1800, 'off3', 'spraydmg-uname', 'spraydmg-udesc', {
      req: 'spraydmg1',
      children: [i('lvl', 2), i('spray-dmg', 14), i('spray-mana-cost', 5)]
    }),
    U('spraydmg3', 2400, 'off4', 'spraydmg-uname', 'spraydmg-udesc', {
      req: 'spraydmg2',
      children: [i('lvl', 3), i('spray-dmg', 18)]
    }),
    U('spraydmg4', 3200, 'off5', 'spraydmg-uname', 'spraydmg-udesc', {
      req: 'spraydmg3',
      children: [i('lvl', 4), i('spray-dmg', 22), i('spray-mana-cost', 6)]
    }),

    U('meteor', 2200, 'off3', 'meteor-uname', 'meteor-udesc', {
      children: [b('meteor', true), i('meteor-dmg', 60), i('meteor-amount', 3)]
    }),
    U('meteornum-1', 2000, 'off3', 'meteornum-uname', 'meteornum-udesc', {
      req: 'meteor',
      children: [i('lvl', 1), i('meteor-amount', 5)]
    }),
    U('meteornum-2', 3000, 'off4', 'meteornum-uname', 'meteornum-udesc', {
      req: 'meteornum-1',
      children: [i('lvl', 2), i('meteor-amount', 6)]
    }),
    U('meteornum-3', 4000, 'off5', 'meteornum-uname', 'meteornum-udesc', {
      req: 'meteornum-2',
      children: [i('lvl', 3), i('meteor-amount', 7)]
    }),
    U('meteordmg-1', 4000, 'off4', 'meteordmg-uname', 'meteordmg-udesc', {
      req: 'meteor',
      children: [i('lvl', 1), i('meteor-dmg', 100)]
    }),
    U('meteordmg-2', 5000, 'off5', 'meteordmg-uname', 'meteordmg-udesc', {
      req: 'meteordmg-1',
      children: [i('lvl', 2), i('meteor-dmg', 140)]
    }),

    U('combust', 1200, 'off2', 'combust-uname', 'combust-udesc', {
      children: [b('combust', true), i('combust-dmg', 8), f('combust-dur', 3)]
    }),
    U('combustdmg1', 1800, 'off3', 'combustdmg-uname', 'combustdmg-udesc', {
      req: 'combust',
      children: [i('lvl', 1), i('combust-dmg', 12)]
    }),
    U('combustdmg2', 3000, 'off4', 'combustdmg-uname', 'combustdmg-udesc', {
      req: 'combustdmg1',
      children: [i('lvl', 2), i('combust-dmg', 16)]
    }),
    U('combustdmg3', 4500, 'off5', 'combustdmg-uname', 'combustdmg-udesc', {
      req: 'combustdmg2',
      children: [i('lvl', 3), i('combust-dmg', 20)]
    }),
    U('combustdur1', 1400, 'off3', 'combustdur-uname', 'combustdur-udesc', {
      req: 'combust',
      children: [i('lvl', 1), f('combust-dur', 4)]
    }),
    U('combustdur2', 2200, 'off4', 'combustdur-uname', 'combustdur-udesc', {
      req: 'combustdur1',
      children: [i('lvl', 2), f('combust-dur', 5)]
    }),
    U('combustdur3', 3500, 'off5', 'combustdur-uname', 'combustdur-udesc', {
      req: 'combustdur2',
      children: [i('lvl', 3), f('combust-dur', 6)]
    }),

    U('armor-1', 600, 'def1', 'armor-uname', 'armor-udesc', { children: [i('lvl', 1), i('dmg-reduction', 1)] }),
    U('armor-2', 1200, 'def2', 'armor-uname', 'armor-udesc', {
      req: 'armor-1',
      children: [i('lvl', 2), i('dmg-reduction', 2)]
    }),
    U('armor-3', 1800, 'def3', 'armor-uname', 'armor-udesc', {
      req: 'armor-2',
      children: [i('lvl', 3), i('dmg-reduction', 3)]
    }),
    U('armor-4', 2400, 'def4', 'armor-uname', 'armor-udesc', {
      req: 'armor-3',
      children: [i('lvl', 4), i('dmg-reduction', 4)]
    }),

    U('fnova', 1300, 'def2', 'fnova-uname', 'fnova-udesc', {
      children: [
        b('fnova', true),
        i('fnova-flames', 10),
        i('fnova-slow', 30),
        i('fnova-ttl', 275),
        i('fnova-mana-cost', 30)
      ]
    }),
    U('fnovanum-1', 2000, 'def3', 'fnovanum-uname', 'fnovanum-udesc', {
      req: 'fnova',
      children: [i('lvl', 1), i('fnova-flames', 13), i('fnova-ttl', 350), i('fnova-mana-cost', 40)]
    }),
    U('fnovanum-2', 4000, 'def4', 'fnovanum-uname', 'fnovanum-udesc', {
      req: 'fnovanum-1',
      children: [i('lvl', 2), i('fnova-flames', 16), i('fnova-ttl', 500), i('fnova-mana-cost', 50)]
    }),
    U('fnovanum-3', 6000, 'def5', 'fnovanum-uname', 'fnovanum-udesc', {
      req: 'fnovanum-2',
      children: [i('lvl', 3), i('fnova-flames', 18), i('fnova-ttl', 600)]
    }),
    U('fnovaslow-1', 2000, 'def3', 'fnovaslow-uname', 'fnovaslow-udesc', {
      req: 'fnova',
      children: [i('lvl', 1), i('fnova-slow', 50)]
    }),
    U('fnovaslow-2', 2500, 'def4', 'fnovaslow-uname', 'fnovaslow-udesc', {
      req: 'fnovaslow-1',
      children: [i('lvl', 2), i('fnova-slow', 70)]
    }),
    U('fnovaslow-3', 3000, 'def5', 'fnovaslow-uname', 'fnovaslow-udesc', {
      req: 'fnovaslow-2',
      children: [i('lvl', 3), i('fnova-slow', 90)]
    }),

    U('fire-shield', 2000, 'def1', 'fireshield-uname', 'fireshield-udesc', { children: [b('fire-shield', true)] })
  ]
}

/** All nine stock tweak files, in UI display order. */
export const TWEAK_BASELINE: TweakFile[] = [
  general,
  shared,
  knight,
  priest,
  ranger,
  sorcerer,
  thief,
  warlock,
  wizard
]

/** The seven playable classes, for the loadout sheet. */
export const TWEAK_CLASS_IDS = ['knight', 'priest', 'ranger', 'sorcerer', 'thief', 'warlock', 'wizard']
