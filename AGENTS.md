# Review guidelines（onholdlab 網頁遊戲）

- 遊戲頁必須保留 `<style id="inapp-lock">` 和 `inapp-lock-js`；刪掉或改成 passive 監聽，Threads/IG 內建瀏覽器會整頁滑動、搖桿失效。
- 不可用 `100vh` 排版；用 `100%` 或 `100dvh`。
- 轉址與 `pushState` 的目標必須是實際存在的檔案；不可相對路徑指回自己（曾造成 survive 頁 404）。itch.io 不會自動補 `index.html`，路徑要帶完整檔名。
- `og:image` 必須是絕對網址。
- 只回報會讓玩家玩不了或看錯的問題；不要回報命名、格式、風格。
- 求生與撞人賽共用 `js/engine.js`：改引擎時要確認兩個模式都能開、能互相切換。
