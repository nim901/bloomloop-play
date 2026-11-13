# Bloomloop Rules v1

This is the design brief and rules spec for the next Bloomloop iteration. Implementation must follow these rules and the `CFG` tunables exactly. Preserve the current visual language: dark nebula field, saturated orb glows, additive (`lighter`) strokes and flashes, juicy pop/PURE/chain text, and the Balatro-style blue CHIPS × red MULT tiles at the bottom.

Existing fundamentals stay: any closed freeform shape (triangle, square, blob, self-crossing stroke) closes by self-intersection or by returning within `CFG.closeR` of the start marker, then point-in-polygon decides what is caught. No circularity test. One successful loop ends the stroke outside God mode (lift and draw again). During God mode the player may hold and chain, stacking the multiplier. Password locker, crash bounds (audio voice cap, trail/FX caps), daily seed, thorns, gold, rainbow, and overflow fuse remain.

All new numbers live in one `CFG` object in `dist/index.html` (and are exposed on `window.__bl.cfg` in `?test=1`).

```js
const CFG = {
  closeR: 46,              // CSS px, scaled by U — near-start close radius
  inkPath: 900,            // base ink path budget, CSS px × U (outside God mode)
  inkTime: 2.2,            // base ink time budget, seconds (outside God mode)
  inkAreaRef: 18000,       // CSS px² × U² — reference loop area; larger loops cost more ink
  inkPerimRef: 520,        // CSS px × U — reference loop perimeter; longer outlines cost more ink
  inkAreaWeight: 0.55,     // share of ink cost from area vs the base stroke
  inkPerimWeight: 0.45,    // share of ink cost from perimeter
  godDuration: 10,         // God mode length, seconds
  countdownFrom: 3,        // last N seconds of God mode show the 3-2-1 countdown
  streakIdle: 4,           // seconds without a successful loop before the streak dies
  emptyLoopPenalty: 1,     // strikes removed by an empty loop (soft; does not wipe)
  strikesStart: 5,         // strikes needed for the first God mode
  strikesStep: 2,          // added to the requirement after each God mode (5, then 7, then 9…)
  speedPerGod: 0.10,       // orb speed multiplier added per completed God mode (+10%)
  badOrbStart: 0.06,       // chance a newly spawned orb is bad at the start of a run
  badOrbPerGod: 0.05,      // added to bad-orb chance after each completed God mode
  badOrbMax: 0.35,         // cap on bad-orb spawn chance
  audioCap: 24,
  maxTrail: 180,
  maxParts: 700,
  maxTexts: 40,
  maxRings: 30,
  maxFlashes: 8,
};
```

---

## A. What keeps a streak alive

A **strike** is a successful loop: the closed polygon contains at least one non-bad, non-thorn orb, or detonates a thorn (circling a thorn still counts). Gold and rainbow orbs count as successful.

The **streak** is the count of consecutive strikes toward the current God mode requirement (`need`, starting at `CFG.strikesStart`).

The streak stays alive when:

1. The player lands a successful loop before `CFG.streakIdle` seconds have passed since the last successful loop (or since the first orb spawn / tutorial clear, whichever started the clock).
2. An empty loop happens — the streak is not wiped; it only loses `CFG.emptyLoopPenalty` strike (see B and the soft-penalty rule). A streak of 0 stays 0.
3. God mode is active — strikes during God mode do not add to the *next* requirement, but they reset the idle timer so the post-God streak clock does not expire mid-God-mode. After God mode ends, the streak starts at 0 and the idle timer restarts.

The HUD shows `STRIKES n/need`. A subtle **streak ring** sits around that label (or around the score): a thin additive arc, color `#2dffb0` fading to `#ffb020` as idle time is consumed. The ring is full just after a successful loop and drains smoothly (linear) to empty over `CFG.streakIdle` seconds. While God mode is on, the ring is hidden (the countdown owns the moment).

---

