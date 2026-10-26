/* 中英文:?lang=en / ?lang=zh 優先,其次是記住的選擇(和 onholdlab 首頁共用 ohl_lang),最後看瀏覽器語言。
   文字一律寫成 tr('中文', 'English');切換語言會重新載入頁面。 */
(function () {
  var lang = null;
  try { var q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'zh') { lang = q; localStorage.setItem('ohl_lang', JSON.stringify(q)); } } catch (e) {}
  if (!lang) { try { var s = JSON.parse(localStorage.getItem('ohl_lang')); if (s === 'en' || s === 'zh') lang = s; } catch (e) {} }
  if (!lang) lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  window.OHL_LANG = lang;
  window.tr = function (zh, en) { return lang === 'en' ? en : zh; };
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
  window.OHL_setLang = function (l) {
    try { localStorage.setItem('ohl_lang', JSON.stringify(l)); } catch (e) {}
    try { var u = new URL(location.href); u.searchParams.set('lang', l); location.replace(u.toString()); }
    catch (e) { location.reload(); }
  };
})();
