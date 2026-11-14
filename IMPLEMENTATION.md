# Stage 3 web-pilot implementation

## Files changed

- `playtest/playwright.config.mjs` — keeps the historical `qa.spec.mjs` coverage in the legacy `mobile-webkit` and `chromium-fallback` projects, while excluding `journey.spec.mjs` from both. The focused `chromium-iphone-13` and `desktop-chromium` projects are the only journey projects.
- `playtest/journey.spec.mjs` — covers locker/direct-game startup, title-to-play, one real pointer capture, natural Overbloom scoring, score-card coherence, restart, and page-error checks. Desktop Chromium uses mouse events; iPhone Chromium uses Chromium CDP touch input.

No readable game source or decrypted HTML was copied into this repository. No v1 game fix was needed: the read-only source supports the requested journey and exposes the required read-only hooks.

## Run

From the repo root, after the box operator starts the existing decrypt-and-serve process, the focused journey can start at the local public locker:

```sh
cd playtest
LOCKER_URL=http://127.0.0.1:8777/ BLOOMLOOP_PASSWORD="$BLOOMLOOP_PASSWORD" npx playwright test journey.spec.mjs --project=chromium-iphone-13 --project=desktop-chromium
```

`LOCKER_URL` may instead be the live Pages locker URL (for example, `https://example.pages.dev/`). `BLOOMLOOP_PASSWORD` is env-only: supply it through the shell or CI secret; never put it in this repository or logs. With both locker variables unset, the journey retains the local direct-game path:

```sh
cd playtest
GAME_URL=http://127.0.0.1:8777/game/index.html?test=1 npx playwright test journey.spec.mjs --project=chromium-iphone-13 --project=desktop-chromium
```

The existing suite remains available with `npm run qa` from `playtest`. WebKit is included only when its Playwright install and MiniBrowser ELF files exist and `ldd` reports no missing system libraries; the launcher script itself is not passed to `ldd`. If WebKit is unavailable, `npm run qa` prints a clear stderr note and omits `mobile-webkit`; it does not install browsers, libraries, or other dependencies. `PLAYWRIGHT_SKIP_WEBKIT=1` explicitly skips WebKit, while `PLAYWRIGHT_FORCE_WEBKIT=1` keeps an installed WebKit project enabled when its host-library check needs an explicit operator override. Historical `qa.spec.mjs` still runs in every enabled legacy project; the journey runs only in the two focused Chromium projects.

## Assumptions and limitations

- The direct-game path uses the deterministic tutorial trio in `?test=1`. The locker path unlocks the fresh game without appending a query that could interfere with unlock, and relies on the fresh-run tutorial trio. Both paths wait for the real pressure system to reach Overbloom; neither fakes game-over state or writes through `__bl`.
- The two new projects match only `journey.spec.mjs`, so the long soak and historical tests are not duplicated there.
- This run does not perform a live GitHub Pages deploy.

## Box-operator handoff

1. Re-encrypt any updated game source outside this repo only if the source is intentionally changed; this implementation did not change it.
2. Start `playtest/decrypt-and-serve.mjs` with the password supplied through the environment, without writing the password to the repo or logs.
3. Run the focused journey on both new Chromium projects, then run the historical QA suite on the development box where browsers are available.
