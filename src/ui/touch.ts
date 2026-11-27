import type { Input } from '../engine/input'
import type { SteerMode } from '../engine/save'
import { screenRoll, smooth, stickCurve, tiltAxis } from './steer'

/**
 * Touch controls, built for one-handed-per-thumb play on a portrait phone.
 *
 *  - Steer pad (bottom-left): a floating joystick. Drag left/right for analog steering, pull down
 *    to brake. The ring appears where the thumb lands and follows it if the thumb overshoots,
 *    so steering never "runs out" of travel. A response curve keeps small corrections precise.
 *  - Tilt wheel mode: tilt the phone like a steering wheel. Centre is calibrated at the start of
 *    every run (and with the recenter button). Touching the pad still overrides tilt.
 *  - JUMP / SLAM / BRAKE buttons (bottom-right) for the right thumb.
 *  - Gestures anywhere else on the screen: swipe up (or tap) = jump, keep the finger down for a
 *    higher jump; swipe down = air slam.
 *
 * Everything is multi-touch safe (each control tracks its own pointer ids) and feeds the shared
 * `Input` action state, so gameplay code never knows about touch.
 */
const PAD_RADIUS = 56
/** Past this distance the ring is dragged along with the thumb. */
const PAD_FOLLOW = PAD_RADIUS * 1.3
const BRAKE_PULL = 0.6
const SWIPE_UP = 28
const SWIPE_DOWN = 36
const TAP_SLOP = 12
const TAP_MS = 280
/** A gesture jump is held at least this long so a quick flick still clears a normal gap. */
const MIN_JUMP_HOLD_MS = 190
/** Tilt smoothing: short enough to feel direct, long enough to hide sensor jitter. */
const TILT_TAU = 0.055
/** No orientation event within this window after enabling tilt = no usable sensor. */
const TILT_PROBE_MS = 1600

export type TiltStatus = 'ready' | 'denied' | 'unsupported'

type Swipe = { x: number; y: number; t: number; fired: boolean; jumpKey: string | null; since: number }
type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

export class TouchControls {
  private readonly held = new Map<string, Set<number>>()
  private readonly jumpHolds = new Set<string>()
  private readonly swipes = new Map<number, Swipe>()
  private pad: { id: number; cx: number; cy: number } | null = null
  private readonly layer: HTMLElement
  private readonly zone: HTMLElement
  private readonly base: HTMLElement
  private readonly knob: HTMLElement
  private readonly wheel: HTMLElement | null
  private sensitivity = 0.5
  mode: SteerMode = 'stick'
  /** Called when tilt becomes usable or fails, so the UI can tell the player. */
  onTiltStatus: (status: TiltStatus) => void = () => undefined

  private padAxis = { x: 0, y: 0 }
  private tilt = { roll: 0, centre: 0, axis: 0, has: false, last: 0, needsCentre: true }
  private tiltListening = false
  private tiltProbe = 0
  private brakeBuzzed = false

