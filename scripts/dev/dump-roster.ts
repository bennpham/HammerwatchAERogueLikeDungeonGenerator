import { MONSTER_TYPES, MONSTER_VARIANT_GROUPS, monsterVariants, monsterVariantsInGroup, resolveActorPath } from '../../src/generator'
console.log('groups', MONSTER_VARIANT_GROUPS)
for (const t of MONSTER_TYPES) console.log(t.id, '|', t.group, t.deprecated ? 'DEP' : '', '|', monsterVariants(t).map(v => `${v.key}=${v.actorPath}${v.role ? '['+v.role+']' : ''}`).join(' , '))
console.log('spawners', monsterVariantsInGroup('Spawners').map(v => v.key + '=' + v.actorPath))
console.log('bogus', resolveActorPath('bogus'))
