import assert from 'node:assert/strict'

export async function checkWhackConnection(browser, baseUrl, screenshotsDir) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
  const room = { group_id: '0', game_id: '31', chat_room_id: 'G_failure' }
  const roomUrl = `${baseUrl}?${new URLSearchParams(room)}`

  async function checkFailure(page, expectedLog) {
    await page.locator('#whack-root [data-screen="lobby"]').waitFor()
    const notice = page.getByRole('dialog', { name: '服务器连接失败' })
    await notice.waitFor()
    assert.equal(await page.locator('#frostline').isVisible(), false)
    assert.equal(await page.locator('.whack-duel-seat:enabled').count(), 0)
    await notice.getByRole('button', { name: '查看日志' }).click()
    const logDialog = page.locator('.whack-duel-log-dialog[open]')
    await logDialog.waitFor()
    const log = await logDialog.locator('pre').innerText()
    assert.match(log, /服务器连接失败/)
    assert.match(log, expectedLog)
    assert.doesNotMatch(log, /test-http-secret|test-wim-secret|fake-url-secret/)
    await logDialog.getByRole('button', { name: '关闭', exact: true }).click()
  }

  try {
    const page = await context.newPage()
    await page.goto(baseUrl)
    await page.getByRole('dialog', { name: '服务器连接失败' }).waitFor()
    if (screenshotsDir) await page.screenshot({ path: `${screenshotsDir}/whack-connection-failed.png` })
    await checkFailure(page, /缺少 group_id/)
    await page.goto(`${baseUrl}?group_id=wrong&game_id=31&token=fake-url-secret`)
    await checkFailure(page, /无效字段：group_id、chat_room_id/)
    await page.goto(roomUrl)
    await checkFailure(page, /缺少 App 登录信息/)

    // A complete room link still keeps the lobby visible on an API error.
    await context.addInitScript(() => {
      window.WKWebViewJavascriptBridge = {
        JSQueryInitInfo: () => JSON.stringify({ user: {
          user_id: '20001', auth_token: 'test-http-secret', im_token: 'test-wim-secret',
        } }),
      }
    })
    let calls = 0
    await page.route('**/games/room/info', async route => {
      calls++
      if (calls === 1) {
        await route.fulfill({ status: 503, json: { code: 503 } })
        return
      }
      await route.fulfill({ json: { code: 0, data: {
        ...room, status: 1, locked: false, creator: { user_id: 20001 }, user: { user_id: 20001 },
        players: [{ index: 1, status: 1, user: { user_id: 20001 } }],
      } } })
    })
    let connections = 0
    let notifySilentConnection
    await page.routeWebSocket('**/ws?*', socket => {
      connections++
      if (connections === 1) {
        socket.close({ code: 1011 })
        return
      }
      if (connections === 3) {
        notifySilentConnection()
        return
      }
      socket.onMessage(raw => {
        if (JSON.parse(raw).type !== 'room.join') return
        socket.send(JSON.stringify({ type: 'room.joined', payload: { room_id: room.chat_room_id } }))
      })
      socket.send(JSON.stringify({ type: 'connection.ready', payload: { user_id: 20001 } }))
    })
    await page.goto(roomUrl)
    await checkFailure(page, /HTTP 503/)
    await page.getByRole('button', { name: '重新连接' }).click()
    await checkFailure(page, /WIM WebSocket 连接已断开/)
    await page.getByRole('button', { name: '重新连接' }).click()
    await page.locator('.whack-sdk-status[data-connection="open"]').waitFor({ state: 'attached' })
    assert.equal(calls, 2)
    assert.equal(connections, 2)

    await page.clock.install()
    const socketCreated = new Promise(resolve => { notifySilentConnection = resolve })
    await page.goto(roomUrl)
    await socketCreated
    await page.clock.fastForward(11_000)
    await checkFailure(page, /WIM 加入聊天室超时/)

    await page.route('**/sdk.config.json', route => route.fulfill({ status: 404 }))
    await page.goto(roomUrl)
    await checkFailure(page, /读取大厅配置[\s\S]+HTTP 404/)
    console.log('smoke: SDK lobby retained on invalid room links, missing App login, HTTP and WebSocket failures')
  } finally {
    await context.close()
  }
}
