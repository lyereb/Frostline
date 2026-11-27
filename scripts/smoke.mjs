// End-to-end smoke test: builds must already exist in dist/ (`npm run build`).
// Serves dist/, boots the game in headless Chromium, plays a few seconds, walks the menus in
// English and Chinese, fails on any console error, and writes screenshots to ./shots/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { checkDistanceMatch } from './check-distance-match.mjs'
import { checkWhackLobby } from './check-whack-lobby.mjs'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
const guard = setTimeout(() => fail('timed out'), 120_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  await page.waitForTimeout(900)
  return page
}

const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game.sim.p
  return { mode: game.mode, run: game.run, pos: { x: p.x, y: p.y, z: p.z } }
})

try {
  await waitForServer()
  // Prefer Playwright's bundled Chromium; fall back to an installed Google Chrome.
  const args = ['--ignore-gpu-blocklist']
  browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' })).catch(() => chromium.launch({ args, executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' }))
  const errors = []

  const en = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  await page.screenshot({ path: `${out}/01-title-en.png` })

  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(350)
  await page.keyboard.up('KeyD')
  const steered = await state(page)
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/02-gameplay.png` })
  const after = await state(page)
  // Measured over the steer window: a later crash respawns at the checkpoint and would move z back.
  const moved = steered.pos.z - before.pos.z
  if (after.mode !== 'playing' && after.mode !== 'dying') throw new Error(`expected playing, got ${after.mode}`)
  if (!(after.run.elapsed > before.run.elapsed)) throw new Error('clock did not run')
  if (moved < 4) throw new Error(`rider barely moved forward (${moved.toFixed(2)} m)`)
  // The chase camera looks down +z, so screen-right is world -x: D must move the rider toward -x.
  if (!(steered.pos.x < before.pos.x - 0.2)) throw new Error(`D did not steer screen-right (x ${before.pos.x.toFixed(2)} → ${steered.pos.x.toFixed(2)})`)
  console.log(`smoke: rode ${moved.toFixed(1)} m, steered ${(steered.pos.x - before.pos.x).toFixed(1)} m, clock ${after.run.elapsed.toFixed(1)} s`)

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/03-pause.png` })
  await page.click('[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/04-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.waitForTimeout(300)
  if ((await state(page)).mode !== 'paused') throw new Error('leaving Settings with Escape resumed the run')

  // Results: place the rider on the finish deck and let the real sim cross the line.
  await page.evaluate(() => {
    const { game } = window.__game
    game.resume()
    if (game.mode !== 'playing') game.retryCheckpoint()
    const level = game['world'].level
    const z = level.finishZ - 4
    const pl = level.platforms.find(q => z >= q.z0 && z <= q.z1)
    const s = game.sim
    s.p.x = pl.x
    s.p.z = z
    s.p.y = pl.y0 + ((pl.y1 - pl.y0) * (z - pl.z0)) / (pl.z1 - pl.z0)
    s.p.vy = 0
    s.wallZ = z - 50
    for (let i = 0; i < 60 && game.mode === 'playing'; i += 1) game.step(1 / 60)
  })
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 10_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/05-results.png` })
  const done = await state(page)
  if (done.run.phase !== 'won' || done.mode !== 'ended') throw new Error(`expected a finished run, got ${done.run.phase}/${done.mode}`)
  await en.close()

  const zh = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' })
  const zhPage = await openGame(zh, errors)
  const lang = await zhPage.evaluate(() => document.documentElement.lang)
  if (lang !== 'zh-CN') throw new Error(`browser language not detected (lang=${lang})`)
  await zhPage.screenshot({ path: `${out}/06-title-zh.png` })
  await checkDistanceMatch(zhPage)
  await zh.close()

  // ── Phone, portrait (primary layout): steer pad, swipe gestures, HUD and menus ──────────────
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const phonePage = await openGame(phone, errors)
  await phonePage.screenshot({ path: `${out}/07-phone-title.png` })
  const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  if (overflow) throw new Error('portrait title overflows horizontally')
  await phonePage.tap('[data-action="play"]')
  await phonePage.waitForSelector('[data-screen="hud"].is-active')
  await phonePage.waitForTimeout(600)
  const touch = (type, id, x, y) => phonePage.evaluate(([type, id, x, y]) => {
    const target = type.startsWith('pad') ? document.querySelector('.touch-pad') : document.querySelector('.touch-gesture')
    const ev = (name) => target.dispatchEvent(new PointerEvent(name, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    ev(type.endsWith('down') ? 'pointerdown' : type.endsWith('move') ? 'pointermove' : 'pointerup')
  }, [type, id, x, y])
  const pad = await phonePage.evaluate(() => { const r = document.querySelector('.touch-pad').getBoundingClientRect(); return { x: r.left + 90, y: r.bottom - 100 } })
  const touchBefore = await state(phonePage)
  await touch('pad-down', 11, pad.x, pad.y)
  await touch('pad-move', 11, pad.x - 48, pad.y)
  await phonePage.waitForTimeout(300)
  await phonePage.screenshot({ path: `${out}/08-phone-steer.png` })
  await touch('pad-up', 11, pad.x - 48, pad.y)
  const touchAfter = await state(phonePage)
  // Screen-left is world +x behind the chase camera.
  if (!(touchAfter.pos.x > touchBefore.pos.x + 0.3)) throw new Error('touch pad steer-left did not move the rider screen-left')
  // Swipe up anywhere above the thumb zones jumps.
  await phonePage.waitForTimeout(250)
  await touch('g-down', 12, 200, 380)
  await touch('g-move', 12, 200, 330)
  await phonePage.waitForTimeout(120)
  const air = await phonePage.evaluate(() => { const p = window.__game.game.sim.p; return { grounded: p.grounded, vy: p.vy, y: p.y } })
  await touch('g-up', 12, 200, 330)
  if (air.grounded && !(air.vy > 0)) throw new Error('swipe up did not jump')
  await phonePage.waitForTimeout(500)
  await phonePage.screenshot({ path: `${out}/09-phone-hud.png` })
  await phonePage.tap('.hud-pause')
  await phonePage.waitForSelector('[data-screen="pause"].is-active')
  await phonePage.waitForTimeout(400)
  await phonePage.screenshot({ path: `${out}/10-phone-pause.png` })
  await phonePage.tap('[data-screen="pause"] [data-action="settings"]')
  await phonePage.waitForSelector('[data-screen="settings"].is-active')
  await phonePage.waitForTimeout(400)
  await phonePage.screenshot({ path: `${out}/11-phone-settings.png` })
  await phone.close()

  // ── Phone, landscape: the wide layout still works after rotating ─────────────────────────
  const land = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
  const landPage = await openGame(land, errors)
  await landPage.tap('[data-action="play"]')
  await landPage.waitForSelector('[data-screen="hud"].is-active')
  await landPage.waitForTimeout(900)
  await landPage.screenshot({ path: `${out}/12-phone-landscape-hud.png` })
  await land.close()
  await checkWhackLobby(browser, url)
  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (err) {
  await fail(err?.message ?? String(err))
}
