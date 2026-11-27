/**
 * Pure steering math shared by the thumb stick and the tilt "steering wheel" (unit tested).
 * Both return a steer axis in [-1, 1] where + is right on screen.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const STICK_DEADZONE = 0.07

/**
 * Thumb stick response. A small deadzone, then a power curve: low sensitivity is gentle near the
 * centre for precise lane changes, high sensitivity approaches a linear, twitchy response.
 */
export function stickCurve(n: number, sensitivity = 0.5): number {
  const a = Math.abs(n)
  if (a <= STICK_DEADZONE) return 0
  const k = clamp((a - STICK_DEADZONE) / (1 - STICK_DEADZONE), 0, 1)
  const gamma = lerp(1.75, 1.05, clamp(sensitivity, 0, 1))
  return Math.sign(n) * Math.pow(k, gamma)
}

/** Degrees of tilt that produce full lock, by sensitivity (0 -> 30 deg, 1 -> 12 deg). */
export function tiltFullLock(sensitivity: number): number {
  return lerp(30, 12, clamp(sensitivity, 0, 1))
}

export const TILT_DEADZONE_DEG = 2.2

/**
 * Tilt wheel: roll angle relative to the calibrated centre -> steer axis. The deadzone keeps a
 * hand-held phone from drifting; a mild curve keeps small corrections fine-grained.
 */
export function tiltAxis(rollDeg: number, centreDeg: number, sensitivity = 0.5): number {
  let d = rollDeg - centreDeg
  // Unwrap across the +-180 seam so a calibrated centre near the seam still behaves.
  if (d > 180) d -= 360
  else if (d < -180) d += 360
  const a = Math.abs(d)
  if (a <= TILT_DEADZONE_DEG) return 0
  const k = clamp((a - TILT_DEADZONE_DEG) / (tiltFullLock(sensitivity) - TILT_DEADZONE_DEG), 0, 1)
  return Math.sign(d) * Math.pow(k, 1.25)
}

/**
 * Screen-relative roll ("steering wheel" angle) from DeviceOrientation angles and the current
 * screen orientation angle. Portrait uses gamma; landscape uses beta with the sign of the side
 * the phone was rotated to, so tilting the right edge down always steers right.
 */
export function screenRoll(beta: number, gamma: number, screenAngle: number): number {
  const a = ((Math.round(screenAngle / 90) * 90) % 360 + 360) % 360
  if (a === 90) return beta
  if (a === 270) return -beta
  if (a === 180) return -gamma
  return gamma
}

/** Frame-rate independent low-pass toward `target` with time constant `tau` seconds. */
export function smooth(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / tau))
}
