// Touch devices: the system Back that would leave the site uses the same two-press confirm as the
// on-screen back button (same state, same 2 s window, same look). Desktop is unchanged.
const { test, expect } = require('@playwright/test');

const PORTRAIT = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const LANDSCAPE = { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto('about:blank');
  await page.goto('/survive/');
  await page.waitForFunction(() => window.CR && CR.mode && CR.state === 'menu');
  return { ctx, page };
}
async function back(page) {
  await page.goBack({ waitUntil: 'commit' }).catch(() => {});
  await page.waitForTimeout(200);
}
const left = page => page.url() === 'about:blank';
const status = page => page.evaluate(() => {
  const b = document.getElementById('backBtn');
  return { mode: CR.mode.name, state: CR.state, armed: b.classList.contains('arm'), shown: !b.hidden };
});

for (const [name, opts] of [['直放', PORTRAIT], ['橫放(全螢幕)', LANDSCAPE]]) {
  test(`觸控${name}:第一次系統返回不離開、返回鍵待確認;時間窗內第二次離開`, async ({ browser }) => {
    const { ctx, page } = await open(browser, opts);
    await page.tap('#sStartBtn');
    await page.waitForFunction(() => CR.state === 'play');
    await back(page);
    expect(left(page)).toBe(false);
    expect(await status(page)).toEqual({ mode: 'survive', state: 'play', armed: true, shown: true });
    await back(page);
    expect(left(page)).toBe(true);
    await ctx.close();
  });
}

test('觸控:逾時恢復,之後的系統返回仍會先攔', async ({ browser }) => {
  const { ctx, page } = await open(browser, PORTRAIT);
  await page.tap('#sStartBtn');
  await page.waitForFunction(() => CR.state === 'play');
  await back(page);
  expect((await status(page)).armed).toBe(true);
  await page.waitForTimeout(2300);
  expect(await status(page)).toEqual({ mode: 'survive', state: 'play', armed: false, shown: true });
  expect(left(page)).toBe(false);
  await page.touchscreen.tap(195, 600);   // next touch re-adds the guard entry
  await back(page);
  expect(left(page)).toBe(false);
  expect((await status(page)).armed).toBe(true);
  await ctx.close();
});

test('觸控:選單上也攔,返回鍵以待確認外觀出現', async ({ browser }) => {
  const { ctx, page } = await open(browser, PORTRAIT);
  await page.tap('#sStart h1');
  await back(page);
  expect(left(page)).toBe(false);
  expect(await status(page)).toEqual({ mode: 'survive', state: 'menu', armed: true, shown: true });
  await page.waitForTimeout(2300);
  expect(await status(page)).toEqual({ mode: 'survive', state: 'menu', armed: false, shown: false });
  await ctx.close();
});

test('觸控:返回上一個模式不攔', async ({ browser }) => {
  const { ctx, page } = await open(browser, PORTRAIT);
  await page.tap('#swBtn');
  await page.waitForFunction(() => CR.mode.name === 'bump');
  await back(page);
  expect(await status(page)).toEqual({ mode: 'survive', state: 'menu', armed: false, shown: false });
  await back(page);                        // now it would leave: confirm first
  expect(left(page)).toBe(false);
  expect((await status(page)).armed).toBe(true);
  await back(page);
  expect(left(page)).toBe(true);
  await ctx.close();
});

test('觸控:上一模式的回合中返回仍是放棄這一局', async ({ browser }) => {
  const { ctx, page } = await open(browser, PORTRAIT);
  await page.tap('#swBtn');
  await page.waitForFunction(() => CR.mode.name === 'bump');
  await page.tap('#bStartBtn');
  await page.waitForFunction(() => CR.state === 'countdown' || CR.state === 'play');
  await back(page);
  expect(await status(page)).toEqual({ mode: 'survive', state: 'menu', armed: false, shown: false });
  await ctx.close();
});

test('觸控:左上返回鍵仍是兩下放棄這一局', async ({ browser }) => {
  const { ctx, page } = await open(browser, PORTRAIT);
  await page.tap('#sStartBtn');
  await page.waitForFunction(() => CR.state === 'play');
  await page.tap('#backBtn');
  expect(await status(page)).toEqual({ mode: 'survive', state: 'play', armed: true, shown: true });
  await page.tap('#backBtn');
  expect((await status(page)).state).toBe('menu');
  expect(left(page)).toBe(false);
  await ctx.close();
});

test('桌面:不加攔截紀錄,系統返回一次就離開', async ({ browser }) => {
  const { ctx, page } = await open(browser, { viewport: { width: 1280, height: 800 } });
  const len = await page.evaluate(() => history.length);
  await page.click('#sStartBtn');
  await page.waitForFunction(() => CR.state === 'play');
  expect(await page.evaluate(() => history.length)).toBe(len);
  await back(page);
  expect(left(page)).toBe(true);
  await ctx.close();
});
