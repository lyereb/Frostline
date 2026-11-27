import { describe, expect, it } from 'vitest'
import { autoplay } from '../src/game/autopilot'
import { gustAt, LEVEL, levelFor } from '../src/game/level'
import { createSim, hazardHits, hazardPose, NO_INPUT, stepSim } from '../src/game/sim'
import type { SceneId } from '../src/game/scenes'

const THEMED: SceneId[] = ['lava', 'blizzard', 'cyber']

describe('scene mechanics', () => {
  it('keeps the glacier course identical to the original layout', () => {
    expect(levelFor('glacier')).toBe(LEVEL)
    expect(LEVEL.gusts).toHaveLength(0)
    expect(LEVEL.hazards.some(h => h.kind === 'geyser' || h.kind === 'phase')).toBe(false)
  })

  it('gives each new scene its own mechanic on the shared course', () => {
    expect(levelFor('lava').hazards.filter(h => h.kind === 'geyser').length).toBeGreaterThanOrEqual(8)
    expect(levelFor('cyber').hazards.filter(h => h.kind === 'phase').length).toBeGreaterThanOrEqual(6)
    expect(levelFor('blizzard').gusts.length).toBeGreaterThanOrEqual(6)
    for (const id of THEMED) {
      expect(levelFor(id).checkpoints).toEqual(LEVEL.checkpoints)
      expect(levelFor(id).finishZ).toBe(LEVEL.finishZ)
    }
  })

  it('geysers erupt and go dormant with a warning, phase walls swap sides', () => {
    const geyser = levelFor('lava').hazards.find(h => h.kind === 'geyser')!
    const on = new Set<boolean>()
    let warned = false
    for (let t = 0; t < 5; t += 0.02) {
      const pose = hazardPose(geyser, t)
      on.add(pose.on)
      if (!pose.on && pose.warn > 0.5) warned = true
    }
    expect(on.size).toBe(2)
    expect(warned).toBe(true)
    const wall = levelFor('cyber').hazards.find(h => h.kind === 'phase')!
    const xs = new Set<number>()
    for (let t = 0; t < 4; t += 0.05) xs.add(Math.sign(hazardPose(wall, t).x - wall.x))
    expect(xs).toEqual(new Set([-1, 1]))
  })

  it('crosswinds alternate direction inside a zone and vanish outside it', () => {
    const l = levelFor('blizzard')
    const g = l.gusts[0]
    const mid = (g.z0 + g.z1) / 2
    const dirs = new Set<number>()
    for (let t = 0; t < 1 / g.freq; t += 0.05) dirs.add(Math.sign(gustAt(l, mid, t)))
    expect(dirs.has(1) && dirs.has(-1)).toBe(true)
    expect(gustAt(l, g.z0 - 5, 0.3)).toBe(0)
  })

  for (const id of THEMED) {
    it(`${id}: spawns are safe and the whole run can be finished`, { timeout: 240_000 }, () => {
      const l = levelFor(id)
      for (let cp = 0; cp < l.checkpoints.length; cp += 1) {
        const c = l.checkpoints[cp]
        for (const h of l.hazards) expect(hazardHits(h, 0, c.x, c.y, c.z)).toBe(false)
        const s = createSim(l, cp)
        for (let i = 0; i < 20; i += 1) stepSim(s, l, NO_INPUT, 1 / 60)
        expect(s.dead, `${id} cp ${cp}`).toBeNull()
      }
      const report = autoplay(l, createSim(l, 0))
      console.log(`${id}: finished=${report.finished} time=${report.seconds.toFixed(2)}s deaths=${report.deaths.length}`, JSON.stringify(report.deaths))
      expect(report.finished).toBe(true)
      expect(report.deaths.length).toBeLessThanOrEqual(14)
    })
  }
})
