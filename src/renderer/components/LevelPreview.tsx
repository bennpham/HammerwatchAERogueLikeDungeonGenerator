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
          theme {level.theme} · {level.rooms.length} rooms · {level.monsterCount} monsters ·{' '}
          {level.itemCount} items{seed !== null ? ` · seed ${seed}` : ''}
        </span>
      </div>
      <canvas ref={canvasRef} className="preview-canvas" />
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
    </div>
  )
}
