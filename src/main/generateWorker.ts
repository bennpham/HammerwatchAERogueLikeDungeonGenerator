/**
 * One generation, off the main process (world audit C1).
 *
 * `generateDungeon` is synchronous and a big island takes tens of seconds,
 * which froze the window when it ran in main. `ipc.ts` starts this worker
 * per Generate press, with the parameters and seed as `workerData`, and
 * terminates it to cancel. The result is the same object `generateDungeon`
 * returns, posted back once; the generator is pure, so the same parameters
 * and seed give the same files here as anywhere.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { generateDungeon } from '../generator'
import type { DungeonParameters } from '../generator'
import type { ContentSource } from '../generator/custom/sources'

const { params, seed, sources } = workerData as { params: DungeonParameters; seed?: number; sources?: ContentSource[] }
parentPort!.postMessage(generateDungeon(params, seed, { sources: sources ?? [] }))
