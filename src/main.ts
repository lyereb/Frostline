import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { isNewBest, SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { DistanceMatch } from './game/distance-match'
import { betterRank } from './game/rules'
import { sceneDefinition, sceneIdsForClears } from './game/scenes'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      // PWA is an enhancement; the game remains playable when SW is unavailable.
    })
  }, { once: true })
}

registerPwa()

type StartDistanceMatch = () => Promise<{ distanceMeters: number }>

export type FrostlineGame = {
  playDistanceMatch(signal?: AbortSignal): ReturnType<StartDistanceMatch>
  stop(): void
}

declare global {
  interface Window {
    frostline: { startDistanceMatch: StartDistanceMatch }
  }
}

async function boot(hosted: boolean): Promise<FrostlineGame> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let touch: TouchControls | undefined

  const applySettings = (d: SaveData) => {
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.motionReduced = d.reducedMotion
  }

  const startRun = (distanceRace = false) => {
    if (!game) throw new Error('Game is not ready')
    audio.unlock()
    audio.startMusic()
    // Still inside the Play tap: iOS can grant motion access here if tilt is selected.
    touch?.ensureTilt()
    if (!distanceRace) save.update({ attempts: save.data.attempts + 1 })
    game.setScene(distanceRace ? 'glacier' : save.data.selectedScene)
    const match = distanceRace ? new DistanceMatch() : undefined
    game.start(match)
    window.dispatchEvent(new Event('game:run-start'))
    const scene = sceneDefinition(game.sceneId)
    if (scene.id !== 'glacier') ui.hint(scene.mechanicKey)
    ui.setDistanceHud(distanceRace)
    ui.updateHud(game.hud())
    ui.show('hud')
    loop.resetAccumulator()
    return match
  }
  const pause = () => {
    if (game?.mode !== 'playing' && game?.mode !== 'dying') return
    if (game.distanceMatch) return
    game.pause()
    ui.show('pause')
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
  }

  const ui = new Ui(i18n, save, audio, input, {
    play: startRun,
    restart: startRun,
    resume,
    retry: () => {
      if (!game) return
      game.resume()
      game.retryCheckpoint()
      ui.show('hud')
      loop.resetAccumulator()
    },
    quit: () => {
      game?.setScene(save.data.selectedScene)
      game?.toTitle()
      ui.show('title')
    },
    scene: sceneId => {
      if (!save.data.unlockedScenes.includes(sceneId)) return
      audio.unlock()
      save.update({ selectedScene: sceneId })
      game?.setScene(sceneId)
      game?.toTitle()
      ui.show('title')
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
      if (patch.steerMode !== undefined || patch.steerSensitivity !== undefined) {
        touch?.setMode(save.data.steerMode, save.data.steerSensitivity)
        ui.renderPrompts()
      }
    },
  })
  ui.show('boot')
  applySettings(save.data)

  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 3) * 0.9), v))
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }] = await Promise.all([track(import('./game/game')), track(import('./engine/renderer')), track(document.fonts.ready)])
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, {
    death: (cause, run, hazardKind) => {
      if (!game?.distanceMatch) save.update({ totalDeaths: save.data.totalDeaths + 1 })
      ui.death(cause, game?.sceneId ?? 'glacier', hazardKind)
      void run
    },
    checkpoint: (n, total) => ui.checkpoint(n, total),
    section: (key, hint) => ui.section(key, hint),
    perfect: () => ui.toast(i18n.t('hud.perfect'), 'perfect'),
    boost: () => ui.toast(i18n.t('hud.boost'), 'boost'),
    respawned: () => undefined,
    finish: run => {
      const d = save.data
      const clears = d.clears + 1
      const unlockedScenes = sceneIdsForClears(clears)
      const newlyUnlocked = unlockedScenes.filter(scene => !d.unlockedScenes.includes(scene))
      const newBest = isNewBest(d, run.elapsed)
      save.update({
        clears,
        unlockedScenes: [...new Set([...d.unlockedScenes, ...unlockedScenes])],
        bestTime: newBest ? run.elapsed : d.bestTime,
        bestDeaths: newBest ? run.deaths : d.bestDeaths,
        bestRank: run.rank && betterRank(d.bestRank, run.rank) ? run.rank : d.bestRank,
      })
      window.setTimeout(() => ui.showResults(run, newBest, newlyUnlocked), 1500)
    },
  }, hosted ? 'glacier' : save.data.selectedScene)
  game.motionReduced = save.data.reducedMotion
  const g = game

  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      input.update()
      if (input.consume('pause')) {
        if (g.mode === 'playing' || g.mode === 'dying') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds)
      if (g.mode !== 'attract') ui.updateHud(g.hud())
      // Presses must survive frames in which no fixed step ran (high-refresh displays).
      if (g.takeStepped() || g.mode !== 'playing') input.endFrame()
    },
  })
  if (!hosted) loop.start()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  touch = new TouchControls(document.getElementById('ui')!, input)
  touch.onTiltStatus = status => {
    if (status === 'ready') {
      if (ui.screen !== 'hud') ui.notice(i18n.t('tilt.ready'))
      return
    }
    // No sensor or no permission: fall back to the thumb stick and say why.
    save.update({ steerMode: 'stick' })
    touch?.setMode('stick', save.data.steerSensitivity)
    ui.refreshSettings()
    ui.notice(i18n.t(status === 'denied' ? 'tilt.denied' : 'tilt.unsupported'))
  }
  touch.setMode(save.data.steerMode, save.data.steerSensitivity, false)
  if (!hosted) window.setTimeout(() => { if (ui.screen === 'boot') ui.show('title') }, 250)
  // A lobby gesture can unlock audio before the opening broadcast arrives.
  const unlock = () => {
    audio.unlock()
    if (!hosted) audio.startMusic()
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })

  // Debug/test hook (read-only use): smoke tests inspect run state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, touch }
  return {
    async playDistanceMatch(signal) {
      signal?.throwIfAborted()
      if (g.mode !== 'attract' && ui.screen !== 'distanceResults' && ui.screen !== 'results') {
        throw new Error('A run is already in progress')
      }
      const match = startRun(true)!
      if (hosted) loop.start()
      await new Promise<void>((resolve, reject) => {
        // Physics also checks the deadline when the browser delays this timer.
        const timer = window.setTimeout(() => {
          signal?.removeEventListener('abort', abort)
          resolve()
        }, Math.ceil(match.secondsLeft * 1000))
        function abort() {
          window.clearTimeout(timer)
          reject(signal?.reason)
        }
        signal?.addEventListener('abort', abort, { once: true })
      })
      signal?.throwIfAborted()
      g.mode = 'ended'
      if (!hosted) ui.showDistanceResults(match.distanceMeters)
      return { distanceMeters: match.distanceMeters }
    },
    stop() {
      loop.stop()
      audio.stopMusic()
      touch?.releaseAll()
      input.reset()
      g.toTitle()
      ui.show('boot')
    },
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const roomLink = new URLSearchParams(location.search)
if (roomLink.has('group_id') || roomLink.has('game_id')) {
  const surface = document.querySelector<HTMLElement>('#frostline')!
  const root = document.querySelector<HTMLElement>('#whack-root')!
  surface.hidden = true
  root.hidden = false
  // Prepare WebGL while the lobby loads so the opening broadcast starts the clock promptly.
  const ready = boot(true)
  void ready.catch(error => console.error('Distance race initialization failed', error))
  void import('./whack-lobby').then(({ startWhackLobby }) => startWhackLobby(root, surface, ready))
    .catch(error => {
      console.error('WhackGameSDK initialization failed', error)
      showStartupError(root, '无法打开对战大厅，请检查房间链接和游戏配置。')
    })
} else {
  const ready = boot(false)
  window.frostline = { startDistanceMatch: async () => (await ready).playDistanceMatch() }
  void ready.catch(error => {
    console.error(error)
    showStartupError(document.querySelector<HTMLElement>('#ui')!, 'Failed to start Frostline.')
  })
}

function showStartupError(root: HTMLElement, message: string): void {
  const notice = document.createElement('div')
  notice.className = 'fatal'
  notice.setAttribute('role', 'alert')
  notice.textContent = message
  root.replaceChildren(notice)
}
