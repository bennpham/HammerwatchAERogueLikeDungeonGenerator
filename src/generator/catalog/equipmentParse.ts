/**
 * Readers for AE's equipment files, shared by `scripts/scan-ae-equipment.ts`
 * (which writes `equipment.generated.ts`) and the test that checks the
 * snapshot against an install. Pure: text in, data out.
 *
 *   tweak/shops/equipment.sval       the item vendor's loot tables
 *   tweak/items/<quality>.sval       the items, one file per quality
 *   res/language/english/items.lang  their names and effect lines
 */

export type EquipmentQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique'

export const EQUIPMENT_QUALITIES: readonly EquipmentQuality[] = ['common', 'uncommon', 'rare', 'epic', 'unique']

/** One roll of an item stall: a quality drawn by weight (weights sum to ~1000). */
export type EquipmentSlot = ReadonlyArray<{ quality: EquipmentQuality; weight: number }>

export interface EquipmentItem {
  id: string
  /** English name */
  name: string
  quality: EquipmentQuality
  /** English effect line, placeholders filled in */
  effect: string
  /** `shop-blocked`: never sold, and skipped by AE's random-by-quality pick */
  shopBlocked: boolean
}

/** The item vendor's tables an item stall can sell, `equipment_1` … `equipment_5`. */
export const EQUIPMENT_TIER_IDS = ['equipment_1', 'equipment_2', 'equipment_3', 'equipment_4', 'equipment_5'] as const

function isQuality(q: string): q is EquipmentQuality {
  return (EQUIPMENT_QUALITIES as readonly string[]).includes(q)
}

/**
 * The slots of every `equipment_<n>` table in `tweak/shops/equipment.sval`:
 * one entry per pool, each pool's `drops` a run of `<i>weight</i><dict>quality</dict>`.
 */
export function parseEquipmentTiers(sval: string): Record<string, EquipmentSlot[]> {
  const out: Record<string, EquipmentSlot[]> = {}
  // each table is `<string name="id">…</string>` followed by its pools,
  // up to the next table's id
  const parts = sval.split(/<string name="id">/).slice(1)
  for (const part of parts) {
    const id = part.slice(0, part.indexOf('<'))
    if (!/^equipment_\d+$/.test(id)) continue
    const pools = part.split(/<array name="drops">/).slice(1)
    out[id] = pools.map((pool) => {
      const body = pool.slice(0, pool.indexOf('</array>'))
      const slot: Array<{ quality: EquipmentQuality; weight: number }> = []
      for (const m of body.matchAll(/<i>(\d+)<\/i>\s*<dict>[\s\S]*?<string name="quality">(\w+)<\/string>/g)) {
        if (isQuality(m[2])) slot.push({ quality: m[2], weight: Number(m[1]) })
      }
      return slot
    })
  }
  return out
}

/** `<string name="key">value</string>` pairs of a `.lang` file. */
export function parseLang(lang: string): Record<string, string> {
  const strings: Record<string, string> = {}
  for (const m of lang.matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)) strings[m[1]] = m[2]
  return strings
}

/** `.equipment.x.desc?percent=20&n=3` → the English line with `%percent%` filled in. */
function resolveText(ref: string, strings: Record<string, string>): string {
  const [key, query] = ref.replace(/^\./, '').split('?')
  let text = strings[key] ?? key
  if (query !== undefined) {
    for (const kv of query.split('&')) {
      const [k, v] = kv.split('=')
      text = text.split(`%${k}%`).join(v ?? '')
    }
  }
  return text.replace(/%%/g, '%').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The items of one `tweak/items/<quality>.sval` file. */
export function parseEquipmentItems(sval: string, strings: Record<string, string>): EquipmentItem[] {
  const items: EquipmentItem[] = []
  for (const part of sval.split(/<string name="id">/).slice(1)) {
    const id = part.slice(0, part.indexOf('<'))
    const get = (k: string): string | undefined => new RegExp(`<string name="${k}">([^<]*)<`).exec(part)?.[1]
    const quality = get('quality') ?? ''
    if (!isQuality(quality)) continue
    items.push({
      id,
      name: resolveText(get('name') ?? id, strings),
      quality,
      effect: resolveText(get('desc') ?? '', strings),
      shopBlocked: /<bool name="shop-blocked">t/.test(part)
    })
  }
  return items
}
