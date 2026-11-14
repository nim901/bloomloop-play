import { test, expect } from '@playwright/test';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function snap(page) {
  return page.evaluate(() => window.__bl?.snap());
}

async function start(page, pointerType) {
  await page.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('bloomloop.run.v2');
    } catch (_) {}
  });

  await page.goto(process.env.GAME_URL || '/index.html?test=1', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 15_000 });
  await expect(page.locator('canvas')).toHaveCount(1);

  if (pointerType === 'mouse') {
    const box = await page.locator('#title').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.82);
  } else {
    await page.evaluate(() => {
      const el = document.getElementById('title');
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height * 0.82;
      for (const type of ['pointerdown', 'pointerup']) {
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: 'touch',
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
        }));
      }
    });
  }

  await page.waitForFunction(() => window.__bl?.mode === 'play' && !window.__bl.snap()?.drawing, {
    timeout: 8_000,
  });
}

function trio(s) {
  return { x: s.W / 2, y: s.H * 0.52, r: s.R * 4.4 };
}

function square(c) {
  const { x, y, r } = c;
  return [
    { x: x - r, y: y - r },
    { x: x + r, y: y - r },
    { x: x + r, y: y + r },
    { x: x - r, y: y + r },
    { x: x - r, y: y - r + 4 },
  ];
}

async function dispatchTouch(page, type, point) {
  await page.evaluate(({ type, point }) => {
    document.querySelector('canvas').dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId: 9,
      pointerType: 'touch',
      clientX: point.x,
      clientY: point.y,
      buttons: type === 'pointerup' ? 0 : 1,
    }));
  }, { type, point });
}

async function stroke(page, points, pointerType) {
  if (pointerType === 'mouse') {
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      for (let step = 1; step <= 8; step++) {
        await page.mouse.move(a.x + (b.x - a.x) * step / 8, a.y + (b.y - a.y) * step / 8);
      }
      await sleep(8);
    }
    await page.mouse.up();
    return;
  }

  await dispatchTouch(page, 'pointerdown', points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (let step = 1; step <= 8; step++) {
      await dispatchTouch(page, 'pointermove', {
        x: a.x + (b.x - a.x) * step / 8,
        y: a.y + (b.y - a.y) * step / 8,
      });
    }
    await sleep(8);
  }
  await dispatchTouch(page, 'pointerup', points[0]);
}

test('Stage 3 web journey: capture, overbloom, and restart', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const pointerType = testInfo.project.name === 'desktop-chromium' ? 'mouse' : 'touch';
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(process.env.GAME_URL || '/index.html?test=1', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 15_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 15_000 });

  await start(page, pointerType);
  const before = await snap(page);
  expect(before).toBeTruthy();
  expect(await page.evaluate(() => window.__bl.mode)).toBe('play');

  await page.waitForFunction(() => window.__bl.snap()?.orbs?.length >= 3, { timeout: 5_000 });
  const initial = await snap(page);
  await stroke(page, square(trio(initial)), pointerType);
  await page.waitForFunction(() => {
    const s = window.__bl?.snap();
    return s && (s.firstDone || s.loops > 0) && s.score > 0;
  }, { timeout: 8_000 });

  const afterCapture = await snap(page);
  expect(afterCapture.firstDone || afterCapture.loops > 0).toBeTruthy();
  expect(afterCapture.score).toBeGreaterThan(before.score);
  expect(afterCapture.loops).toBeGreaterThan(before.loops);

  // No more captures: let the v1 pressure system naturally reach Overbloom.
  await page.waitForFunction(() => window.__bl?.mode === 'over', { timeout: 180_000 });
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#again')).toBeVisible();
  await expect(page.locator('#again')).toBeEnabled();
  const displayedScore = Number((await page.locator('#oscore').textContent()).replaceAll(',', ''));
  const overState = await snap(page);
  expect(Number.isFinite(displayedScore)).toBeTruthy();
  expect(displayedScore).toBe(overState.score);
  expect(displayedScore).toBeGreaterThan(0);

  if (pointerType === 'mouse') await page.locator('#again').click();
  else await page.locator('#again').tap();
  await page.waitForFunction(() => window.__bl?.mode === 'play', { timeout: 8_000 });
  await expect(page.locator('#over')).toHaveClass(/(?:^|\s)hide(?:\s|$)/);
  const restarted = await snap(page);
  expect(restarted.score).toBe(0);
  expect(restarted.loops).toBe(0);
  expect(restarted.firstDone).toBe(false);
  expect(pageErrors).toEqual([]);
});
