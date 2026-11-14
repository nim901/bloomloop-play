# Stage 3 web-pilot implementation

## Files changed

- `playtest/playwright.config.mjs` — retains the historical WebKit and iPhone Chromium projects and adds focused `chromium-iphone-13` and `desktop-chromium` projects for the journey spec.
- `playtest/journey.spec.mjs` — covers load/reload recovery, title-to-play, one real pointer capture, natural Overbloom scoring, score-card coherence, restart, and page-error checks. Desktop Chromium uses mouse events; iPhone Chromium uses touch pointer events.

No readable game source or decrypted HTML was copied into this repository. No v1 game fix was needed: the read-only source supports the requested journey and exposes the required read-only hooks.

## Run

From the repo root, after the box operator starts the existing decrypt-and-serve process:

```sh
cd playtest
GAME_URL=http://127.0.0.1:8777/game/index.html?test=1 npx playwright test journey.spec.mjs --project=chromium-iphone-13 --project=desktop-chromium
```

The existing suite remains available with `npm run qa` from `playtest` (using the already provisioned Playwright installation on the development box). Do not install dependencies or browsers on this host.

## Assumptions and limitations

- The journey relies on the deterministic tutorial trio in `?test=1` and waits for the real pressure system to reach Overbloom; it does not fake game-over state or write through `__bl`.
- The two new projects match only `journey.spec.mjs`, so the long soak and historical tests are not duplicated there.
- This run does not perform a live GitHub Pages deploy.

## Box-operator handoff

1. Re-encrypt any updated game source outside this repo only if the source is intentionally changed; this implementation did not change it.
2. Start `playtest/decrypt-and-serve.mjs` with the password supplied through the environment, without writing the password to the repo or logs.
3. Run the focused journey on both new Chromium projects, then run the historical QA suite on the development box where browsers are available.
