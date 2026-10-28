import React, { useEffect, useRef, useState } from 'react'
import type { LevelPreview as LevelPreviewData } from '../../generator'

const ROOM_COLORS: Record<string, string> = {
  Entrance: '#3fae6a',
  Exit: '#3f7fae',
  Orb: '#9b59d0',
  // the arena's single synthetic room — without an entry it fell through to the
  // grey `None` and got no label at all
  Boss: '#c0455f',
  Shop: '#d0a53f',
  Vault: '#d0703f',
  Lair: '#b04a4a',
  Storage: '#3fa8a0',
  None: '#666666'
}

const ROOM_LABELS: Record<string, string> = {
  Entrance: 'IN',
  Exit: 'OUT',
  Orb: 'ORB',
  Boss: 'BOSS',
  Shop: '$',
  Vault: 'V',
  Storage: 'S'
}

/** A world's tiles by kind: the `WorldPreview.map` chars. */
const WORLD_TILE_COLORS: Record<string, [number, number, number]> = {
  '0': [32, 70, 110], // water
  '1': [70, 110, 60], // land
  '2': [120, 112, 100], // cliff
  '3': [150, 120, 80], // trail
  '4': [40, 75, 40] // trees, rocks
}

/** A world's marks: colour and the letter drawn on it. */
const WORLD_SITE_STYLE: Record<string, { color: string; label: string; legend: string }> = {
  boss: { color: '#c0455f', label: 'B', legend: 'Boss' },
  button: { color: '#d0a53f', label: '●', legend: 'Button' },
  ambush: { color: '#e06030', label: '!', legend: 'Ambush' },
  pack: { color: '#b04a4a', label: '', legend: 'Pack' },
  loot: { color: '#e0d060', label: '', legend: 'Loot' }
}

/** A world: the island tile by tile, then its sites, then the portal. */
function drawWorld(g: CanvasRenderingContext2D, level: LevelPreviewData, scale: number): void {
  const world = level.world!
  const image = g.createImageData(level.mapWidth, level.mapHeight)
  for (let i = 0; i < world.map.length; i++) {
    const [r, gr, b] = WORLD_TILE_COLORS[world.map[i]] ?? WORLD_TILE_COLORS['1']
    image.data.set([r, gr, b, 255], i * 4)
  }
  const tiles = document.createElement('canvas')
  tiles.width = level.mapWidth
  tiles.height = level.mapHeight
  tiles.getContext('2d')!.putImageData(image, 0, 0)
  g.imageSmoothingEnabled = false
  g.drawImage(tiles, 0, 0, level.mapWidth * scale, level.mapHeight * scale)

  const mark = (x: number, y: number, radius: number, color: string, label: string) => {
    g.fillStyle = color
    g.beginPath()
    g.arc((x + 0.5) * scale, (y + 0.5) * scale, radius, 0, Math.PI * 2)
    g.fill()
    if (label === '') return
    g.fillStyle = '#14161c'
    g.font = `bold ${Math.round(radius * 1.4)}px sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, (x + 0.5) * scale, (y + 0.5) * scale)
  }
  const big = Math.max(5, scale * 3)
  for (const site of world.sites) {
    const style = WORLD_SITE_STYLE[site.kind]
    const small = site.kind === 'pack' || site.kind === 'loot'
    mark(site.x, site.y, small ? Math.max(2, scale) : big, style.color, style.label)
  }
  mark(world.hub.x, world.hub.y, big, '#9b59d0', '◎')
}

interface LevelPreviewProps {
  levels: LevelPreviewData[]
  seed: number | null
}

/** Canvas map of one generated level with a level selector and legend. */
export function LevelPreview({ levels, seed }: LevelPreviewProps) {
  const [activeLevel, setActiveLevel] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const level = levels[Math.min(activeLevel, levels.length - 1)] ?? null

  useEffect(() => {
    if (activeLevel >= levels.length) setActiveLevel(0)
  }, [levels, activeLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !level) return

    const scale = Math.max(1, Math.floor(Math.min(760 / level.mapWidth, 560 / level.mapHeight)))
    canvas.width = level.mapWidth * scale
    canvas.height = level.mapHeight * scale
    const g = canvas.getContext('2d')!
    if (level.world !== undefined) {
      drawWorld(g, level, scale)
      return
    }

    // walls / floor from the rasterized grid
    g.fillStyle = '#14161c'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = '#3a3f4d'
    for (let y = 0; y < level.mapHeight; y++) {
      for (let x = 0; x < level.mapWidth; x++) {
        if (level.walls[x + y * level.mapWidth] === '0') {
          g.fillRect(x * scale, y * scale, scale, scale)
        }
      }
    }

    // rooms colored by type
    for (const room of level.rooms) {
      const color = ROOM_COLORS[room.type] ?? ROOM_COLORS.None
      g.fillStyle = color + '55'
      g.fillRect(room.x * scale, room.y * scale, (room.width + 1) * scale, (room.height + 1) * scale)
      g.strokeStyle = color
      g.lineWidth = Math.max(1, scale / 4)
      g.strokeRect(room.x * scale, room.y * scale, (room.width + 1) * scale, (room.height + 1) * scale)

      // a sealed room is gated too, but by a wall and a button rather than a
      // door and a key — the padlock would send the player hunting for a key
      // that does not exist
      const gate = room.sealed ? ' 🔘' : room.locked ? ' 🔒' : ''
      const label = (ROOM_LABELS[room.type] ?? '') + gate
      if (label) {
        g.fillStyle = '#f5f0e6'
        g.font = `bold ${Math.max(10, scale * 2)}px sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(
          label,
          (room.x + (room.width + 1) / 2) * scale,
          (room.y + (room.height + 1) / 2) * scale
        )
      }
    }
  }, [level])

  if (!level) {
    return (
      <div className="preview-empty">
        <p>No dungeon yet — press Generate to see the map.</p>
      </div>
    )
  }

  return (
    <div className="preview">
      <div className="preview-tabs">
        {levels.map((l, i) => (
          <button
            key={i}
            className={i === activeLevel ? 'tab active' : 'tab'}
            onClick={() => setActiveLevel(i)}
          >
            {l.label ?? i + 1}
          </button>
        ))}
        <span className="preview-meta">
          {level.world !== undefined ? `biome ${level.theme} · ${level.mapWidth}×${level.mapHeight}` : `theme ${level.theme} · ${level.rooms.length} rooms`} · {level.monsterCount} monsters ·{' '}
          {level.itemCount} items{seed !== null ? ` · seed ${seed}` : ''}
        </span>
      </div>
      <canvas ref={canvasRef} className="preview-canvas" />
      {level.world !== undefined ? (
        <div className="legend">
          <span className="legend-item">
            <span className="legend-swatch" style={{ background: '#9b59d0' }} />
            Start and portal
          </span>
          {Object.values(WORLD_SITE_STYLE).map((style) => (
            <span key={style.legend} className="legend-item">
              <span className="legend-swatch" style={{ background: style.color }} />
              {style.legend}
            </span>
          ))}
        </div>
      ) : (
        <div className="legend">
          {Object.entries(ROOM_COLORS)
            .filter(([type]) => type !== 'None')
            .map(([type, color]) => (
              <span key={type} className="legend-item">
                <span className="legend-swatch" style={{ background: color }} />
                {type}
              </span>
            ))}
          <span className="legend-item">🔒 locked</span>
          <span className="legend-item">🔘 button</span>
        </div>
      )}
    </div>
  )
}
