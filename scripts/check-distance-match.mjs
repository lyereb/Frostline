import assert from 'node:assert/strict'

// Run on a Chinese page after the SDK starts the race.
export async function checkDistanceMatch(page) {
  assert.equal(await page.locator('.hud-pause').isVisible(), false)
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyR')
  assert.equal(await page.locator('[data-screen="hud"].is-active').count(), 1)
  // Drop the rider below the track and step through the real checkpoint respawn.
  await page.evaluate(() => {
    const { game } = window.__game
    game.sim.p.y -= 60
    game.step(1 / 60)
    if (game.mode !== 'dying') throw new Error('Expected fall')
    const atFall = game.hud().distanceMeters
    for (let i = 0; i < 50 && game.mode === 'dying'; i++) game.step(1 / 60)
    if (game.sim.p.z !== 0 || game.hud().distanceMeters !== atFall) throw new Error('Respawn changed score')
    for (let i = 0; i < 12; i++) game.step(1 / 60)
    if (game.hud().distanceMeters <= atFall) throw new Error('Replayed distance was lost')
  })
  const secondsLeft = await page.evaluate(() => window.__game.game.hud().time)
  await page.clock.fastForward(Math.floor(secondsLeft * 1000) - 1500)
  assert.equal(await page.locator('[data-screen="hud"].is-active').count(), 1)
  assert.match(await page.locator('[data-hud="time"]').innerText(), /^[12] 秒$/)
}
