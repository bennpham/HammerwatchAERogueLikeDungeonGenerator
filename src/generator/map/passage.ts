import { DOWN, LEFT, PosDir, RIGHT, UP } from './posDir'
import type { Room } from './room'
import type { GenerationContext } from '../core/context'

/**
 * An L-shaped (or straight) corridor between two rooms, built as a list of
 * PosDir segments (ported from Passage.java). `valid` is a safety addition:
 * the original could spin forever if a leg never reached its target row or
 * column; we cap the walk and let the level builder discard the passage.
 */
export class Passage {
  beginRoom: Room
  endRoom: Room
  width: number
  path: PosDir[] = []
  valid = true

  constructor(ctx: GenerationContext, from: Room, to: Room) {
    const rand = ctx.rand
    this.beginRoom = from
    this.endRoom = to

    this.width = rand.iRand(ctx.params.minPassageWidth, ctx.params.maxPassageWidth)
    const width = this.width

    // which quadrant is the destination room in, relative to the source?
    let xQuadrant = 0
    let yQuadrant = 0
    if (to.x + to.width < from.x) {
      xQuadrant = -1
    } else if (to.x > from.x + from.width) {
      xQuadrant = 1
    }
    if (to.y + to.height < from.y) {
      yQuadrant = -1
    } else if (to.y > from.y + from.height) {
      yQuadrant = 1
    }

    const begin = new PosDir()
    const XorY = rand.iRand(0, 1)
    if ((xQuadrant === 0 || XorY === 1) && yQuadrant !== 0) {
      begin.dir = yQuadrant === 1 ? DOWN : UP
    } else if ((yQuadrant === 0 || XorY === 0) && xQuadrant !== 0) {
      begin.dir = xQuadrant === 1 ? RIGHT : LEFT
    }

    this.placePassageDoor(ctx, from, begin, width)

    // walk the first leg to the target row/column, then turn towards the room
    const end = new PosDir()
    let lastPos = begin
    let corner: boolean

    switch (begin.dir.name) {
      case 'UP':
      case 'DOWN':
        if (xQuadrant === 0 && begin.x + width <= to.x + to.width && begin.x >= to.x) {
          end.y = begin.y
          corner = false
        } else {
          end.y = rand.iRand(to.y, to.y + to.height - width - 2)
          corner = true
        }

        lastPos = begin
        this.path.push(lastPos)
        if (!this.walkUntil(lastPos, () => lastPos.endY() === end.y)) return

        if (corner) {
          if (lastPos.endX() <= to.x) {
            lastPos = lastPos.turn(RIGHT, width)
            this.path.push(lastPos)
          } else if (lastPos.endX() > to.x + to.width) {
            lastPos = lastPos.turn(LEFT, width)
            this.path.push(lastPos)
          }
        }
        break

      case 'LEFT':
      case 'RIGHT':
        if (yQuadrant === 0 && begin.y + width + 2 <= to.y + to.height && begin.y >= to.y) {
          end.x = begin.x
          corner = false
        } else {
          end.x = rand.iRand(to.x, to.x + to.width - width)
          corner = true
        }

        lastPos = begin
        this.path.push(lastPos)
        if (!this.walkUntil(lastPos, () => lastPos.endX() === end.x)) return

        if (corner) {
          if (lastPos.endY() <= to.y) {
            lastPos = lastPos.turn(DOWN, width)
            this.path.push(lastPos)
          } else if (lastPos.endY() > to.y + to.height) {
            lastPos = lastPos.turn(UP, width)
            this.path.push(lastPos)
          }
        }
        break
    }

    // keep going until we hit the destination room (the original capped this
    // walk at 1000 steps too)
    let sanity = 0
    while (!to.contains(lastPos.endX(), lastPos.endY()) && sanity < 1000) {
      lastPos.step()
      sanity++
    }
    if (lastPos.length > 0) lastPos.length -= 1
  }

  /** Steps the segment until `done`; marks the passage invalid after 10000 steps. */
  private walkUntil(pos: PosDir, done: () => boolean): boolean {
    let sanity = 0
    while (!done()) {
      pos.step()
      if (++sanity > 10000) {
        this.valid = false
        return false
      }
    }
    return true
  }

  private placePassageDoor(ctx: GenerationContext, r: Room, begin: PosDir, passageWidth: number): void {
    const rand = ctx.rand
    switch (begin.dir.name) {
      case 'UP':
        begin.y = r.y - 1
        begin.x = r.x + rand.iRand(0, r.width - passageWidth)
        break
      case 'DOWN':
        begin.y = r.y + r.height + 1
        begin.x = r.x + rand.iRand(0, r.width - passageWidth)
        break
      case 'LEFT':
        begin.x = r.x - 1
        begin.y = r.y + rand.iRand(0, r.height - passageWidth)
        break
      case 'RIGHT':
        begin.x = r.x + r.width + 1
        begin.y = r.y + rand.iRand(0, r.height - passageWidth)
        break
    }
  }

  overlapPassage(otherP: Passage): boolean {
    for (const thisPos of this.path) {
      let realWidth = this.width
      if (thisPos.dir === LEFT || thisPos.dir === RIGHT) realWidth += 2

      for (let l = 0; l < thisPos.length; l++) {
        for (let w = -1; w < realWidth + 1; w++) {
          const thisX = thisPos.x + l * thisPos.dir.xDir + w * thisPos.dir.xCross
          const thisY = thisPos.y + l * thisPos.dir.yDir + w * thisPos.dir.yCross

          for (const otherPos of otherP.path) {
            let orealWidth = otherP.width
            if (otherPos.dir === LEFT || otherPos.dir === RIGHT) orealWidth += 2

            for (let ol = 0; ol < otherPos.length; ol++) {
              for (let ow = 0; ow < orealWidth; ow++) {
                if (
                  otherPos.x + ol * otherPos.dir.xDir + ow * otherPos.dir.xCross === thisX &&
                  otherPos.y + ol * otherPos.dir.yDir + ow * otherPos.dir.yCross === thisY
                ) {
                  return true
                }
              }
            }
          }
        }
      }
    }
    return false
  }

  overlapRoom(room: Room): boolean {
    for (const pos of this.path) {
      switch (pos.dir.name) {
        case 'UP':
        case 'DOWN':
          for (let l = 0; l < pos.length; l++) {
            for (let i = -1; i < this.width + 1; i++) {
              if (room.contains(pos.x + i + pos.dir.xDir * l, pos.y + pos.dir.yDir * l)) {
                return true
              }
            }
          }
          break

        case 'LEFT':
        case 'RIGHT':
          for (let l = 0; l < pos.length; l++) {
            for (let i = -1; i < this.width + 3; i++) {
              if (room.contains(pos.x + pos.dir.xDir * l, pos.y + pos.dir.yDir * l + i)) {
                return true
              }
            }
          }
          break
      }
    }
    return false
  }

  /** Register this passage with both of its rooms. */
  finish(): void {
    this.beginRoom.passages.push(this)
    this.endRoom.passages.push(this)
  }

  contains(x: number, y: number): boolean {
    for (const pos of this.path) {
      switch (pos.dir.name) {
        case 'UP':
        case 'DOWN':
          for (let i = 0; i < this.width; i++) {
            if (pos.contains(x - i, y, 0)) {
              return true
            }
          }
          break

        case 'LEFT':
        case 'RIGHT':
          for (let i = 0; i < this.width + 2; i++) {
            if (pos.contains(x, y - i, 0)) {
              return true
            }
          }
          break
      }
    }
    return false
  }
}