## B. What breaks a streak

Three events break or damage the streak. They are not equivalent.

1. **Empty loop (soft penalty).** A closed shape that encloses no orbs and no thorns removes `CFG.emptyLoopPenalty` (1) strike. It does **not** wipe the streak. Example: 4/5 becomes 3/5. Visual: a small grey “−1” at the loop centroid, a brief dim of the streak ring, no screen flash. The idle timer resets (the player did *act*).
2. **Bad-orb catch (hard wipe).** If the closed shape contains at least one **bad orb** (new red/dark orb type, see Escalation), the streak is set to 0, even if the same shape also contains good orbs. Good orbs in that shape still pop and score, but it is not a strike and the catch is a miss for streak purposes. Visual: the bad orb bursts in `#7a1020` / `#ff2040`, a short dark pulse, and the word “WIPED” in `#ff6a6a` (~28px, 0.9s). The idle timer resets.
3. **Idle timeout (hard wipe).** If `CFG.streakIdle` (4s) elapses with no successful loop, the streak is set to 0. The draining ring reaching empty is the tell. A soft tick / down-pitch (via the voice pool) plays once. This does not apply while God mode is active, and does not apply on the title card or after the run is over. During the opening tutorial, the idle clock starts when the first successful loop is banked (so the teach moment cannot instantly wipe).

A thorn **SNAP** (line touches a thorn) also hard-wipes the streak, as today, and still ends the stroke outside God mode.

A cancelled scribble that never forms an `enoughPoly` (too little area, no close) does not change the streak and does not reset the idle timer.

---

## C. How God mode starts and ends

**Start.** When a successful loop raises `streak` to the current `need` (5, then 7, then 9, …), God mode starts immediately:

- `godMode = true`, `godT = CFG.godDuration` (10.0s).
- `streak` is cleared to 0 for the *next* build; `need` is increased by `CFG.strikesStep` (2) at this moment so the HUD after God mode will show `0/7`, then `0/9`, and so on.
- Orb speed for the rest of the run is multiplied by `(1 + CFG.speedPerGod)` once per God mode entered (stacking: after two God modes, speed is 1.21× the base).
- Bad-orb chance becomes `min(CFG.badOrbMax, CFG.badOrbStart + godsEntered * CFG.badOrbPerGod)`.
- The existing gold wash, “GOD MODE” sting, `sfx.god()` (through the voice pool), and hold-to-chain rules apply. Ink is disabled for the 10s. Multiplier stacking on one held stroke is unchanged.

**End.** God mode ends when `godT` reaches 0 (it may not be cancelled early by a snap or a miss). Then:

- The 3-2-1 countdown (rule D) has just played through “1”.
- A satisfying fade-out burst plays (rule D).
- `godMode = false`. If the player is still holding, they may finish the current loop; after that close, or on lift, the stroke ends and they must lift to draw again. Ink returns. The idle timer starts now. Streak is 0 / new `need`.

God mode does not retrigger from strikes landed *during* the current God mode.

---

## D. The 3-2-1 centered countdown

During the last `CFG.countdownFrom` (3) seconds of God mode (`godT ≤ 3` and `godT > 0`):

