export type SceneId = 'glacier' | 'lava' | 'blizzard' | 'cyber'

export type SceneDefinition = {
  id: SceneId
  titleKey: string
  subtitleKey: string
  descriptionKey: string
  unlockClears: number
  skyTop: number
  skyMid: number
  horizon: number
  fog: number
  deckTop: number
  deckSide: number
  root: number
  edge: number
  accent: number
  accent2: number
  hazard: number
  hazardDark: number
  metal: number
  floor: number
  weather: 'snow' | 'ash' | 'blizzard' | 'digital'
  weatherColor: number
  sun: number
  hemiSky: number
  hemiGround: number
  /** Stable Storage address of the scene's looping soundtrack (glacier keeps the synth score). */
  music: string | null
  /** i18n key describing the scene-only obstacle mechanic. */
  mechanicKey: string
}

export const SCENES: readonly SceneDefinition[] = [
  {
    id: 'glacier',
    titleKey: 'scene.glacier.title',
    subtitleKey: 'scene.glacier.subtitle',
    descriptionKey: 'scene.glacier.description',
    unlockClears: 0,
    skyTop: 0x070a24,
    skyMid: 0x232c6e,
    horizon: 0x332b80,
    fog: 0x332b80,
    deckTop: 0xeaf3ff,
    deckSide: 0x5f8cf0,
    root: 0x4a5fd0,
    edge: 0x74f2ff,
    accent: 0x5ff3ff,
    accent2: 0xff5fe0,
    hazard: 0xff3a1a,
    hazardDark: 0x3a0d18,
    metal: 0x232a5c,
    floor: 0x0c0a2a,
    weather: 'snow',
    weatherColor: 0xeaf4ff,
    sun: 0xe4ecff,
    hemiSky: 0xc4dcff,
    hemiGround: 0x2b1c63,
    music: null,
    mechanicKey: 'mechanic.glacier',
  },
  {
    id: 'lava',
    titleKey: 'scene.lava.title',
    subtitleKey: 'scene.lava.subtitle',
    descriptionKey: 'scene.lava.description',
    unlockClears: 1,
    skyTop: 0x18030a,
    skyMid: 0x65171b,
    horizon: 0xa22a17,
    fog: 0x54151d,
    deckTop: 0x2b2738,
    deckSide: 0x5a2835,
    root: 0x35151e,
    edge: 0xff9b35,
    accent: 0xff6b26,
    accent2: 0xffd35c,
    hazard: 0xff3a13,
    hazardDark: 0x260913,
    metal: 0x30233d,
    floor: 0x16050b,
    weather: 'ash',
    weatherColor: 0xff8e42,
    sun: 0xffc28a,
    hemiSky: 0xffa36d,
    hemiGround: 0x2b0715,
    music: '/manus-storage/game/sha256/9701417e1ef237fb13166e84c58a541753dac877123b6e7634853f3be2e97fde.mp3',
    mechanicKey: 'mechanic.lava',
  },
  {
    id: 'blizzard',
    titleKey: 'scene.blizzard.title',
    subtitleKey: 'scene.blizzard.subtitle',
    descriptionKey: 'scene.blizzard.description',
    unlockClears: 2,
    skyTop: 0x071729,
    skyMid: 0x2e6083,
    horizon: 0x9acfe2,
    fog: 0x6e9dbb,
    deckTop: 0xd9f5ff,
    deckSide: 0x72b5d7,
    root: 0x416c9a,
    edge: 0xc7f7ff,
    accent: 0xb9f7ff,
    accent2: 0x82b9ff,
    hazard: 0xff6f70,
    hazardDark: 0x3a233e,
    metal: 0x263d61,
    floor: 0x182c44,
    weather: 'blizzard',
    weatherColor: 0xf4fbff,
    sun: 0xd5efff,
    hemiSky: 0xd9f5ff,
    hemiGround: 0x244363,
    music: '/manus-storage/game/sha256/aa0fca27b1c661fadcc423212d9f75787f42b9fabfe20c06f1878373553bef79.mp3',
    mechanicKey: 'mechanic.blizzard',
  },
  {
    id: 'cyber',
    titleKey: 'scene.cyber.title',
    subtitleKey: 'scene.cyber.subtitle',
    descriptionKey: 'scene.cyber.description',
    unlockClears: 3,
    skyTop: 0x030414,
    skyMid: 0x11155a,
    horizon: 0x30146e,
    fog: 0x171347,
    deckTop: 0x171b3b,
    deckSide: 0x24285c,
    root: 0x0c0e2b,
    edge: 0x38f5ff,
    accent: 0x28e7ff,
    accent2: 0xff3fd8,
    hazard: 0xff2ecf,
    hazardDark: 0x220c3f,
    metal: 0x14183a,
    floor: 0x050611,
    weather: 'digital',
    weatherColor: 0x37ecff,
    sun: 0xa7b8ff,
    hemiSky: 0x8d9dff,
    hemiGround: 0x100a35,
    music: '/manus-storage/game/sha256/4b3131a449d90d9fe9cf2c5ba8fd7e1a4c05d7310e505300f94fe40e56ad27cc.mp3',
    mechanicKey: 'mechanic.cyber',
  },
]

export const DEFAULT_SCENE: SceneId = 'glacier'

export function sceneDefinition(id: SceneId): SceneDefinition {
  return SCENES.find(scene => scene.id === id) ?? SCENES[0]
}

export function sceneIdsForClears(clears: number): SceneId[] {
  return SCENES.filter(scene => scene.unlockClears <= clears).map(scene => scene.id)
}

export function isSceneUnlocked(id: SceneId, clears: number, saved: readonly SceneId[] = []): boolean {
  return saved.includes(id) || sceneDefinition(id).unlockClears <= clears
}
