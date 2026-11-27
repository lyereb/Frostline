import { describe, expect, it } from 'vitest'
import { parseSave } from '../src/engine/save'
import { screenRoll, smooth, STICK_DEADZONE, stickCurve, tiltAxis, tiltFullLock } from '../src/ui/steer'

describe('thumb stick response', () => {
  it('ignores the deadzone and reaches full lock at the rim', () => {
    expect(stickCurve(STICK_DEADZONE * 0.9)).toBe(0)
    expect(stickCurve(1)).toBeCloseTo(1)
    expect(stickCurve(-1)).toBeCloseTo(-1)
  })
  it('is gentler near the centre at low sensitivity', () => {
    expect(stickCurve(0.35, 0)).toBeLessThan(stickCurve(0.35, 1))
    expect(stickCurve(0.35, 0.5)).toBeLessThan(0.35)
  })
  it('is monotonic', () => {
    let prev = -Infinity
    for (let n = -1; n <= 1; n += 0.05) {
      const v = stickCurve(n)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

describe('tilt steering wheel', () => {
  it('holds still inside the deadzone and clamps at full lock', () => {
    expect(tiltAxis(11.5, 10)).toBe(0)
    expect(tiltAxis(10 + tiltFullLock(0.5) + 5, 10)).toBe(1)
    expect(tiltAxis(10 - tiltFullLock(0.5) - 5, 10)).toBe(-1)
  })
  it('needs less tilt at higher sensitivity', () => {
    expect(tiltAxis(12, 0, 1)).toBeGreaterThan(tiltAxis(12, 0, 0))
  })
  it('unwraps across the 180 degree seam', () => {
    expect(tiltAxis(-175, 175, 0.5)).toBeGreaterThan(0)
  })
  it('maps roll to the screen in every orientation', () => {
    expect(screenRoll(5, 20, 0)).toBe(20)
    expect(screenRoll(20, 5, 90)).toBe(20)
    expect(screenRoll(20, 5, -90)).toBe(-20)
    expect(screenRoll(20, 5, 270)).toBe(-20)
    expect(screenRoll(5, 20, 180)).toBe(-20)
  })
  it('smooths frame-rate independently', () => {
    const a = smooth(smooth(0, 1, 1 / 120, 0.05), 1, 1 / 120, 0.05)
    const b = smooth(0, 1, 1 / 60, 0.05)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe('steering settings persistence', () => {
  it('defaults to the stick and keeps a stored tilt choice', () => {
    expect(parseSave(null).steerMode).toBe('stick')
    const raw = JSON.stringify({ ...parseSave(null), steerMode: 'tilt', steerSensitivity: 0.8 })
    expect(parseSave(raw).steerMode).toBe('tilt')
    expect(parseSave(raw).steerSensitivity).toBe(0.8)
    expect(parseSave(JSON.stringify({ version: 1, steerMode: 'wheel', steerSensitivity: 9 })).steerMode).toBe('stick')
  })
})
