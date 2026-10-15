import { MONSTER_TYPES, monsterCategories } from '../../src/generator'
const want = ['bat', 'tick', 'maggot', 'slime', 'skeleton_lich', 'tower_nova_ice', 'mb_tick', 'mb_mummy', 'mummy', 'prison_warrior', 'bonus_demon', 'tower_battlement_empty', 'spider', 'vampire_bat', 'ghost']
for (const id of want) console.log(id, monsterCategories(MONSTER_TYPES.find((t) => t.id === id)!))
const byGroup: Record<string, Set<string>> = {}
for (const t of MONSTER_TYPES) (byGroup[t.group] ??= new Set()).add(monsterCategories(t).join('+'))
console.log(Object.fromEntries(Object.entries(byGroup).map(([g, s]) => [g, [...s]])))
console.log('deprecated', MONSTER_TYPES.filter((t) => t.deprecated).map((t) => t.id))
