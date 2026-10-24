// Uses the locally installed Chrome; no browser download needed.
module.exports = {
  testDir: 'tests',
  timeout: 120000,
  workers: 1,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'node tests/server.js', url: 'http://127.0.0.1:4173/survive/', reuseExistingServer: true }
};
