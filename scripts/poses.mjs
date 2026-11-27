// Deterministic pose sheet: freezes the game, drives RiderView with synthetic states and renders
// each pose from a chase view and a side view. Usage: node scripts/poses.mjs <url> <outdir>
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
const url = process.argv[2] ?? 'http://127.0.0.1:3000/'
const out = process.argv[3] ?? '/tmp/poses'
mkdirSync(out, { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 640, height: 480 }, locale: 'zh-CN' })
const errs = []
page.on('pageerror', e => errs.push(String(e)))
await page.goto(url)
await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60000 })
await page.click('[data-action="play"]')
await page.waitForTimeout(400)
await page.evaluate(() => {
  const g = window.__game.game
  g.mode = 'dying'
  g['dyingLeft'] = 1e9
  document.querySelectorAll('[data-screen]').forEach(el => (el.style.display = 'none'))
})
const poses = {
  ride: [{ n: 40, s: {} }],
  toeCarve: [{ n: 40, s: { vx: -11 } }],
  heelCarve: [{ n: 40, s: { vx: 11 } }],
  hockeyStop: [{ n: 50, s: { brake: 0.6 } }],
  ollie: [{ n: 20, s: {} }, { n: 5, s: { grounded: false, vy: 12 } }],
  indyGrab: [{ n: 20, s: {} }, { n: 3, s: { grounded: false, vy: 12 } }, { n: 30, s: { grounded: false, vy: 2 } }],
  spin360: [{ n: 20, s: {} }, { n: 3, s: { grounded: false, vy: 19 } }, { n: 22, s: { grounded: false, vy: 8 } }],
  slam: [{ n: 20, s: {} }, { n: 10, s: { grounded: false, vy: 5 } }, { n: 14, s: { grounded: false, vy: -30, slam: true } }],
  boardslide: [{ n: 40, s: { rail: 0 } }],
  land: [{ n: 20, s: {} }, { n: 40, s: { grounded: false, vy: 0 } }, { n: 5, s: {} }],
}
for (const [name, seq] of Object.entries(poses)) {
  for (const view of ['chase', 'side']) {
    const data = await page.evaluate(([seq, view]) => {
      const g = window.__game.game
      const rider = g['rider']
      const cam = g['cam'].camera
      const base = { ...g.sim.p, grounded: true, vx: 0, vy: 0, speed: 34, brake: 1, boost: 0, rail: -1, slam: false }
      g.sim.wallZ = base.z - 300
      rider.resetTrail()
      rider.visible = true
      const pos = rider.root.position.clone().set(base.x, base.y, base.z)
      let t = 0
      for (const step of seq) for (let i = 0; i < step.n; i++) { rider.update(1 / 60, pos, { ...base, ...step.s }, (t += 1 / 60)) }
      if (view === 'chase') cam.position.set(pos.x, pos.y + 2.2, pos.z - 5.2)
      else cam.position.set(pos.x - 4.2, pos.y + 1.3, pos.z + 1.2)
      cam.fov = 45
      cam.updateProjectionMatrix()
      cam.rotation.set(0, 0, 0)
      cam.lookAt(pos.x, pos.y + 0.8, pos.z)
      g['renderer'].setSpeedFx(0)
      g['renderer'].render(g['world'].scene, cam)
      return document.querySelector('canvas').toDataURL('image/png')
    }, [seq, view])
    writeFileSync(`${out}/${name}-${view}.png`, Buffer.from(data.split(',')[1], 'base64'))
  }
}
console.log('poses written', errs.length ? errs : 'no errors')
await b.close()
