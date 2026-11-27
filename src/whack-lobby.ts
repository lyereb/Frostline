import { createAppBridge, createGameSdkFromConfig } from 'whack-game-sdk'
import 'whack-game-sdk/styles.css'
import type { FrostlineGame } from './main'

export async function startWhackLobby(root: HTMLElement, surface: HTMLElement, ready: Promise<FrostlineGame>): Promise<void> {
  const appBridge = createAppBridge()
  let activeGame: FrostlineGame | undefined
  const sdk = await createGameSdkFromConfig({
    root,
    appBridge,
    requireCommunityRoom: true,
    title: '霜线·零点',
    game: {
      async start({ container, signal, finish }) {
        const game = await ready
        if (signal.aborted) return
        activeGame = game
        container.append(surface)
        surface.hidden = false
        const { distanceMeters } = await game.playDistanceMatch(signal)
        if (!signal.aborted) finish({ scores: [{ type: 'MAX_SCORE', score: distanceMeters }] })
      },
      stop() {
        surface.hidden = true
        document.body.insertBefore(surface, root)
        activeGame?.stop()
        activeGame = undefined
      },
    },
    onError: (error, operation) => console.error(`WhackGameSDK: ${operation}`, error),
  }).catch(error => {
    appBridge.destroy()
    throw error
  })

  sdk.start()
  window.addEventListener('pagehide', event => {
    if (event.persisted) return
    sdk.destroy()
    appBridge.destroy()
  })
}
