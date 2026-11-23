import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { findWine } from '../src/main/wine'
import type { WineDeps } from '../src/main/wine'

/** A fake filesystem: `files` exist, and each folder lists its direct children. */
function fakeDeps(files: string[], env: NodeJS.ProcessEnv = {}, steamRoots: string[] = ['/steam']): WineDeps {
  const all = new Set(files.map((f) => join(f)))
  return {
    env,
    exists: (p) => all.has(join(p)),
    list: (dir) => {
      const prefix = join(dir) + '/'
      const kids = new Set<string>()
      for (const f of all) if (f.startsWith(prefix)) kids.add(f.slice(prefix.length).split('/')[0])
      return [...kids]
    },
    homedir: '/home/me',
    steamRoots,
    userData: '/data/app'
  }
}

describe('findWine', () => {
  it('prefers wine on PATH over Proton', () => {
    const wine = findWine(fakeDeps(['/usr/bin/wine', '/steam/steamapps/common/Proton 9.0/files/bin/wine'], { PATH: '/bin:/usr/bin' }))
    expect(wine?.command).toBe(join('/usr/bin/wine'))
    expect(wine?.label).toBe('system wine')
    expect(wine?.env.WINEPREFIX).toBeUndefined()
    expect(wine?.env.WINEDLLOVERRIDES).toBe('mscoree,mshtml=')
  })

  it('takes HWAE_WINE first when it exists', () => {
    const wine = findWine(fakeDeps(['/opt/w/wine', '/usr/bin/wine'], { PATH: '/usr/bin', HWAE_WINE: '/opt/w/wine' }))
    expect(wine?.command).toBe('/opt/w/wine')
  })

  it("falls back to Steam's Proton with a private prefix and its own libraries", () => {
    const wine = findWine(fakeDeps(['/steam/steamapps/common/Proton 8.0/files/bin/wine'], { PATH: '/usr/bin', LD_LIBRARY_PATH: '/x' }))
    expect(wine?.command).toBe(join('/steam/steamapps/common/Proton 8.0/files/bin/wine'))
    expect(wine?.label).toBe('Proton 8.0 wine')
    expect(wine?.env.WINEPREFIX).toBe(join('/data/app/wine-prefix'))
    const proton = join('/steam/steamapps/common/Proton 8.0/files')
    expect(wine?.env.LD_LIBRARY_PATH).toBe(`${join(proton, 'lib64')}:${join(proton, 'lib')}:/x`)
  })

  it('finds old dist/ builds and custom builds in compatibilitytools.d', () => {
    expect(findWine(fakeDeps(['/steam/steamapps/common/Proton 5.0/dist/bin/wine']))?.label).toBe('Proton 5.0 wine')
    expect(findWine(fakeDeps(['/home/me/.steam/root/compatibilitytools.d/GE-Proton9-20/files/bin/wine']))?.label).toBe('GE-Proton9-20 wine')
  })

  it('picks the newest numbered Proton, Experimental only when nothing else', () => {
    const common = '/steam/steamapps/common'
    const all = [`${common}/Proton 9.0/files/bin/wine`, `${common}/Proton 10.0/files/bin/wine`, `${common}/Proton - Experimental/files/bin/wine`]
    expect(findWine(fakeDeps(all))?.label).toBe('Proton 10.0 wine')
    expect(findWine(fakeDeps([`${common}/Proton - Experimental/files/bin/wine`]))?.label).toBe('Proton - Experimental wine')
  })

  it('ignores a library folder that is not Proton, and returns null with nothing found', () => {
    expect(findWine(fakeDeps(['/steam/steamapps/common/Other Game/files/bin/wine'], { PATH: '/usr/bin' }))).toBeNull()
    expect(findWine(fakeDeps([]))).toBeNull()
  })
})
