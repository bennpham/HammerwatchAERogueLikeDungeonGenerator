import { Tile } from './tile'
import { DoodadTypeName } from '../objects/doodad'

// Pattern cell values (ported from WallPattern.java)
const w = 1 // wall
const e = 2 // empty
const d = 0 // don't care

type PatternGrid = number[][] // 5 rows x 3 cols
interface PatternDef {
  doodad: DoodadTypeName
  patterns: PatternGrid[]
  /** true = matches walls, false = matches floor decorations (cover) */
  wall: boolean
}

/**
 * 3x5 neighborhood patterns matched around every tile to pick which wall
 * doodad piece belongs there. Order matters: the first matching pattern wins,
 * exactly like the Java enum iteration order.
 */
const PATTERNS: PatternDef[] = [
  {
    doodad: 'CornerLD',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [e, w, w],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'CornerRD',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [w, w, e],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'CornerLU',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [e, w, w],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'CornerRU',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [w, w, e],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'Horizontal',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [w, w, w],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'Vertical',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [e, w, e],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'Cover',
    wall: false,
    patterns: [
      [
        [d, d, d],
        [d, w, w],
        [d, w, w],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'CrossWall',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [w, w, w],
        [e, w, d],
        [d, d, d],
        [d, d, d]
      ],
      [
        [e, w, d],
        [w, w, w],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ],
      [
        [d, w, e],
        [w, w, w],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ],
      [
        [d, w, d],
        [w, w, w],
        [d, w, e],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'HCapRight',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [w, w, e],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'HCapLeft',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [e, w, w],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'VCapUp',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [e, w, e],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'VCapDown',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [e, w, e],
        [d, d, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'TDown',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [w, w, w],
        [d, e, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'TUp',
    wall: true,
    patterns: [
      [
        [d, e, d],
        [w, w, w],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'TLeft',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [e, w, w],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  },
  {
    doodad: 'TRight',
    wall: true,
    patterns: [
      [
        [d, w, d],
        [w, w, e],
        [d, w, d],
        [d, d, d],
        [d, d, d]
      ]
    ]
  }
]

/**
 * Find the doodad for the tile at (x, y), or null if nothing matches.
 * Out-of-bounds neighbors count as walls, exactly like the original.
 */
export function searchPatterns(
  x: number,
  y: number,
  tileArray: Tile[],
  width: number,
  wall: boolean
): DoodadTypeName | null {
  for (const p of PATTERNS) {
    if (p.wall !== wall) continue

    for (const pattern of p.patterns) {
      let match = true

      outer: for (let xi = 0; xi < 3; xi++) {
        const xOffset = xi - 1
        for (let yi = 0; yi < 5; yi++) {
          const yOffset = yi - 1

          let isWall = true
          const index = x + xOffset + (y + yOffset) * width
          if (index >= 0 && index < tileArray.length) {
            isWall = tileArray[index].wall
          }

          const cell = pattern[yi][xi]
          if (cell === d) continue
          if (cell === w ? !isWall : isWall) {
            match = false
            break outer
          }
        }
      }

      if (match) {
        return p.doodad
      }
    }
  }

  return null
}
