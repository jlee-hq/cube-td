# cube-td

Web remake (single lane) of the WC3 map Cube Defense 5.2. Source data was decoded from the .w3x
(war3map.j, .w3u, .w3r, .wpm) into `src/core/data.ts` and `src/core/lane1.ts`.

## Layout
- `src/core/` - framework-agnostic game: `data.ts` (waves, towers, difficulties), `lane1.ts` (114x114 grid at 64 WC3 units/cell, waypoints), `sim.ts` (Game class: pathing, spawning, combat, economy).
- `src/ui/` - shared DOM panel, input controller, theme/terrain drawing.
- `src/vanilla/main.ts` - Canvas 2D front end (`vanilla.html`).
- `src/phaser/main.ts` - Phaser 4 front end (`phaser.html`).

## Commands
- `npm run dev` - dev server on http://localhost:5199
- `npm run typecheck`
- `npm test` - vitest headless sim tests (includes a full 30-level run, ~10s)
- `npm run build` - typecheck + production build to `dist/`

## Notes
- Distance fields must stay `Float64Array`; Float32 rounding makes Dijkstra re-relax nodes forever.
- `new Game({ bugfixes: false })` reproduces original HP capping, unused USG table, and the Super Tower 3 skip.
- Large heredocs in the agent shell get truncated; write big files with the file tool.

## Art pipeline
- All art is procedural by default: `src/art/procedural.ts` (tower bases + turrets per family/tier, 30 creeps, projectiles, portals, fx, terrain).
- To swap in real art, drop PNGs in `public/sprites/` and map keys in `public/sprites/manifest.json`, e.g. `{ "creep:hC26": "creeps/noob.png", "tower:oC33": "towers/dilapidated.png", "turret:oC33": "turrets/dilapidated.png" }`.
  Keys: `tower:<id>`, `turret:<id>` (drawn pointing right, rotated to aim), `creep:<waveId>` (facing right), `proj:<arrow|rock|bolt|shard|orb|fireball|bullet|shell>`, `portal:spawn|exit`, `fx:dot|spark|ring|shadow`. Images are scaled to the procedural size.
- `http://localhost:5199/dev/sheet.html` renders every sprite for review (dev only).
- Dev-only URL flags: `?demo` (prebuilt board, level 15 mid-wave), `?demo=walk` (few towers, 99 lives), `&fit` (Phaser: start zoomed out).
- Headless check: `chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --timeout=9000 --window-size=1500,950 --screenshot=out.png "http://localhost:5199/phaser.html?demo"`. Very large windows render black under swiftshader; that is a headless limitation.

## Balance bot
- `src/core/bot.ts`: a gold-honest automated player. Strategies: `defense`, `ground`, `super`, `greedy`, `maze` (maze = also places cheap towers on the path to lengthen it). Spends only earned gold, buys anti-air before air waves, optional life buying.
- `npm run balance` runs `test/balance.test.ts` (excluded from `npm test`). Env: `DIFFS=easy,normal`, `STRATS=maze,super`, `SEEDS=1,2`, `LIVES=1`, `OUT=file.log` (rows are appended as each game finishes; console output only flushes at the end).
- Runs are slow (super/maze ~1.5-5 min per game). Run one process per difficulty in parallel.
- The bot is a lower bound on what a good player can do, not a ceiling.

## Audio
- `src/audio/sfx.ts`: procedural WebAudio SFX (no files). Created lazily on first pointer/key press (autoplay policy). Mute: M key or panel button; volume persisted in localStorage `cube-td:audio`.

## Game modes
- `RULES` in `src/core/data.ts`: `original` (map numbers, original lane route) and `solo` (extended route through the bottom-left rooms via `SOLO_WAYPOINTS` in `lane1.ts`; 3 lives, +10 start gold; economy per difficulty in `byDifficulty`: Easy/Ultimate/USG bounty x1.5, round bonus 5+3/level, air HP x0.6; Normal 1.25/2/0.75; Hard 1.1/1/0.85; Insane 1/1/0.9). Chosen on the menu; persisted in localStorage `cube-td:mode` (default solo). Terrain art lives in `src/art/terrain.ts`; Phaser re-renders it when the route changes.
- `new Game({ mode, rules })` accepts partial rule overrides for tuning. Balance runs: `GAME_MODE=solo RULES='{"bountyMul":2}' npm run balance` (do not use `MODE`; Vite reserves it).

## Entry points (Phaser is the only active front end)
- `index.html` + `src/start/` - start page with an attract-mode backdrop (real sim with a fixed tower layout, canvas 2D at 0.6x resolution, 30 fps cap; do not run the bot here, its path searches stall the main thread). Pressing Start (or Enter) unlocks audio and lazy-loads `src/phaser/main.ts`; Phaser (~1.4 MB) is not downloaded until then.
- `phaser.html` - direct game entry, used for dev flags (`?demo`, `?demo=walk`, `&fit`).
- `vanilla.html` / `src/vanilla/` - FROZEN. Keep it compiling; do not add features.
- `npm run smoke -- <url> <out.png> <waitMs>` - real-click smoke test via Chrome DevTools Protocol (clicks Start, reports whether Phaser booted, saves a screenshot). Chrome CLI `--screenshot` mode stalls dynamic imports, so use this for the start flow.

## Send next wave
- `Game.sendNext()` / `canSendNext()` / `earlyCallReward()`: skips the countdown/break (solo pays `earlyCallGold` per 5 s skipped; original pays 0), or once all 10 creeps of the current wave have spawned, starts the next level immediately and pays that round's bonus up front (waves overlap). Panel button + `N` key.
- Panel (`src/ui/panel.ts`) takes the art map to render tower/creep icons; sections re-render only when their HTML changes.
