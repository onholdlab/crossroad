// In-app browser lock: page stays scrolled to y=1 so Threads/IG see scroll room above and don't
// pull the whole browser panel down. (Edge swipes that drag the panel sideways are Threads' own
// swipe-to-close gesture; it fires even before the page loads, so the page does not try to block it.)
const { test, expect } = require('@playwright/test');

for (const path of ['/survive/', '/bump/']) {
  test(`${path} 手機:上方留 1px 可捲,畫面不縮放不偏移`, async ({ browser }) => {
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
    expect(r.y).toBe(1); expect(r.x).toBe(0); expect(r.scale).toBe(1);
    expect(r.roomY).toBeGreaterThanOrEqual(2); expect(r.roomX).toBe(0);
    expect(r.bl).toBe(0); expect(r.bt).toBe(0); expect(r.bw).toBe(r.iw);
    // 被捲回頂端後會自己回到 1px
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => scrollY)).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
