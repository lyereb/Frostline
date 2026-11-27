import assert from 'node:assert/strict'

// Run on a booted Chinese page. Use a browser clock so expiry during a stalled
// frame is reproducible without waiting a minute for each smoke run.
export async function checkDistanceMatch(page) {
  await page.clock.install()
  const stored = await page.evaluate(() => localStorage.getItem('frostline.save'))
  const initialSeconds = await page.evaluate(async () => {
    window.matchResult = window.frostline.startDistanceMatch()
    await Promise.resolve()
    return Math.ceil(window.__game.game.hud().time)
  })
  assert.equal(initialSeconds, 60)
  await page.waitForSelector('[data-screen="hud"].is-active')
  assert.equal(await page.locator('.hud-pause').isVisible(), false)
  assert.ok(await page.evaluate(async () => {
    try { await window.frostline.startDistanceMatch() }
    catch (error) { return error.message.includes('already in progress') }
    return false
  }))
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyR')
  await page.waitForFunction(() => window.__game.game.hud().distanceMeters > 2)
  // Drop the rider below the track and step through the real checkpoint respawn.
  const beforeExpiry = await page.evaluate(() => {
    const { game } = window.__game
    game.sim.p.y -= 60
    game.step(1 / 60)
    if (game.mode !== 'dying') throw new Error('Expected fall')
    const atFall = game.hud().distanceMeters
    for (let i = 0; i < 50 && game.mode === 'dying'; i++) game.step(1 / 60)
    if (game.sim.p.z !== 0 || game.hud().distanceMeters !== atFall) throw new Error('Respawn changed score')
    for (let i = 0; i < 12; i++) game.step(1 / 60)
    if (game.hud().distanceMeters <= atFall) throw new Error('Replayed distance was lost')
    return game.hud().distanceMeters
  })
  const secondsLeft = await page.evaluate(() => window.__game.game.hud().time)
  await page.clock.fastForward(Math.floor(secondsLeft * 1000) - 1500)
  assert.equal(await page.locator('[data-screen="hud"].is-active').count(), 1)
  assert.match(await page.locator('[data-hud="time"]').innerText(), /^[12] 秒$/)
  await page.clock.fastForward(2000)
  const result = await page.evaluate(() => window.matchResult)
  assert.ok(Number.isInteger(result.distanceMeters) && result.distanceMeters >= beforeExpiry)
  assert.equal(await page.locator('.r-distance').innerText(), `${result.distanceMeters} 米`)
  assert.equal(await page.evaluate(() => {
    const { game } = window.__game
    game.step(1 / 60)
    return game.hud().distanceMeters
  }), result.distanceMeters)
  assert.equal(await page.evaluate(() => localStorage.getItem('frostline.save')), stored)
  await page.click('[data-screen="distanceResults"] [data-action="quit"]')
  await page.click('[data-action="play"]')
  assert.equal(await page.locator('.hud-pause').isVisible(), true)
  assert.equal(await page.locator('.hud-distance').isVisible(), false)
}
