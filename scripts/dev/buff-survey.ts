// Every buff in actors/buffs.sval with its numbers, for objects/buffTypes.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSval } from '../../src/generator/ae/sval'
import type { SvalNode } from '../../src/generator/ae/sval'
// @ts-expect-error untyped dev helper
import { findAeAssets } from '../lib/aeunit.mjs'
const { assets } = findAeAssets()
const root = parseSval(readFileSync(join(assets, 'actors/buffs.sval'), 'utf8'))
const flat = (n: SvalNode, prefix = ''): string[] =>
  n.children.flatMap((c) =>
    c.tag === 'dict' || c.tag === 'array'
      ? flat(c, `${prefix}${c.name ?? ''}.`)
      : [`${prefix}${c.name ?? ''}=${c.text.trim()}`]
  )
for (const b of root.children) console.log(`${b.name}: ${flat(b).filter((s) => !/icon|effect|color|sound|anim|scene|offset|layer/i.test(s)).join(' ')}`)
