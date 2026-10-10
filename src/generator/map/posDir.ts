/** Direction with forward and cross-axis unit vectors (ported from PosDir.Dir). */
export interface Dir {
  name: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
  xDir: number
  yDir: number
  xCross: number
  yCross: number
}

export const UP: Dir = { name: 'UP', xDir: 0, yDir: -1, xCross: 1, yCross: 0 }
export const RIGHT: Dir = { name: 'RIGHT', xDir: 1, yDir: 0, xCross: 0, yCross: 1 }
export const DOWN: Dir = { name: 'DOWN', xDir: 0, yDir: 1, xCross: 1, yCross: 0 }
export const LEFT: Dir = { name: 'LEFT', xDir: -1, yDir: 0, xCross: 0, yCross: 1 }

/**
 * A directed line segment used to build passages: a start tile, a direction
 * and a length (ported from PosDir.java).
 */
export class PosDir {
  x: number
  y: number
  dir: Dir
  length = 0

  constructor(x = 0, y = 0, dir: Dir = UP) {
    this.x = x
    this.y = y
    this.dir = dir
  }

  contains(x: number, y: number, border: number): boolean {
    switch (this.dir.name) {
      case 'UP':
        return x >= this.x - border && x <= this.x + border && y >= this.y - this.length && y <= this.y
      case 'DOWN':
        return x >= this.x - border && x <= this.x + border && y >= this.y && y <= this.y + this.length
      case 'LEFT':
        return y >= this.y - border && y <= this.y + border && x >= this.x - this.length && x <= this.x
      case 'RIGHT':
        return y >= this.y - border && y <= this.y + border && x >= this.x && x <= this.x + this.length
    }
  }

  step(): void {
    this.length++
  }

  endX(): number {
    return this.x + this.length * this.dir.xDir
  }

  endY(): number {
    return this.y + this.length * this.dir.yDir
  }

  /** Start a new segment perpendicular to this one, offset so the corner lines up. */
  turn(newDir: Dir, width: number): PosDir {
    const p = new PosDir(this.x + this.length * this.dir.xDir, this.y + this.length * this.dir.yDir, newDir)
    switch (newDir.name) {
      case 'UP':
        if (this.dir.name === 'RIGHT') {
          p.y += width + 1
        }
        break
      case 'LEFT':
        if (this.dir.name === 'DOWN') {
          p.x += width - 1
        }
        break
    }
    p.length = width
    return p
  }
}
