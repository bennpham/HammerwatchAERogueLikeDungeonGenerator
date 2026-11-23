import { existsSync, readdirSync } from 'fs'
import { homedir as osHomedir } from 'os'
import { delimiter, join } from 'path'

/**
 * How to run a Windows tool (PACKAGER.exe) on Linux or macOS: the wine binary,
 * any arguments that go before the .exe, and the environment it needs.
 */
export interface WineCommand {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** for messages: "system wine", "Proton 9.0 wine" */
  label: string
}

export interface WineDeps {
  env: NodeJS.ProcessEnv
  exists: (p: string) => boolean
  list: (dir: string) => string[]
  homedir: string
  /** Steam roots and libraries to look for Proton in */
  steamRoots: string[]
  /** the app's own data folder; Proton gets a private prefix there */
  userData: string
}

/**
 * Every wine run: no debug noise, and no Mono/Gecko install dialogs, which
 * would hold a first-run prefix open waiting for a click.
 */
const QUIET_ENV: NodeJS.ProcessEnv = { WINEDEBUG: '-all', WINEDLLOVERRIDES: 'mscoree,mshtml=' }

/**
 * A wine to run PACKAGER.exe with, or null when there is none. In order:
 *
 *   1. `HWAE_WINE`, an explicit path;
 *   2. `wine` or `wine64` on PATH;
 *   3. Steam's Proton (`steamapps/common/Proton*` in any library, or a custom
 *      build in `compatibilitytools.d`). AE is Windows-only, so a Linux player
 *      runs it through Proton and already has one. Proton's wine gets a
 *      prefix of its own under `userData`, never the game's `compatdata`.
 */
export function findWine(deps: WineDeps): WineCommand | null {
  const explicit = deps.env.HWAE_WINE
  if (explicit && deps.exists(explicit)) return { command: explicit, args: [], env: { ...QUIET_ENV }, label: `wine at ${explicit}` }

  for (const dir of (deps.env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const name of ['wine', 'wine64']) {
      const p = join(dir, name)
      if (deps.exists(p)) return { command: p, args: [], env: { ...QUIET_ENV }, label: 'system wine' }
    }
  }

  const proton = findProton(deps)
  if (proton === null) return null
  const libs = [join(proton.dir, 'lib64'), join(proton.dir, 'lib')]
  const ldPath = [...libs, ...(deps.env.LD_LIBRARY_PATH ? [deps.env.LD_LIBRARY_PATH] : [])].join(':')
  return {
    command: proton.wine,
    args: [],
    env: { ...QUIET_ENV, WINEPREFIX: join(deps.userData, 'wine-prefix'), LD_LIBRARY_PATH: ldPath },
    label: `${proton.name} wine`
  }
}

/** The newest Proton wine, with the folder holding its bin/ and lib/. */
function findProton(deps: WineDeps): { name: string; wine: string; dir: string } | null {
  const found: { name: string; wine: string; dir: string }[] = []
  const look = (parent: string, accept: (name: string) => boolean): void => {
    for (const name of deps.list(parent)) {
      if (!accept(name)) continue
      // Proton 5.13+ keeps wine in files/, older builds in dist/
      for (const sub of ['files', 'dist']) {
        const wine = join(parent, name, sub, 'bin', 'wine')
        if (deps.exists(wine)) {
          found.push({ name, wine, dir: join(parent, name, sub) })
          break
        }
      }
    }
  }
  for (const root of deps.steamRoots) {
    look(join(root, 'steamapps', 'common'), (n) => n.startsWith('Proton'))
    look(join(root, 'compatibilitytools.d'), () => true)
  }
  const home = deps.homedir
  for (const root of [join(home, '.steam', 'root'), join(home, '.steam', 'steam')]) {
    look(join(root, 'compatibilitytools.d'), () => true)
  }
  if (found.length === 0) return null
  found.sort((a, b) => protonRank(b.name) - protonRank(a.name) || b.name.localeCompare(a.name, undefined, { numeric: true }))
  return found[0]
}

/** Numbered builds first (they sort among themselves by name), then Experimental and the rest. */
function protonRank(name: string): number {
  return /\d/.test(name) && !/experimental/i.test(name) ? 1 : 0
}

/** `findWine` against this machine. */
export function findSystemWine(userData: string, steamRoots: string[]): WineCommand | null {
  return findWine({
    env: process.env,
    exists: existsSync,
    list: (dir) => {
      try {
        return readdirSync(dir)
      } catch {
        return []
      }
    },
    homedir: osHomedir(),
    steamRoots,
    userData
  })
}
