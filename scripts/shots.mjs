// Visual check against the running dev server: title, gameplay at several checkpoints, pause,
// results. Usage: node scripts/shots.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:3000/'
const out = process.argv[3] ?? '/tmp/shots'
mkdirSync(out, { recursive: true })
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' })
const page = await ctx.newPage()
page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errors.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', e => errors.push(String(e)))
await page.goto(url)
await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60_000 })
await page.waitForTimeout(3500)
await page.screenshot({ path: `${out}/01-title.png` })
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2) }; requestAnimationFrame(f) }))
console.log('title fps (swiftshader)', fps)
await page.click('[data-action="play"]')
await page.waitForSelector('[data-screen="hud"].is-active')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/02-start.png` })
// Jump to several checkpoints through the real sim (respawn at cp) for coverage shots.
for (const cp of [1, 2, 3, 4, 5, 6]) {
  await page.evaluate(cp => {
    const { game } = window.__game
    game.sim.cp = cp
    game.retryCheckpoint()
  }, cp)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(250)
  await page.keyboard.up('KeyD')
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/03-cp${cp}.png` })
}
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/04-pause.png` })
const st = await page.evaluate(() => ({ mode: window.__game.game.mode, run: window.__game.game.run }))
console.log('state', JSON.stringify(st))
await page.evaluate(() => {
  const { game } = window.__game
  game.resume()
  const s = game.sim
  s.p.z = 2300
  s.p.y = -115
})
await page.waitForTimeout(2600)
await page.screenshot({ path: `${out}/05-results.png` })
console.log('errors', errors.length ? errors.join('\n') : 'none')
await browser.close()