- A single huge decimal digit — `3`, then `2`, then `1` — is drawn **centered** on the screen (anchor at `W/2, H/2`). Only one digit is on screen at a time, changing when `godT` crosses 3, 2, and 1 (i.e. show `3` while `2 < godT ≤ 3`, `2` while `1 < godT ≤ 2`, `1` while `0 < godT ≤ 1`).
- **Entrance (each digit):** scale-in from 0.55 to 1.0 with a short overshoot to 1.08 at 80ms, then settle at 1.0 by 160ms (ease-out cubic, then ease-out back). Opacity 0 → 1 in the first 80ms.
- **Pulse:** after settle, a 2.2 Hz sine on scale between 1.00 and 1.06, plus a soft glow.
- **Type:** `900` weight, size `min(W,H) * 0.42` (huge, readable from across a phone), fill `#fff6b0`, stroke / shadow `#ff3d8b` at `shadowBlur ≈ 28*U`. Additive glow disc behind the digit, gold `#ffb020` at 0.25 alpha.
- **Tick sound:** at the moment each digit appears, a short, bright tick through the voice pool (e.g. a 1.8kHz sine 60ms + a quieter 900Hz, not a new uncapped node). Three ticks total, then the end burst.
- **God mode end burst** (`godT` hits 0): the “1” scales up to 1.35 and fades out in 280ms; a gold/magenta ring expands from the center (max radius `min(W,H)*0.55`, 400ms, ease-out); a modest particle burst (capped); the gold screen wash fades to 0 in 350ms. A single resolved chord (existing bank/god vocabulary, through the pool) lands on the fade.

The HUD timer (`GOD MODE 2.1s`) remains, but the centered digit is the hero of the last three seconds. Reduced-motion: the digit still changes, but without scale pulse, overshoot, or screen shake; the ring is a simple fade.

---

## Other v1 rules

**Ink cost scales with the closed shape.** Outside God mode, ink still has a path and time budget, but closing a shape also spends ink proportional to its area and perimeter:

`cost = (area / CFG.inkAreaRef) * CFG.inkAreaWeight + (perimeter / CFG.inkPerimRef) * CFG.inkPerimWeight`  
(use `inkAreaWeight` / `inkPerimWeight`). The cost is subtracted from remaining ink when the loop closes. Circling the whole screen should exhaust ink in one or two such loops and is not a viable farm. Tiny loops around a cluster stay cheap. During God mode there is still no ink cap. The ink bar remains by the finger; it should visibly drop on a huge loop.

**Bad orbs.** New type: dark red / almost-black core (`#2a060c`) with a dull `#ff2040` halo, slightly smaller pulse than a normal orb, no happy glint. They spawn mixed into the normal spawn stream with chance `badOrbStart + godsEntered * badOrbPerGod`, capped at `badOrbMax`. They never appear in the opening tutorial trio. Catching one with a loop wipes the streak (rule B.2). They do not count as PURE-color. They are not thorns (the line may pass them). Rising share with level = rising with completed God modes.

**Escalation** after each God mode starts: `need += 2` (5 → 7 → 9…), orb speed `+10%` cumulative, bad-orb share up as above.

---

## Design brief — new effects (concrete)

Keep the current glow, additive strokes, and CHIPS × MULT tiles. Do not introduce a new art style, outlines-only UI, or debug typography.

| Effect | Where | Motion / easing | Color | Duration |
| --- | --- | --- | --- | --- |
| Streak ring | Around STRIKES or score | Linear drain of arc length | `#2dffb0` → `#ffb020` → `#ff6a6a` in the last 0.6s | 4s full cycle |
| Empty-loop −1 | Loop centroid | Rise −30px, fade | `#c8c8d0`, 22px | 0.7s |
| Bad-orb wipe | Orb + center word WIPED | Dark pulse 10% screen, text eases up | `#7a1020` / `#ff6a6a` | 0.45s pulse, 0.9s text |
| God intro | Existing gold wash + GOD MODE title | Keep current sting | `#ffe27a` / `#ffb020` | first ~1.8s of God mode |
| Countdown digit | Dead center | Scale 0.55→1.08→1.00, then 2.2Hz pulse 1.00–1.06 | `#fff6b0` fill, `#ff3d8b` glow | 1s on screen each |
| Countdown tick | Audio, on digit change | 60ms tick, voice pool | — | 3 ticks |
| God end burst | Center | Digit 1.00→1.35 fade; ring expand ease-out | gold + magenta | 280–400ms |

---

## Numbered test list (one test per rule)

