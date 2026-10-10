import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeCampaign, installCampaign } from '../src/main/packer'

describe('packer', () => {
  it('writeCampaign writes files with nested folders', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwgen-'))
    await writeCampaign(dir, [
      { path: 'info.xml', content: '<info/>' },
      { path: 'levels/level0.xml', content: '<level/>' }
    ])
    expect(readFileSync(join(dir, 'info.xml'), 'utf-8')).toBe('<info/>')
    expect(readFileSync(join(dir, 'levels/level0.xml'), 'utf-8')).toBe('<level/>')
  })

  it('installCampaign refuses an empty or missing Hammerwatch path', async () => {
    const noPath = await installCampaign('', 'dungeon1', [], true)
    expect(noPath.ok).toBe(false)
    expect(noPath.message).toContain('Set your Hammerwatch')

    const missing = await installCampaign('/definitely/not/here', 'dungeon1', [], true)
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('not found')
  })

  it('installCampaign reports a missing LevelPacker.exe and suggests export', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hwgen-hw-'))
    const result = await installCampaign(dir, 'dungeon1', [{ path: 'info.xml', content: '<info/>' }], true)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('LevelPacker.exe not found')
    // nothing was written since the packer is missing
    expect(existsSync(join(dir, 'editor', 'dungeon1'))).toBe(false)
  })
})
