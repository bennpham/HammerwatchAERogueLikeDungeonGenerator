import type { TweakGeneralFile, TweakParam, TweakUnitFile } from './types'

/**
 * Serializers for the tweak XML dialect.
 *
 * The classes in ../xml/ emit the *level* dialect only — element-name-is-type
 * plus a single `name` attribute — and cannot express the arbitrary attributes
 * (`id`, `cost`, `cat`, `req`, `life-cost-scale`, …) or the self-closing forms
 * the tweak files use, so this module builds that dialect directly.
 */

const TAB = '\t'

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Shortest round-trippable form: 0.75 stays 0.75, 1.0 collapses to 1. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(value)
}

function formatValue(param: TweakParam): string {
  switch (param.type) {
    case 'bool':
      // the shipped tweak files use lowercase, unlike the level dialect's True/False
      return param.value ? 'true' : 'false'
    case 'int':
      return String(Math.trunc(Number(param.value)))
    case 'float':
      return formatNumber(Number(param.value))
    default:
      return xmlEscape(String(param.value))
  }
}

function paramLine(param: TweakParam, indent: string): string {
  return `${indent}<${param.type} name="${xmlEscape(param.name)}">${formatValue(param)}</${param.type}>`
}

function attrs(pairs: Array<[string, string | undefined]>): string {
  return pairs
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([key, value]) => ` ${key}="${xmlEscape(value)}"`)
    .join('')
}

/** knight.xml, shared.xml, … */
export function serializeUnitFile(file: TweakUnitFile): string {
  const lines: string[] = ['<tweak>', `${TAB}<params>`, `${TAB.repeat(2)}<dictionary>`]

  for (const param of file.params) {
    lines.push(paramLine(param, TAB.repeat(3)))
  }

  lines.push(`${TAB.repeat(2)}</dictionary>`, `${TAB}</params>`, '', `${TAB}<upgrades>`)

  for (const upgrade of file.upgrades) {
    const head =
      `${TAB.repeat(2)}<dictionary` +
      attrs([
        ['id', upgrade.id],
        ['cost', String(Math.trunc(upgrade.cost))],
        ['req', upgrade.req],
        ['cat', upgrade.cat],
        ['name', upgrade.nameKey],
        ['desc', upgrade.descKey],
        ...Object.entries(upgrade.extra ?? {}).map(
          ([key, value]) => [key, value] as [string, string]
        )
      ])

    if (upgrade.children.length === 0) {
      lines.push(`${head} />`)
      continue
    }

    lines.push(`${head}>`)
    for (const child of upgrade.children) {
      lines.push(paramLine(child, TAB.repeat(3)))
    }
    lines.push(`${TAB.repeat(2)}</dictionary>`)
  }

  lines.push(`${TAB}</upgrades>`, '</tweak>')
  return lines.join('\n')
}

/** general.xml */
export function serializeGeneralFile(file: TweakGeneralFile): string {
  const lines: string[] = ['<dictionary>']

  file.difficulties.forEach((difficulty, index) => {
    if (index > 0) lines.push('')
    lines.push(`${TAB}<dictionary name="${xmlEscape(difficulty.name)}">`)
    for (const value of difficulty.values) {
      lines.push(paramLine(value, TAB.repeat(2)))
    }
    lines.push(`${TAB}</dictionary>`)
  })

  lines.push('</dictionary>')
  return lines.join('\n')
}
