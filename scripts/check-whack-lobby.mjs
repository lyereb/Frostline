import assert from 'node:assert/strict'

// Exercise the shipped SDK with two isolated browser sessions and the documented wire protocol.
export async function checkWhackLobby(browser, baseUrl) {
  const room = { group_id: 0, game_id: 31, chat_room_id: 'G_frostline' }
  const rule = { rule_code: 'MAX_SCORE', result_direction: 2, priority_weight: 1, rule_config: '{"unit":"米"}' }
  const players = [{ index: 1, status: 1, user: { user_id: 20001, nick_name: '滑手一' } }]
  const sockets = new Set()
  const scores = new Map()
  const contexts = []
  let status = 1

  function broadcast(event, data) {
    for (const socket of sockets) {
      socket.send(JSON.stringify({
        type: 'message.created',
        payload: { message: { room_id: room.chat_room_id, content: JSON.stringify({ event, data: JSON.stringify(data) }) } },
      }))
    }
  }

  async function open(userId) {
    const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block' })
    contexts.push(context)
    await context.addInitScript(id => {
      window.WKWebViewJavascriptBridge = {
        JSQueryInitInfo: () => JSON.stringify({ user: {
          user_id: String(id), auth_token: `http-${id}`, im_token: `wim-${id}`,
        } }),
      }
    }, userId)
    const page = await context.newPage()
    await page.routeWebSocket('**/ws?*', socket => {
      socket.onMessage(raw => {
        const message = JSON.parse(raw)
        if (message.type !== 'room.join') return
        assert.equal(message.payload.room_id, room.chat_room_id)
        sockets.add(socket)
        socket.send(JSON.stringify({ type: 'room.joined', payload: { room_id: room.chat_room_id } }))
      })
      socket.onClose(() => sockets.delete(socket))
      assert.equal(new URL(socket.url()).searchParams.get('token'), `wim-${userId}`)
      socket.send(JSON.stringify({ type: 'connection.ready', payload: { user_id: userId } }))
    })
    await page.route('**/games/room/*', async route => {
      const request = route.request()
      const params = new URLSearchParams(request.postData())
      assert.equal(request.method(), 'POST')
      assert.equal(request.headers().authorization, `Bearer http-${userId}`)
      for (const [key, value] of Object.entries(room)) assert.equal(params.get(key), String(value))
      const path = new URL(request.url()).pathname
      const respond = data => route.fulfill({ json: { code: 0, data } })
      switch (path) {
        case '/games/room/info':
          await respond({ ...room, result_rules: [rule], status, locked: false, creator: { user_id: 20001 },
            user: { user_id: userId }, players })
          break
        case '/games/room/apply': {
          const user = { user_id: userId, nick_name: '滑手二' }
          assert.equal(params.get('status'), '1')
          assert.equal(params.get('index'), '2')
          players.push({ index: 2, status: 1, user })
          await respond(null)
          broadcast('game_room_apply', { user, index: 2 })
          break
        }
        case '/games/room/start':
          assert.equal(userId, 20001)
          assert.equal(players.length, 2)
          status = 3
          await respond({})
          broadcast('game_start', { ...room, status })
          break
        case '/games/room/result': {
          assert.equal(params.get('completed'), 'true')
          const submitted = JSON.parse(params.get('scores'))
          assert.equal(submitted.length, 1)
          assert.deepEqual(Object.keys(submitted[0]).sort(), ['score', 'type'])
          assert.equal(submitted[0].type, 'MAX_SCORE')
          assert.ok(Number.isInteger(submitted[0].score) && submitted[0].score > 0)
          assert.equal(scores.has(userId), false)
          scores.set(userId, submitted[0].score)
          await respond({})
          if (scores.size === 2) {
            status = 250
            const highest = Math.max(...scores.values())
            broadcast('whackgroup:game_pk_result', {
              ...room, status,
              winner_user_ids: [...scores].filter(([, score]) => score === highest).map(([id]) => id),
              member_scores: [...scores].map(([id, score]) => ({ user_id: id, type: 'MAX_SCORE', score })),
            })
          }
          break
        }
        default:
          throw new Error(`Unexpected community endpoint ${path}`)
      }
    })

    await page.goto(`${baseUrl}?${new URLSearchParams(room)}`)
    await page.locator('.whack-sdk-status[data-connection="open"]').waitFor({ state: 'attached' })
    assert.equal(await page.locator('#frostline').isVisible(), false)
    await page.clock.install()
    return page
  }

  try {
    const host = await open(20001)
    const guest = await open(20002)
    await guest.locator('.whack-duel-seat').nth(1).click()
    await host.getByRole('button', { name: '开始对战' }).click()
    for (const page of [host, guest]) {
      await page.locator('.whack-sdk-game #frostline [data-screen="hud"].is-active').waitFor()
      await page.waitForFunction(() => window.__game.game.hud().distanceMeters > 3)
    }
    await host.clock.fastForward(60_000)
    await host.locator('.whack-settlement[data-status="waiting"]').waitFor()
    assert.match(await host.locator('.whack-settlement-score dd').innerText(), /^\d+ 米$/)
    await guest.clock.fastForward(60_000)
    for (const [playerId, page] of [[20001, host], [20002, guest]]) {
      await page.locator('.whack-settlement[data-status="finished"]').waitFor()
      assert.equal(await page.locator('.whack-settlement-score dd').first().innerText(), `${scores.get(playerId)} 米`)
      assert.equal(await page.locator('#frostline').isVisible(), false)
      assert.equal(await page.evaluate(() => window.__game.game.mode), 'attract')
    }
    console.log('smoke: both WhackGameSDK players joined, raced, submitted metres, and received the WIM result')
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
}
