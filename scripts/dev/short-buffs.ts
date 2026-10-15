import { BUFF_DEFS } from '../../src/generator/objects/buffTypes'
for (const d of BUFF_DEFS) if (d.description.length <= 20) console.log(d.id, JSON.stringify(d.description), d.path)
