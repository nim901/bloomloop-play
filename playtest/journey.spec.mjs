import { test, expect } from '@playwright/test';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function snap(page) {
  return page.evaluate(() => window.__bl?.snap());
}

const lockerMode = Boolean(process.env.LOCKER_URL && process.env.BLOOMLOOP_PASSWORD);

async function clearRunState(page) {
  await page.addInitScript(() => {
    try { localStorage.removeItem('bloomloop.run.v2'); } catch (_) {}
    try { sessionStorage.removeItem('bloomloop.run.v2'); } catch (_) {}
  });
}

async function unlockLocker(page, password) {
  await page.goto(process.env.LOCKER_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  if (await page.locator('#pw').count()) {
    await page.locator('#pw').fill(password);
    await page.locator('#go').click();
  }
  await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
}

async function start(page, pointerType) {
  await clearRunState(page);
  if (lockerMode) {
    await unlockLocker(page, process.env.BLOOMLOOP_PASSWORD);
  } else {
    await page.goto(process.env.GAME_URL || '/index.html?test=1', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 15_000 });
    await expect(page.locator('canvas')).toHaveCount(1);
  }

  if (pointerType === 'mouse') {
    const box = await page.locator('#title').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.82);
  } else {
    const box = await page.locator('#title').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height * 0.82, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
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

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...points[0], id: 9 }],
  });
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: a.x + (b.x - a.x) * step / 8,
          y: a.y + (b.y - a.y) * step / 8,
          id: 9,
        }],
      });
    }
    await sleep(8);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('Stage 3 web journey: capture, overbloom, and restart', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const pointerType = testInfo.project.name === 'desktop-chromium' ? 'mouse' : 'touch';
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

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
  await page.waitForFunction(() => {
    const s = window.__bl?.snap();
    return s && !s.drawing && s.orbs?.length >= 3;
  }, { timeout: 5_000 });
  const restarted = await snap(page);
  expect(restarted.score).toBe(0);
  expect(restarted.loops).toBe(0);
  expect(restarted.firstDone).toBe(false);
  expect(restarted.drawing).toBe(false);
  expect(restarted.orbs.length).toBeGreaterThanOrEqual(3);
  expect(pageErrors).toEqual([]);
});

test('locker wrong password recovers with the correct password', async ({ page }) => {
  test.skip(!lockerMode, 'set LOCKER_URL and BLOOMLOOP_PASSWORD for the locker test');
  await clearRunState(page);
  await page.goto(process.env.LOCKER_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.locator('#pw').fill(`${process.env.BLOOMLOOP_PASSWORD}-wrong`);
  await page.locator('#go').click();
  await expect(page.locator('#err')).toHaveText('Wrong password');
  await expect(page.locator('#go')).toBeEnabled();

  await page.locator('#pw').fill(process.env.BLOOMLOOP_PASSWORD);
  await page.locator('#go').click();
  await page.waitForFunction(() => window.__bl?.mode === 'title', { timeout: 30_000 });
  await expect(page.locator('canvas')).toHaveCount(1);
});
