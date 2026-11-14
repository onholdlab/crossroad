// Uses the locally installed Chrome; no browser download needed.
module.exports = {
  testDir: 'tests',
  timeout: 120000,
  workers: 1,
  // 測試以中文介面為規格；固定 zh-TW，免得在英文系統（例如 GitHub Actions）上因語言不同而失敗。
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4173', locale: 'zh-TW', screenshot: 'only-on-failure' },
  webServer: { command: 'node tests/server.js', url: 'http://127.0.0.1:4173/survive/', reuseExistingServer: true }
};
