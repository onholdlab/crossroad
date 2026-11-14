// PreToolUse hook：測試只能「新增」，不能改寫或刪除；harness 本身（hooks、CI）AI 不能改。
// 來源：onholdlab/rules 的 templates/harness（2026-11-14）。各 repo 的差異只放在 config.json。
//
// 允許：新建測試檔、在既有測試檔「純插入」內容（原本每一行都還在、順序不變）。
// 擋下：改寫或刪掉既有測試內容、改 harness 檔案。
// 真的要改：由使用者在啟動 Claude Code 前設定環境變數 OHL_ALLOW_TEST_EDIT=1，
// 或自己改；CI 的 test-guard 仍會要求 PR 加上 harness-reviewed 標籤。
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const cfg = JSON.parse(readFileSync(resolve(root, '.claude/hooks/config.json'), 'utf8'));

if (process.env.OHL_ALLOW_TEST_EDIT === '1') process.exit(0);

const tool = input.tool_name || '';
const ti = input.tool_input || {};
const target = ti.file_path || ti.notebook_path;
if (!target || !['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) process.exit(0);

const rel = relative(root, resolve(root, String(target).replace(/\\/g, '/'))).split(sep).join('/');
const under = (p, dir) => p === dir.replace(/\/$/, '') || p.startsWith(dir.replace(/\/$/, '') + '/');

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
  }));
  process.exit(0);
}

if ((cfg.harnessPaths || []).some(p => under(rel, p))) {
  deny(`「${rel}」是 harness（自動檢查本身），AI 不能修改。若真的需要改，停下來告訴使用者原因，由使用者決定。`);
}

if (!(cfg.testDirs || []).some(d => under(rel, d))) process.exit(0);
const abs = resolve(root, rel);
if (!existsSync(abs)) process.exit(0); // 新測試檔：允許

const lines = s => s.replace(/\r\n/g, '\n').split('\n');
const isPureInsertion = (oldText, newText) => {
  // 舊內容的每一行都依原順序出現在新內容裡 → 只有新增，沒有改寫或刪除
  const o = lines(oldText), n = lines(newText);
  let i = 0;
  for (const line of n) if (i < o.length && line === o[i]) i++;
  return i === o.length;
};

let ok = false;
if (tool === 'Edit') ok = ti.old_string !== '' && isPureInsertion(ti.old_string || '', ti.new_string || '');
else if (tool === 'MultiEdit') ok = (ti.edits || []).every(e => e.old_string !== '' && isPureInsertion(e.old_string || '', e.new_string || ''));
else if (tool === 'Write') ok = isPureInsertion(readFileSync(abs, 'utf8'), ti.content || '');

if (!ok) {
  deny(`測試是規格，只能新增、不能改寫或刪除（${rel}）。` +
    '測試沒過時要修的是程式碼，不是測試。若你認為測試本身寫錯了，停下來告訴使用者：哪一條、為什麼錯、規格該怎麼改，由使用者決定。');
}
