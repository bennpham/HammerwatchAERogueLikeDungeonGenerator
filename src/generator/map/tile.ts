/** One cell of the rasterized level grid (ported from Tile.java). */
export class Tile {
  /** solid rock / wall */
  wall: boolean
  /** covered by an object set that replaces walls (stair prefabs) */
  wallSet = false

  constructor(wall: boolean) {
    this.wall = wall
  }
}