Playwright, mobile WebKit + Chromium iPhone emulation, touch events, `?test=1`. Keep existing crash/soak/freeform-shape/locker tests green. Expose `CFG`, `need`, `godsEntered`, `idleT`, `bad` orbs, and countdown digit via `__bl.snap()` / `__bl.qa`.

1. **T1 Successful loop is a strike.** Closing a freeform shape around at least one good orb increments `streak` by 1 and resets the idle timer / ring to full.
2. **T2 Empty loop is a soft penalty.** A closed shape with no orbs and no thorns decreases `streak` by 1 (not to below 0) and does not set `streak` to 0 if it was ≥ 2. Idle timer resets.
3. **T3 Bad-orb catch wipes the streak.** After building `streak` to at least 2, a loop that contains a bad orb (spawn one via the test hook or a fixture in `?test=1`) sets `streak` to 0. A wipe cue is observable (`snap` flag or visible WIPED path).
4. **T4 Idle timeout wipes the streak.** After a successful loop, wait `CFG.streakIdle + 0.3s` with no successful loop; `streak` becomes 0. The streak ring reaches empty.
5. **T5 Cancelled scribble does not change the streak.** A short incomplete stroke (lift with no enoughPoly) leaves `streak` and the idle timer unchanged (idle continues to run).
6. **T6 God mode starts at 5 strikes, then 7, then 9.** From a fresh run, 5 successful loops (lift between them) start God mode (`godMode === true`, `godT` ≈ 10). After it ends, 7 successful loops are required for the next God mode, then 9. `need` is 5, then 7, then 9.
7. **T7 God mode lasts 10s and does not retrigger during itself.** While `godMode` is true, further successful loops do not start a second timer or extend `godT` above the remaining time.
8. **T8 Hold-to-chain only during God mode.** Outside God mode a held drag ends after one successful loop. During God mode one held stroke can close two or more loops and stack `stroke.loops` / multiplier.
9. **T9 Centered 3-2-1 countdown.** In the last 3s of God mode, `snap().countdown` (or equivalent) is `'3'` then `'2'` then `'1'` as `godT` crosses those integers. A screenshot is taken while the digit is `'2'` (centered, huge, glowing). After `godT` hits 0, God mode ends and the end burst runs (godMode becomes false; wash fades).
10. **T10 Ink costs more for a huge loop than a tight one.** Outside God mode, remaining ink after a small loop around a cluster is higher than after a loop whose area is on the order of the full board (whole-screen circle). A whole-screen loop spends a large fraction of the bar (at least 0.4 of full ink, typically enough that a second such loop cannot complete).
11. **T11 Orb speed escalates +10% per God mode.** After the first God mode starts (or ends), orb speed / a `speedMul` field on `snap()` is 1.10; after the second, 1.21, within a small epsilon.
12. **T12 Bad-orb share rises with God modes.** `badChance` (exposed on snap) equals `min(0.35, 0.06 + godsEntered * 0.05)`.
13. **T13 Existing freeform shapes still capture.** Triangle, square, irregular blob, and figure-8 self-intersection around the tutorial trio all still pop the enclosed orbs.
14. **T14 Crash bounds still hold.** During play, including God mode and countdown, `__bl.qa` stays within `trail≤180`, `flashes≤8`, `texts≤40`, `rings≤30`, `parts≤700`, `voices≤24`. No page error, no reload.
15. **T15 Three-minute soak.** Existing soak remains: 3+ minutes of scripted play, caps held, no console errors, no reload. Locker cached-unlock reload test remains green.

`?test=1` may use a fixed seed and, if needed, a documented test-only hook to spawn a single bad orb at a known position (`__bl.qaSpawnBad(x,y)` only when `?test=1`). Do not add a production cheat to force God mode; strikes must be earned with loops. God mode duration stays 10s.

---

## Out of scope

No new game modes, no leaderboard, no change to the locker crypto, no auto-trade of anything, no drop of the existing easy-close / one-loop-per-stroke / God-mode hold rules except as specified above.
