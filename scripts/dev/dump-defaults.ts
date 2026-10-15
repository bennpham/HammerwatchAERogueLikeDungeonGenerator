import { defaultParameters } from '../../src/generator'
const p = defaultParameters()
console.log(JSON.stringify({ levels: p.levels, themes: p.themes, levelMonsters: p.levelMonsters, max: p.monsterMax }, null, 0))
