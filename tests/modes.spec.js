// 規格（AGENTS.md）：求生與撞人賽共用 js/engine.js，改引擎時兩個模式都要能開、能互相切換、能開始一局。
// 這個測試從兩個網址各自進站：不能有任何 JS 錯誤、三維引擎要載入、切換後網址／模式／標題一致、按開始能進入回合。
const { test, expect } = require('@playwright/test');

const MODES = {
  survive: { title: '十字路口求生', start: '#sStartBtn' },
  bump: { title: '十字路口撞人賽', start: '#bStartBtn' }
};
const other = m => (m === 'survive' ? 'bump' : 'survive');

async function expectMode(page, mode) {
  await expect.poll(() => page.evaluate(() => {
    const seg = location.pathname.split('/');
    return [seg[seg.length - 2], CR.mode && CR.mode.name, document.title].join('|');
  })).toBe([mode, mode, MODES[mode].title].join('|'));
}

for (const mode of Object.keys(MODES)) {
  test(`從 /${mode}/ 進站：載入、互相切換、開始一局都沒有錯誤`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`/${mode}/`);
    await page.waitForFunction(() => window.CR && CR.mode && CR.state === 'menu');
    expect(await page.evaluate(() => !!window.THREE)).toBe(true);
    await expectMode(page, mode);

    await page.locator('#swBtn').click();
    await expectMode(page, other(mode));
    await page.locator('#swBtn').click();
    await expectMode(page, mode);

    await page.locator(MODES[mode].start).click();
    await expect.poll(() => page.evaluate(() => CR.state)).toMatch(/^(countdown|play)$/);

    expect(errors).toEqual([]);
  });
}

test('撞人賽倒數在低更新率下仍按實際時間結束', async ({ page }) => {
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => requestFrame(now => setTimeout(() => callback(now), 200));
  });
  await page.goto('/bump/');
  await page.locator(MODES.bump.start).click();
  expect(await page.evaluate(() => CR.state)).toBe('countdown');
  await expect.poll(() => page.evaluate(() => CR.state), { timeout: 6000 }).toBe('play');
});
