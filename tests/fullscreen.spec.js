// Fullscreen on Start: only touch + landscape asks for it; rejection or missing support never breaks the game.
const { test, expect } = require('@playwright/test');

const TOUCH = { isMobile: true, hasTouch: true };

async function start(page, tap) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/survive/');
  await page.waitForFunction(() => window.CR && CR.mode);
  if (tap) await page.tap('#sStartBtn'); else await page.click('#sStartBtn');
  await page.waitForFunction(() => CR.state === 'play');
  await page.waitForTimeout(300);
  return errors;
}

test('觸控橫放:按開始進入全螢幕,場景比例重算', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, ...TOUCH });
  const page = await ctx.newPage();
  const errors = await start(page, true);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  const r = await page.evaluate(() => ({ aspect: CR.camera.aspect, stage: CR.stage.clientWidth / CR.stage.clientHeight }));
  expect(Math.abs(r.aspect - r.stage)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('觸控直放:不全螢幕', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, ...TOUCH });
  const page = await ctx.newPage();
  await start(page, true);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await ctx.close();
});

test('桌面:不全螢幕', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await start(page, false);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await ctx.close();
});

for (const [name, stub] of [
  ['被拒絕', 'Element.prototype.requestFullscreen = () => Promise.reject(new Error("denied"));'],
  ['丟例外', 'Element.prototype.requestFullscreen = () => { throw new Error("nope"); };'],
  ['不支援', 'Element.prototype.requestFullscreen = undefined;']
]) {
  test(`觸控橫放:全螢幕${name}時遊戲照常、無錯誤`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, ...TOUCH });
    await ctx.addInitScript(stub);
    const page = await ctx.newPage();
    const unhandled = [];
    page.on('console', m => { if (m.type() === 'error') unhandled.push(m.text()); });
    const errors = await start(page, true);
    expect(await page.evaluate(() => CR.state)).toBe('play');
    expect(errors).toEqual([]);
    expect(unhandled.filter(t => /denied|nope|fullscreen/i.test(t))).toEqual([]);
    await ctx.close();
  });
}
