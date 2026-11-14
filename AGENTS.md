# Review guidelines（onholdlab 網頁遊戲）

- 遊戲頁必須保留 `<style id="inapp-lock">` 和 `inapp-lock-js`；刪掉或改成 passive 監聽，Threads/IG 內建瀏覽器會整頁滑動、搖桿失效。
- 不可用 `100vh` 排版；用 `100%` 或 `100dvh`。
- 轉址與 `pushState` 的目標必須是實際存在的檔案；不可相對路徑指回自己（曾造成 survive 頁 404）。itch.io 不會自動補 `index.html`，路徑要帶完整檔名。
- `og:image` 必須是絕對網址。
- 只回報會讓玩家玩不了或看錯的問題；不要回報命名、格式、風格。
- 求生與撞人賽共用 `js/engine.js`：改引擎時要確認兩個模式都能開、能互相切換。

# 開發規則（Claude Code 與 Codex 共用）

## 規格先行（SDD）

規格＝本檔上面的 Review guidelines、README，加上 `tests/` 裡的測試。改行為一律照這個順序：

1. 先把要的行為寫成一句規格（寫進 PR 描述，長期規則寫進本檔）。
2. 再寫測試：新增 `tests/<主題>.spec.js`，或在既有測試檔裡「只新增」新的 test。跑 `npm test`，確認新測試先失敗。
3. 最後改程式，直到 `npm test` 全部通過。

## 測試只能新增

- 既有測試不能改寫或刪除。測試沒過要修的是程式碼，不是測試。
- 如果認為測試本身寫錯了，停下來說明是哪一條、為什麼錯、規格該怎麼改，由使用者決定。
- CI 的 test-guard 會擋：PR 改寫、刪除或搬移既有測試，或新增、修改 `.claude/hooks/`、`.claude/settings.json`、`.github/workflows/`、`.github/scripts/`、`playwright.config.js`、`tests/server.js` 這些 harness 檔案，都要使用者在 PR 加上 `harness-reviewed` 標籤才會通過。

## 自動檢查（harness）

- 每個 PR 都會在 GitHub Actions 跑 `test`（先跑 harness 自我測試，再跑 Playwright，用 runner 內建的 Chrome）。`test-guard` 要等它合併進 `main` 之後，才會檢查之後送往 `main` 的 PR，結果回報在 PR 最新的 commit。有紅叉就不要合併；要讓紅叉真的擋住合併，需在 GitHub 另設分支保護。
- 本機第一次跑：在專案資料夾執行 `npm ci`，之後 `npm test`。需要電腦上有 Google Chrome。

## 長任務的 context

- 進度寫在 PR 描述的待辦清單：做了什麼、下一步、卡在哪。
- 換新對話時先讀 PR 描述，再跑一次 `npm test` 看現況，不靠對話記憶接續。
