// Touch multiplayer hint on the bump menu: gold, >=1.25x size, bold, >=4.5:1 contrast against the real
// rendered background, and it must not overflow or touch other elements at 360x640 and 667x375.
const { test, expect } = require('@playwright/test');

const TOUCH = { isMobile: true, hasTouch: true };
const BASE_PX = 13;

const lum = ([r, g, b]) => {
  const c = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const GOLD = lum([255, 196, 0]);
const contrast = bg => (GOLD + 0.05) / (lum(bg) + 0.05);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// Worst-case contrast: hide the text, read every background pixel behind the line, take the lowest ratio.
async function measureContrast(page) {
  await page.evaluate(() => { document.getElementById('ctrlHint').style.color = 'transparent'; });
  await page.waitForTimeout(100);
  // content box only: that is where the glyphs sit (the rounded corners of the padding are not behind text)
  const box = await page.evaluate(() => {
    const h = document.getElementById('ctrlHint'), r = h.getBoundingClientRect(), cs = getComputedStyle(h);
    const l = parseFloat(cs.paddingLeft), t = parseFloat(cs.paddingTop);
    return { x: r.x + l, y: r.y + t, width: r.width - l - parseFloat(cs.paddingRight), height: r.height - t - parseFloat(cs.paddingBottom) };
  });
  const png = await page.screenshot({ clip: box });
  await page.evaluate(() => { document.getElementById('ctrlHint').style.color = ''; });
  const px = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, c.width, c.height).data);
  }, png.toString('base64'));
  const ratios = [];
  for (let i = 0; i < px.length; i += 4) ratios.push(contrast([px[i], px[i + 1], px[i + 2]]));
  ratios.sort((a, b) => a - b);
  return { min: ratios[0], median: ratios[ratios.length >> 1] };
}

for (const vp of [{ width: 360, height: 640 }, { width: 667, height: 375 }]) {
  for (const n of [2, 3, 4]) {
    test(`觸控 ${vp.width}x${vp.height} ${n} 人:醒目、不溢出、不重疊、對比 ≥4.5`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: vp, ...TOUCH, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto('/bump/');
      await page.waitForFunction(() => window.CR && CR.mode);
      await page.tap(`#seg button[data-n="${n}"]`);
      await page.locator('#ctrlHint').scrollIntoViewIfNeeded();

      const r = await page.evaluate(() => {
        const h = document.getElementById('ctrlHint'), cs = getComputedStyle(h), ov = document.getElementById('bStart');
        const rect = e => { const b = e.getBoundingClientRect(); return { id: e.id || e.tagName, x: b.x, y: b.y, width: b.width, height: b.height }; };
        const others = [...h.parentElement.children].filter(e => e !== h && !e.hidden)
          .concat([...document.querySelectorAll('#seg button, #bStartBtn, #swBtn, #snd')].filter(e => e.offsetParent));
        return {
          text: h.textContent, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, color: cs.color,
          hint: rect(h), others: others.map(rect),
          docScroll: document.documentElement.scrollWidth - innerWidth, ovScroll: ov.scrollWidth - ov.clientWidth, vw: innerWidth
        };
      });
      expect(r.text).toBe(`多人模式:手機歡迎橫放遊玩。畫面分成 ${n} 個區塊,各自拖曳;拇指從內側開始滑,別從螢幕邊緣起手。`);
      expect(r.size).toBeGreaterThanOrEqual(BASE_PX * 1.25);
      expect(r.weight).toBeGreaterThanOrEqual(700);
      expect(r.color).toBe('rgb(255, 196, 0)');
      expect(r.docScroll).toBeLessThanOrEqual(0);
      expect(r.ovScroll).toBeLessThanOrEqual(0);
      expect(r.hint.x).toBeGreaterThanOrEqual(0);
      expect(r.hint.x + r.hint.width).toBeLessThanOrEqual(r.vw);
      expect(r.others.filter(o => overlap(o, r.hint)).map(o => o.id)).toEqual([]);

      const c = await measureContrast(page);
      console.log(`${vp.width}x${vp.height} ${n} 人 對比 最低 ${c.min.toFixed(2)}:1 中位數 ${c.median.toFixed(2)}:1 字級 ${r.size}px`);
      expect(c.min).toBeGreaterThanOrEqual(4.5);
      if (n === 4) await page.screenshot({ path: `test-results/multihint-${vp.width}x${vp.height}.png` });
      await ctx.close();
    });
  }
}

test('其他情況樣式不變:觸控單人、桌面多人', async ({ browser }) => {
  for (const [opts, n] of [[{ viewport: { width: 360, height: 640 }, ...TOUCH }, 1], [{ viewport: { width: 1280, height: 800 } }, 4]]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto('/bump/');
    await page.waitForFunction(() => window.CR && CR.mode);
    await page.click(`#seg button[data-n="${n}"]`);
    const s = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('ctrlHint')); return [cs.fontSize, cs.fontWeight, cs.color]; });
    expect(s).toEqual(['13px', '400', 'rgb(169, 176, 200)']);
    await ctx.close();
  }
});
