/**
 * Versioned local save. Settings, personal records and scene unlocks live in one JSON record;
 * corrupt or foreign data falls back to defaults instead of crashing.
 */
import { DEFAULT_SCENE, isSceneUnlocked, sceneIdsForClears, type SceneId } from '../game/scenes'

export type Locale = 'en' | 'zh-CN'
export type Quality = 'low' | 'medium' | 'high'
export type SavedRank = '' | 'S' | 'A' | 'B' | 'C'
/** Phone steering: floating thumb stick, or tilting the phone like a steering wheel. */
export type SteerMode = 'stick' | 'tilt'

export type SaveData = {
  version: 1
  /** '' = never chosen; the game follows the browser language until the player picks one. */
  locale: Locale | ''
  musicVolume: number
  sfxVolume: number
  muted: boolean
  quality: Quality
  reducedMotion: boolean
  /** Best finish time in seconds (0 = never finished). */
  bestTime: number
  bestDeaths: number
  bestRank: SavedRank
  clears: number
  attempts: number
  totalDeaths: number
  selectedScene: SceneId
  unlockedScenes: SceneId[]
  steerMode: SteerMode
  /** Touch/tilt steering sensitivity, 0..1 (0.5 = default response). */
  steerSensitivity: number
}

export const SAVE_KEY = 'frostline.save'

export function defaultSave(): SaveData {
  return {
    version: 1,
    locale: '',
    musicVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    quality: 'high',
    reducedMotion: false,
    bestTime: 0,
    bestDeaths: 0,
    bestRank: '',
    clears: 0,
    attempts: 0,
    totalDeaths: 0,
    selectedScene: DEFAULT_SCENE,
    unlockedScenes: [DEFAULT_SCENE],
    steerMode: 'stick',
    steerSensitivity: 0.5,
  }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback)
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
const isScene = (v: unknown): v is SceneId => v === 'glacier' || v === 'lava' || v === 'blizzard' || v === 'cyber'

/** Parse untrusted stored JSON into a valid SaveData (pure; unit tested). */
export function parseSave(raw: string | null): SaveData {
  const base = defaultSave()
  if (!raw) return base
  let data: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    data = parsed as Record<string, unknown>
  } catch {
    return base
  }
  if (data.version !== 1) return base
  const rank = data.bestRank
  const clears = count(data.clears)
  const storedUnlocked = Array.isArray(data.unlockedScenes) ? data.unlockedScenes.filter(isScene) : []
  const unlockedScenes = [...new Set([DEFAULT_SCENE, ...sceneIdsForClears(clears), ...storedUnlocked])]
  const selected = isScene(data.selectedScene) && isSceneUnlocked(data.selectedScene, clears, unlockedScenes) ? data.selectedScene : DEFAULT_SCENE
  return {
    version: 1,
    locale: data.locale === 'en' || data.locale === 'zh-CN' ? data.locale : '',
    musicVolume: clamp01(data.musicVolume, base.musicVolume),
    sfxVolume: clamp01(data.sfxVolume, base.sfxVolume),
    muted: data.muted === true,
    quality: data.quality === 'low' || data.quality === 'medium' || data.quality === 'high' ? data.quality : base.quality,
    reducedMotion: data.reducedMotion === true,
    bestTime: typeof data.bestTime === 'number' && Number.isFinite(data.bestTime) && data.bestTime > 0 ? data.bestTime : 0,
    bestDeaths: count(data.bestDeaths),
    bestRank: rank === 'S' || rank === 'A' || rank === 'B' || rank === 'C' ? rank : '',
    clears,
    attempts: count(data.attempts),
    totalDeaths: count(data.totalDeaths),
    selectedScene: selected,
    unlockedScenes,
    steerMode: data.steerMode === 'tilt' ? 'tilt' : 'stick',
    steerSensitivity: clamp01(data.steerSensitivity, base.steerSensitivity),
  }
}

/** Whether a finished run beats the stored personal best (faster wins). */
export function isNewBest(save: SaveData, seconds: number): boolean {
  return save.bestTime <= 0 || seconds < save.bestTime
}

export class SaveStore {
  data: SaveData

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage) {
    let raw: string | null = null
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null
    } catch {
      raw = null
    }
    this.data = parseSave(raw)
  }

  update(patch: Partial<SaveData>): void {
    this.data = { ...this.data, ...patch }
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data))
    } catch {
      // Private browsing or quota: the game keeps working with in-memory settings.
    }
  }
}
