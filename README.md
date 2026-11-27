# Frostline Zero · 霜线·零点

An original single-player, high-difficulty 3D snowboard time trial for the browser (Three.js +
TypeScript + Vite). Inspired by the snowboard sequence in the reference video
(https://www.youtube.com/watch?v=o2yWKUFWqWs); no characters or assets are copied — everything is
procedural geometry, shaders and synthesized audio.

Ride a fixed, hand-built course through a sci-fi glacier canyon while an avalanche chases you.
One hit and you shatter, respawning instantly at the last checkpoint. The clock keeps running.

```bash
pnpm install
pnpm dev      # PORT/HOST env respected
pnpm build    # typecheck + production build + bundle budget
pnpm preview  # serve dist/ locally at http://localhost:4173/
pnpm test     # unit tests: rules, save, i18n, level geometry + autopilot playthrough
pnpm smoke    # after build: headless playthrough + screenshots in shots/
node scripts/shots.mjs http://127.0.0.1:3000/ /tmp/shots   # visual pass on a running dev server
```

The production build writes a self-contained static site to `dist/`.

## WhackGameSDK community PK

The App's room link opens the SDK lobby directly:

```text
https://game.example.com/frostline/index.html?chat_room_id=G_123456&group_id=0&game_id=31
```

Use the IDs from the App's room link. The SDK reads the player and tokens from the native App bridge.
After both players are seated, the host starts the round and the WIM `game_start` broadcast starts the
60-second distance race for both players. Frostline returns the local player's metres as `MAX_SCORE`.
The SDK submits the score to `POST /games/room/result` and displays the winner from the WIM result.

Configure Frostline on the game server with the `MAX_SCORE` rule, `result_direction: 2`, and
`rule_config: "{\"unit\":\"米\"}"`. Allow time for the 60-second race and the final score request before
the server's deadline. For separate API/WIM hosts, set `roomApiBaseUrl` and `roomWsUrl` in
`public/sdk.config.json`. The defaults use the page's origin for the HTTP API and its `/ws` for WIM.

On Windows, run `打包游戏.cmd` to build `release/Game.zip` with `version.json` beside `index.html`.
To refresh the bundled SDK, run `npm pack --pack-destination <Frostline>/vendor` in the SDK repository,
then reinstall the matching archive in Frostline with `pnpm add whack-game-sdk@file:vendor/<archive>`.

### Standalone distance test

After the page entry module loads, the host can start a round and await the local player's result:

```js
const { distanceMeters } = await window.frostline.startDistanceMatch()
```

The call waits for game initialization. Call it from the title or after a result; an overlapping
run rejects the promise. All players start on the glacier course with a 60-second real-time clock.
The score is the cumulative forward distance skied, rounded down to whole metres. Respawning
costs time, the teleport adds no distance, and skiing the same stretch again counts. Crossing
the finish starts another lap. The clock continues in the background; a suspended page delivers
its result when the browser resumes.

## Course (≈ 2.3 km, 8 sections, 7 checkpoints)

| Section | Teaches / tests |
| --- | --- |
| 冰晶回廊 Crystal Gallery | Steering around red crystal clusters |
| 断崖跳跃 Broken Ridge | Jumping gaps, variable jump height |
| 窄桥闸门 Needle Bridges | Narrow decks, sliding gates, moving platforms |
| 摆锤工坊 Pendulum Works | Pendulums, spinners, timed lasers; braking for rhythm |
| 碎冰阶梯 Shatter Steps | Crumbling ice that collapses under you |
| 高空急坠 The Drop | Air slam; big drops give a landing boost |
| 跳台峡谷 Kicker Canyon | Launch ramps and landing precision |
| 霓虹光轨 Neon Rails | Grinding rails and jump-switching between them |
| 终极冲刺 Final Rush | Everything at top speed with a faster avalanche |

Death causes: hazard, ice wall, falling into the abyss, or being caught by the avalanche.
Rank: time + 4 s per fall; S needs ≤ 1 fall and ≤ par × 1.12. Best time, rank and totals are
saved locally.

## Controls

Keyboard: A/D or ←/→ steer · Space jump (hold = higher) · Shift air slam · S/↓ brake ·
R restart run · Esc pause. Gamepad: left stick, A jump, X/LB slam, Start pause.
Touch: ◀ ▶ and 刹车 on the left, 急坠 and 跳跃 on the right.

## Layout

| Path | Role |
| --- | --- |
| `src/game/config.ts` | All tuning numbers (speeds, gravity, avalanche, camera) |
| `src/game/level.ts` | The hand-built course data + spatial index |
| `src/game/sim.ts` | Deterministic 60 Hz rider simulation, collisions, deaths, events |
| `src/game/autopilot.ts` | Look-ahead search bot: verifies the course is finishable; attract mode |
| `src/game/rules.ts` | Pure run rules: clock, deaths, checkpoints, rank |
| `src/game/world.ts` | Procedural canyon, decks, hazards, rails, avalanche, snow, distance chunking |
| `src/game/rider.ts` | Rider model, procedural pose, neon ribbons |
| `src/game/camera.ts` | Chase camera: dynamic FOV, roll, shake, speed lines |
| `src/game/game.ts` | Mode machine, input → sim, event feedback, HUD data |
| `src/engine/*` | Loop, input, renderer/bloom, synthesized audio, save, i18n |
| `src/ui/*`, `src/styles/main.css` | HTML/CSS title, HUD, pause, settings, results, touch buttons |
| `src/i18n/*.json` | All player-facing text (zh-CN default, en; same keys enforced by test) |

## Credits

Fonts: Sora, Figtree, Noto Sans SC — SIL Open Font License 1.1 (see `public/fonts/*-OFL.txt`).
Library: three.js (MIT).


## Portrait / mobile edition

This build adapts Frostline Zero to phones held upright (landscape still works):

- **Camera** (`src/game/camera.ts`): `adaptFov` widens the vertical FOV for tall viewports so both track
  edges stay visible; the camera also rises, pulls back and aims further ahead as `portraitAmount` grows.
  The aspect ratio comes from `Renderer.aspect` every frame, so rotation morphs smoothly.
- **Renderer** (`src/engine/renderer.ts`): per-quality pixel budget (`MAX_PIXELS`) keeps tall high-DPI
  phones fast; it also reacts to `orientationchange` and `visualViewport` resizes.
- **Touch** (`src/ui/touch.ts`): floating steer pad (drag = analog steer, pull down = brake), JUMP / SLAM /
  BRAKE buttons, and screen gestures (tap or swipe up = jump, hold = higher; swipe down = air slam).
- **UI** (`src/styles/main.css`, `@media (orientation: portrait)`): single-column title, two-row HUD,
  thumb-zone layout, safe-area insets, touch-specific hints (`hint.*.touch` keys).
- English and Simplified Chinese are both complete; `pnpm test` checks matching keys.

## Scenes and mechanics

Finishing runs unlocks Magma Run (lava), Whiteout Pass (blizzard) and Neon Circuit (cyber). They share the
2.3 km course, checkpoints, finish line and synthesized soundtrack. Each variant adds a mechanic
(`src/game/level.ts` → `sceneMechanics`, `levelFor(scene)`):

| Scene | Mechanic |
| --- | --- |
| Glacier Zero | original course |
| Magma Run | lava vents (`geyser`) erupt on a cycle after a warning glow |
| Whiteout Pass | crosswind zones (`gusts`, `gustAt`) push the rider sideways |
| Neon Circuit | phase walls (`phase`) jump between deck halves after a flicker |

## Phone steering

Settings → Controls selects **Thumb stick** or **Tilt wheel** and the steering sensitivity
(`src/ui/steer.ts` holds the pure response curves; `src/ui/touch.ts` the controller). Tilt recenters at every
start and with the on-screen Recenter button; the stick overrides tilt while touched. On iOS the motion
permission is requested from the tap that selects tilt or starts a run.
