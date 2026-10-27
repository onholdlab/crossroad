// In-app browser lock: page stays scrolled to (1,1) so Threads/IG see scroll room on every side.
const { test, expect } = require('@playwright/test');

for (const path of ['/survive/', '/bump/']) {
  test(`${path} 手機:上下左右都留 1px 可捲,畫面不縮放不偏移`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(path);
    await page.waitForFunction(() => window.CR && CR.mode);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const s = document.scrollingElement, b = document.body.getBoundingClientRect();
      return { x: scrollX, y: scrollY, scale: visualViewport.scale,
        roomX: s.scrollWidth - s.clientWidth, roomY: s.scrollHeight - s.clientHeight,
        bl: b.left, bt: b.top, bw: b.width, iw: innerWidth };
    });
    expect(r.x).toBe(1); expect(r.y).toBe(1); expect(r.scale).toBe(1);
    expect(r.roomX).toBeGreaterThanOrEqual(2); expect(r.roomY).toBeGreaterThanOrEqual(2);
    expect(r.bl).toBe(0); expect(r.bt).toBe(0); expect(r.bw).toBe(r.iw);
    // 手指在最左、最右邊滑動後仍維持在 (1,1)
    for (const x of [1, 411]) {
      await page.touchscreen.tap(x, 500);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([1, 1]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
