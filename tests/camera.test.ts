import { describe, expect, it } from 'vitest'
import { adaptFov, portraitAmount } from '../src/game/camera'
import { CONFIG } from '../src/game/config'

describe('portrait camera adaptation', () => {
  it('leaves desktop and landscape framing untouched', () => {
    expect(adaptFov(CONFIG.camera.fov, 16 / 9)).toBe(CONFIG.camera.fov)
    expect(adaptFov(CONFIG.camera.fov, 21 / 9)).toBe(CONFIG.camera.fov)
    expect(portraitAmount(16 / 9)).toBe(0)
    expect(portraitAmount(1.2)).toBe(0)
  })
  it('widens the vertical FOV as the screen gets taller, within a sane cap', () => {
    const phone = adaptFov(CONFIG.camera.fov, 390 / 844)
    const tablet = adaptFov(CONFIG.camera.fov, 3 / 4)
    expect(phone).toBeGreaterThan(tablet)
    expect(tablet).toBeGreaterThan(CONFIG.camera.fov)
    expect(phone).toBeLessThanOrEqual(110)
    expect(adaptFov(CONFIG.camera.fovMax, 9 / 21)).toBeLessThanOrEqual(110)
  })
  it('keeps a usable horizontal FOV on a phone', () => {
    const aspect = 390 / 844
    const v = (adaptFov(CONFIG.camera.fov, aspect) * Math.PI) / 180
    const h = (2 * Math.atan(Math.tan(v / 2) * aspect) * 180) / Math.PI
    // Landscape 16:9 shows ~100° horizontally; a phone in portrait must still keep above 50°.
    expect(h).toBeGreaterThan(50)
  })
  it('eases the portrait amount between orientations', () => {
    expect(portraitAmount(0.5)).toBe(1)
    expect(portraitAmount(0.46)).toBe(1)
    const mid = portraitAmount(0.85)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})
