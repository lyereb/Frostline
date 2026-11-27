# Delivery outcomes

## Installable portrait PWA
- [x] Provide an installable web app manifest with the portrait orientation, standalone display mode, theme/background colors, start URL, scope, and 192/512px icons.
- [x] Register a service worker that precaches the app shell and caches same-origin game resources for repeat/offline launches.
- [ ] Publish the saved checkpoint as a public web version playable in phone browsers.
- [x] Version the service-worker cache per build so each deploy replaces the previous build's cached files.

## Unlockable scene progression
- [x] Preserve the existing 2.3 km single-player snowboard time trial, checkpoints, hazards, rails, avalanche pressure, portrait touch controls and English/Simplified Chinese support while adding a persistent scene progression system.
- [x] Start with Glacier Zero unlocked; a successful finish unlocks Magma Run, the second successful finish unlocks Whiteout Pass, and the third successful finish unlocks Neon Circuit.
- [x] Persist the selected scene and unlocked scenes in the existing local save, while safely migrating older saves that have no scene fields.
- [x] Add a portrait-friendly Scene Select screen with visible locked/unlocked/selected states and prevent locked scenes from starting.
- [x] Make the selected scene visibly distinct in the Three.js world through themed sky, fog, lighting, track materials, hazards, weather particles and environment decoration for lava, blizzard and cyber themes.
- [x] Show the newly unlocked scene on the finish results screen and allow an unlocked scene to become the next run's active scene without changing the original course rules.

## Phone touch feel and tilt wheel
- [x] Thumb stick with deadzone, sensitivity-controlled response curve, follow-the-thumb ring and light haptics.
- [x] Tilt "steering wheel" mode (gyro) with per-run auto-calibration, recenter button, on-screen wheel indicator; the stick still overrides tilt while touched.
- [x] iOS motion permission requested only from a tap; denied/unsupported sensors fall back to the stick with a bilingual notice.
- [x] Steering mode and sensitivity persist in the save and appear in Settings (EN/中文).

## Scene soundtracks and mechanics
- [x] Lava, Blizzard and Cyber each loop their own generated instrumental soundtrack from project Storage; Glacier keeps the original synth score.
- [x] Lava: erupting lava vents with a visible warning glow. Blizzard: alternating crosswind zones with snow drift, flags and a HUD arrow. Cyber: half-deck phase walls that jump lanes after a flicker.
- [x] Shared course length, checkpoints and finish stay identical; every checkpoint spawn is safe and the autopilot finishes each scene.
- [x] Scene-specific death messages and run-start mechanic hints in both languages.
