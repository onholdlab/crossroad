// Landscape phone layout: HUD rectangles must not overlap the projected 20x20 crossing,
// and back / sound / time card stay at least 44x44. Screenshots go to test-results/.
const { test, expect } = require('@playwright/test');

const SIZES = [{ width: 667, height: 375 }, { width: 915, height: 412 }];
const HUD = ['#backBtn', '#timeCard', '#signal', '#snd', '#hint', '#scores .sc'];

// Separating-axis test between an axis-aligned rect and a convex polygon.
function overlaps(r, poly) {
  const rp = [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]];
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    axes.push([b[1] - a[1], a[0] - b[0]]);
  }
  return axes.every(([ax, ay]) => {
    const pr = p => p[0] * ax + p[1] * ay;
    const A = rp.map(pr), B = poly.map(pr);
    return Math.max(...A) > Math.min(...B) && Math.max(...B) > Math.min(...A);
  });
}

for (const vp of SIZES) for (const notch of [false, true]) for (const n of [1, 4]) {
  const name = `${vp.width}x${vp.height}${notch ? ' 瀏海' : ''} ${n} 人`;
  test(name, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    if (notch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
    }
    await page.goto('/bump/');
    await page.waitForFunction(() => window.CR && CR.mode);
    await page.locator(`#seg button[data-n="${n}"]`).click();
    await page.locator('#bStartBtn').click();
    await page.waitForFunction(() => CR.state === 'play', null, { timeout: 8000 });

    const r = await page.evaluate(sels => {
      const w = innerWidth, h = innerHeight, V = new THREE.Vector3();
      const quad = [[-10, -10], [10, -10], [10, 10], [-10, 10]].map(([x, z]) => {
        V.set(x, 0, z).project(CR.camera);
        return [(V.x + 1) / 2 * w, (1 - V.y) / 2 * h];
      });
      const rects = [];
      sels.forEach(s => document.querySelectorAll(s).forEach(e => {
        const b = e.getBoundingClientRect();
        if (b.width && b.height && getComputedStyle(e).opacity !== '0') rects.push({ sel: s, x: b.x, y: b.y, width: b.width, height: b.height });
      }));
      return { quad, rects };
    }, HUD);

    await page.screenshot({ path: `test-results/landscape-${vp.width}x${vp.height}${notch ? '-notch' : ''}-${n}p.png` });
    const hits = r.rects.filter(b => overlaps(b, r.quad)).map(b => b.sel);
    expect(hits, JSON.stringify(r)).toEqual([]);
    for (const s of ['#backBtn', '#snd', '#timeCard']) {
      const b = r.rects.find(x => x.sel === s);
      expect(b.width >= 44 && b.height >= 44, s + JSON.stringify(b)).toBe(true);
    }
    if (notch) expect(r.rects.find(x => x.sel === '#backBtn').x).toBeGreaterThanOrEqual(47);
    await ctx.close();
  });
}