  constructor(root: HTMLElement, private readonly input: Input) {
    const layer = root.querySelector<HTMLElement>('.touch')!
    this.layer = layer
    const enable = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) {
      enable()
      this.input.method = 'touch'
    }
    window.addEventListener('touchstart', enable, { once: true, passive: true })
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') {
        this.input.method = 'touch'
        enable()
      }
    }, { capture: true })

    this.zone = layer.querySelector<HTMLElement>('.touch-pad')!
    this.base = this.zone.querySelector<HTMLElement>('.pad-base')!
    this.knob = this.zone.querySelector<HTMLElement>('.pad-knob')!
    this.wheel = layer.querySelector<HTMLElement>('.tilt-wheel i')
    this.bindButtons(layer)
    this.bindPad()
    this.bindGestures(layer.querySelector<HTMLElement>('.touch-gesture')!)
    layer.querySelector<HTMLElement>('[data-touch-action="recenter"]')?.addEventListener('pointerdown', e => {
      e.preventDefault()
      this.recenter()
      this.buzz(12)
    })

    // Never leave a control latched when the game pauses or the page is hidden.
    window.addEventListener('game:pause', () => this.releaseAll())
    window.addEventListener('blur', () => this.releaseAll())
    document.addEventListener('visibilitychange', () => document.hidden && this.releaseAll())
    window.addEventListener('orientationchange', () => {
      this.releaseAll()
      this.tilt.needsCentre = true
    })
    // Every run starts from the way the player is holding the phone right now.
    window.addEventListener('game:run-start', () => this.recenter())
    layer.addEventListener('contextmenu', e => e.preventDefault())
  }

  // ─── mode / settings ────────────────────────────────────────────────────
  /**
   * Switch steering mode. Must be called from a user gesture when switching to tilt: iOS only
   * grants motion access from inside a tap.
   */
  setMode(mode: SteerMode, sensitivity: number, fromGesture = true): void {
    this.sensitivity = sensitivity
    const changed = mode !== this.mode
    this.mode = mode
    this.layer.classList.toggle('is-tilt', mode === 'tilt')
    // iOS rejects permission requests outside a tap; on boot wait for the Play tap instead.
    const needsGesture = typeof (globalThis as unknown as { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent?.requestPermission === 'function'
    if (mode === 'tilt' && (changed || !this.tiltListening) && (fromGesture || !needsGesture)) this.enableTilt()
    if (mode === 'stick') this.tilt.axis = 0
    this.syncMove()
  }

  /** Re-request motion permission (e.g. from the Play tap) if tilt is on but not yet granted. */
  ensureTilt(): void {
    if (this.mode === 'tilt' && !this.tiltListening) this.enableTilt()
  }

  private enableTilt(): void {
    const Ev = (globalThis as unknown as { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent
    if (!Ev) {
      this.onTiltStatus('unsupported')
      return
    }
    const start = () => {
      if (!this.tiltListening) {
        window.addEventListener('deviceorientation', this.onOrientation)
        this.tiltListening = true
      }
      this.tilt.needsCentre = true
      window.clearTimeout(this.tiltProbe)
      this.tiltProbe = window.setTimeout(() => {
        if (!this.tilt.has) this.onTiltStatus('unsupported')
      }, TILT_PROBE_MS)
    }
    if (typeof Ev.requestPermission === 'function') {
      Ev.requestPermission()
        .then(state => (state === 'granted' ? start() : this.onTiltStatus('denied')))
        .catch(() => this.onTiltStatus('denied'))
    } else start()
  }

  private readonly onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) return
    const angle = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0
    const roll = screenRoll(e.beta, e.gamma, angle)
    const now = performance.now()
    const first = !this.tilt.has
    this.tilt.roll = roll
    if (first) {
      this.tilt.has = true
      this.onTiltStatus('ready')
    }
    if (this.tilt.needsCentre) {
      this.tilt.centre = roll
      this.tilt.needsCentre = false
    }
    const dt = first ? 0 : Math.min(0.1, (now - this.tilt.last) / 1000)
    this.tilt.last = now
    const target = tiltAxis(roll, this.tilt.centre, this.sensitivity)
    this.tilt.axis = smooth(this.tilt.axis, target, dt, TILT_TAU)
    if (Math.abs(this.tilt.axis) < 0.004 && target === 0) this.tilt.axis = 0
    if (this.wheel) this.wheel.style.transform = `rotate(${(this.tilt.axis * 90).toFixed(1)}deg)`
    if (this.mode === 'tilt' && !this.pad) this.syncMove()
  }

  recenter(): void {
    if (this.tilt.has) this.tilt.centre = this.tilt.roll
    else this.tilt.needsCentre = true
    this.tilt.axis = 0
    this.syncMove()
  }

  // ─── buttons ────────────────────────────────────────────────────────────
  private bindButtons(layer: HTMLElement): void {
    for (const btn of layer.querySelectorAll<HTMLElement>('[data-touch]')) {
      const key = btn.dataset.touch!
      this.held.set(key, new Set())
      const down = (e: PointerEvent) => {
        e.preventDefault()
        try {
          btn.setPointerCapture(e.pointerId)
        } catch {
          // Synthetic or already-released pointers cannot be captured; the button still works.
        }
        this.held.get(key)!.add(e.pointerId)
        btn.classList.add('is-down')
        this.buzz(key === 'jump' ? 10 : 6)
        this.apply(key, true)
      }
      const up = (e: PointerEvent) => {
        const set = this.held.get(key)!
        if (!set.delete(e.pointerId)) return
        if (set.size === 0) {
          btn.classList.remove('is-down')
          this.apply(key, false)
        }
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('lostpointercapture', up)
    }
  }

  private isHeld(key: string): boolean {
    return (this.held.get(key)?.size ?? 0) > 0
  }

  private apply(key: string, down: boolean): void {
    if (key === 'jump') this.setJump('btn', down)
    else if (key === 'slam') this.input.setTouchButton('sprint', down)
    else this.syncMove()
  }

  /** Combine pad, tilt and the brake button into one move vector. The pad wins while touched. */
  private syncMove(): void {
    const brake = this.isHeld('brake') || this.padAxis.y < 0
    const steer = this.pad || this.mode !== 'tilt' ? this.padAxis.x : this.tilt.axis
    const x = steer + (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0)
    this.input.setTouchMove(Math.max(-1, Math.min(1, x)), brake ? -1 : 0)
  }

  private setJump(source: string, down: boolean): void {
    if (down) this.jumpHolds.add(source)
    else this.jumpHolds.delete(source)
    this.input.setTouchButton('jump', this.jumpHolds.size > 0)
  }

  // ─── steer pad ──────────────────────────────────────────────────────────
  private bindPad(): void {
    const zone = this.zone
    const home = () => ({ x: Math.min(zone.clientWidth * 0.5, PAD_RADIUS + 40), y: zone.clientHeight - PAD_RADIUS - 34 })
    const place = (x: number, y: number) => {
      this.base.style.left = `${x}px`
      this.base.style.top = `${y}px`
    }
    const showHome = () => {
      const h = home()
      place(h.x, h.y)
      this.knob.style.transform = 'translate(-50%, -50%)'
      this.base.classList.remove('is-active')
    }
    showHome()
    window.addEventListener('resize', () => !this.pad && showHome())

    const move = (e: PointerEvent) => {
      if (!this.pad || e.pointerId !== this.pad.id) return
      const rect = zone.getBoundingClientRect()
      let dx = e.clientX - rect.left - this.pad.cx
      let dy = e.clientY - rect.top - this.pad.cy
      let len = Math.hypot(dx, dy)
      // Follow-the-thumb: drag the ring so reversing direction responds immediately.
      if (len > PAD_FOLLOW) {
        const k = (len - PAD_FOLLOW) / len
        this.pad.cx += dx * k
        this.pad.cy += dy * k
        place(this.pad.cx, this.pad.cy)
        dx -= dx * k
        dy -= dy * k
        len = PAD_FOLLOW
      }
      if (len > PAD_RADIUS) {
        dx = (dx / len) * PAD_RADIUS
        dy = (dy / len) * PAD_RADIUS
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
      this.padAxis.x = stickCurve(dx / PAD_RADIUS, this.sensitivity)
      const braking = dy / PAD_RADIUS > BRAKE_PULL
      this.padAxis.y = braking ? -1 : 0
      if (braking && !this.brakeBuzzed) this.buzz(8)
      this.brakeBuzzed = braking
      this.base.classList.toggle('is-braking', braking)
      this.syncMove()
    }
    const end = (e: PointerEvent) => {
      if (!this.pad || e.pointerId !== this.pad.id) return
      this.endPad()
    }
    zone.addEventListener('pointerdown', e => {
      if (this.pad) return
      e.preventDefault()
      try {
        zone.setPointerCapture(e.pointerId)
      } catch {
        // See buttons: capture is best-effort.
      }
      const rect = zone.getBoundingClientRect()
      const m = PAD_RADIUS + 10
      const cx = Math.min(Math.max(e.clientX - rect.left, m), Math.max(m, rect.width - m))
      const cy = Math.min(Math.max(e.clientY - rect.top, m), Math.max(m, rect.height - m))
      this.pad = { id: e.pointerId, cx, cy }
      place(cx, cy)
      this.base.classList.add('is-active')
      this.buzz(5)
      move(e)
    })
    zone.addEventListener('pointermove', move)
    zone.addEventListener('pointerup', end)
    zone.addEventListener('pointercancel', end)
    zone.addEventListener('lostpointercapture', end)
    this.endPadHome = showHome
  }
  private endPadHome: () => void = () => undefined

  private endPad(): void {
    this.pad = null
    this.padAxis.x = 0
    this.padAxis.y = 0
    this.brakeBuzzed = false
    this.base.classList.remove('is-braking')
    this.endPadHome()
    this.syncMove()
  }

  // ─── swipe gestures ─────────────────────────────────────────────────────
  private bindGestures(area: HTMLElement): void {
    area.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return
      e.preventDefault()
      try {
        area.setPointerCapture(e.pointerId)
      } catch {
        // Best effort.
      }
      this.swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false, jumpKey: null, since: 0 })
    })
    area.addEventListener('pointermove', e => {
      const s = this.swipes.get(e.pointerId)
      if (!s || s.fired) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (dy < -SWIPE_UP && -dy > Math.abs(dx) * 1.1) {
        s.fired = true
        this.startGestureJump(e.pointerId, s)
      } else if (dy > SWIPE_DOWN && dy > Math.abs(dx) * 1.1) {
        s.fired = true
        this.slamPulse()
      }
    })
    const end = (e: PointerEvent) => {
      const s = this.swipes.get(e.pointerId)
      if (!s) return
      this.swipes.delete(e.pointerId)
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y)
      if (!s.fired && e.type === 'pointerup' && moved < TAP_SLOP && performance.now() - s.t < TAP_MS) {
        // A tap is a hop; the minimum hold keeps it consistent with a button tap.
        this.startGestureJump(e.pointerId, s)
      }
      if (s.jumpKey) this.releaseGestureJump(s)
    }
    area.addEventListener('pointerup', end)
    area.addEventListener('pointercancel', end)
    area.addEventListener('lostpointercapture', end)
  }

  private startGestureJump(id: number, s: Swipe): void {
    s.jumpKey = `g${id}:${s.t}`
    s.since = performance.now()
    this.buzz(10)
    this.setJump(s.jumpKey, true)
    // A tap ends before we return here; release after the minimum hold.
    if (!this.swipes.has(id)) this.releaseGestureJump(s)
  }

  private releaseGestureJump(s: Swipe): void {
    const key = s.jumpKey
    if (!key) return
    s.jumpKey = null
    const wait = Math.max(0, MIN_JUMP_HOLD_MS - (performance.now() - s.since))
    if (wait === 0) this.setJump(key, false)
    else window.setTimeout(() => this.setJump(key, false), wait)
  }

  private slamPulse(): void {
    this.buzz(14)
    this.input.setTouchButton('sprint', true)
    window.setTimeout(() => this.input.setTouchButton('sprint', false), 90)
  }

  // ─── helpers ────────────────────────────────────────────────────────────
  releaseAll(): void {
    for (const set of this.held.values()) set.clear()
    for (const btn of this.layer.querySelectorAll('.is-down')) btn.classList.remove('is-down')
    this.swipes.clear()
    this.jumpHolds.clear()
    this.input.setTouchButton('jump', false)
    this.input.setTouchButton('sprint', false)
    this.endPad()
  }

  private buzz(ms: number): void {
    if (this.input.method === 'touch') navigator.vibrate?.(ms)
  }
}
