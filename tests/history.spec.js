// History depth: switching modes must never cost more than one extra Back press to leave the site,
// and every step keeps URL, mode, title and visible heading in sync. Each sequence runs 5 times.
const { test, expect } = require('@playwright/test');

const TITLE = { survive: '十字路口求生', bump: '十字路口撞人賽' };
const other = m => (m === 'survive' ? 'bump' : 'survive');

async function open(page) {
  await page.goto('about:blank');
  await page.goto('/survive/');
  await page.waitForFunction(() => window.CR && CR.mode && CR.state === 'menu');
}

async function expectMode(page, mode) {
  await expect.poll(() => page.evaluate(() => {
    const seg = location.pathname.split('/');
    const h1 = document.querySelector('.overlay:not([hidden]) h1');
    return [seg[seg.length - 2], CR.mode.name, document.title, h1 && h1.textContent].join('|');
  })).toBe([mode, mode, TITLE[mode], TITLE[mode]].join('|'));
}

async function switchMode(page) {
  const from = await page.evaluate(() => CR.mode.name);
  await page.locator('#swBtn').click();
  await expectMode(page, other(from));
  return other(from);
}

async function back(page) {
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await page.waitForTimeout(150);
}

// Press Back until the browser leaves the site; returns how many presses it took.
async function backsToLeave(page) {
  for (let n = 1; n <= 10; n++) {
    await back(page);
    if (page.url() === 'about:blank') return n;
    const mode = await page.evaluate(() => CR.mode.name);
    await expectMode(page, mode);
  }
  return Infinity;
}

const SEQUENCES = {
  '連續 6 次切換': async page => {
    for (let i = 0; i < 6; i++) await switchMode(page);
    await expectMode(page, 'survive');
  },
  'A→B→A→B': async page => {
    for (let i = 0; i < 3; i++) await switchMode(page);
    await expectMode(page, 'bump');
  },
  'A→B→重新整理→A': async page => {
    await switchMode(page);
    await page.reload();
    await page.waitForFunction(() => window.CR && CR.mode);
    await expectMode(page, 'bump');
    await switchMode(page);
    await expectMode(page, 'survive');
  },
  '切換後前進再返回': async page => {
    await switchMode(page);
    await page.goForward({ waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(150);
    await expectMode(page, 'bump');
    await back(page);
    await expectMode(page, 'survive');
    await page.goForward({ waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(150);
    await expectMode(page, 'bump');
    await back(page);
    await expectMode(page, 'survive');
  },
  '回合中返回放棄這一局': async page => {
    await switchMode(page);
    await page.locator('#bStartBtn').click();
    await page.waitForFunction(() => CR.state === 'countdown' || CR.state === 'play');
    await back(page);
    await expectMode(page, 'survive');
    expect(await page.evaluate(() => CR.state)).toBe('menu');
    await switchMode(page);
    await page.locator('#bStartBtn').click();
    await page.waitForFunction(() => CR.state === 'countdown' || CR.state === 'play');
    await back(page);
    await expectMode(page, 'survive');
    expect(await page.evaluate(() => CR.state)).toBe('menu');
  }
};

for (const [name, run] of Object.entries(SEQUENCES)) {
  for (let i = 1; i <= 5; i++) {
    test(`${name} #${i}`, async ({ page }) => {
      await open(page);
      await run(page);
      expect(await backsToLeave(page)).toBeLessThanOrEqual(2);
    });
  }
}
