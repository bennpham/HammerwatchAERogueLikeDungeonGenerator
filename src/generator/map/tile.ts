/** One cell of the rasterized level grid (ported from Tile.java). */
export class Tile {
  /** solid rock / wall */
  wall: boolean
  /**
   * A wall-line cell an object's own art stands in — an exit's doorway. It
   * gets no wall piece (the exit art is the wall there) and stays walkable:
   * it is where the party gathers to press F.
   */
  reserved = false

  constructor(wall: boolean) {
    this.wall = wall
  }
}
