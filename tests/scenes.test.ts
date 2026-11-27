import { describe, expect, it } from 'vitest'
import { defaultSave, parseSave } from '../src/engine/save'
import { isSceneUnlocked, sceneIdsForClears } from '../src/game/scenes'

describe('scene progression', () => {
  it('unlocks the three new scenes one clear at a time', () => {
    expect(sceneIdsForClears(0)).toEqual(['glacier'])
    expect(sceneIdsForClears(1)).toEqual(['glacier', 'lava'])
    expect(sceneIdsForClears(2)).toEqual(['glacier', 'lava', 'blizzard'])
    expect(sceneIdsForClears(3)).toEqual(['glacier', 'lava', 'blizzard', 'cyber'])
    expect(isSceneUnlocked('cyber', 2)).toBe(false)
    expect(isSceneUnlocked('cyber', 3)).toBe(true)
  })

  it('keeps old saves valid and derives their missing unlocks', () => {
    const old = { ...defaultSave(), clears: 2 }
    delete (old as Partial<typeof old>).selectedScene
    delete (old as Partial<typeof old>).unlockedScenes
    const migrated = parseSave(JSON.stringify(old))
    expect(migrated.selectedScene).toBe('glacier')
    expect(migrated.unlockedScenes).toEqual(['glacier', 'lava', 'blizzard'])
  })

  it('rejects locked or invalid selected scenes', () => {
    const locked = parseSave(JSON.stringify({ ...defaultSave(), clears: 1, selectedScene: 'cyber' }))
    const invalid = parseSave(JSON.stringify({ ...defaultSave(), selectedScene: 'moon' }))
    expect(locked.selectedScene).toBe('glacier')
    expect(invalid.selectedScene).toBe('glacier')
  })
})
