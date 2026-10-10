import { buffById } from '../../src/generator/objects/buffTypes'
for (const id of ['frost', 'bloodlust', 'cripple', 'slime_poison', 'thief_stun_1']) console.log(id, buffById(id)?.path)
