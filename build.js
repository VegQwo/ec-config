// build.js — 把模块打包成单个内联脚本，注入 index.html
//
// 原因：OpenRevo 的 load_plugin_html 是把 HTML 读入内存后内联资源再注入 iframe。
// 在这种环境下 <script type="module" src="..."> 不会执行，
// 导致插件 JS 从不运行、页面永远停在初始状态。
// 参考插件 sdt-pbo-plugin 正是用单文件内联 <script> 实现的，因此照做即可。
//
// 用法：node build.js

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const p = (f) => join(root, f);

const ORDER = [
  'js/ec-schema.js',    // 字段定义 + EC 地址映射
  'js/ec-raw.js',       // raw_ec 读写通道
  'js/ec-backup.js',    // 备份（localStorage）
  'js/app.js',          // UI 逻辑
];

/** 去掉 import / export 关键字，把模块降级为同一作用域下的普通声明。 */
function stripModuleSyntax(src) {
  let out = src;

  // 移除 import 语句（含多行）
  out = out.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  out = out.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');

  // export default { ... };  →  去掉
  out = out.replace(/^export\s+default\s+[^;]+;\s*$/gm, '');

  // export { a, b };  →  去掉
  out = out.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

  // export const/let/function/class  →  去掉 export 前缀
  out = out.replace(/^export\s+(const|let|var|function|class|async\s+function)/gm, '$1');

  return out;
}

const parts = [];
parts.push('/* ============================================================');
parts.push(' *  EC配置刷写插件 v2 — 打包产物（由 build.js 生成，请勿手改）');
parts.push(' *  所有模块合并为单一作用域；避免 <script type="module"> 在');
parts.push(' *  OpenRevo 的内联注入环境下不执行的问题。');
parts.push(' * ============================================================ */');
parts.push('(function () {');
parts.push("'use strict';");

for (const f of ORDER) {
  const src = readFileSync(p(f), 'utf8');
  parts.push('');
  parts.push(`/* ---------- ${f} ---------- */`);
  parts.push(stripModuleSyntax(src));
}

parts.push('');
parts.push('})();');

const bundle = parts.join('\n');

// 写入 js/bundle.js 便于调试
writeFileSync(p('js/bundle.js'), bundle, 'utf8');

// ---------------------------------------------------------------- CSS 内联
//
// 为什么不用 <link rel="stylesheet" href="css/xxx.css">：
// 宿主 load_plugin_html 会在内存里解析 <link> 并换成 <style data-inlined>，
// 但该解析对标签写法敏感。实测部分机器上自闭合写法 `<link ... />` 不被识别，
// 导致样式整个丢失（黑底黑字 / 完全无样式）。把 CSS 直接内联进 HTML
// 可以彻底绕开这条解析路径，任何机器上表现一致。
const CSS_FILE = 'css/ec-config.css';
const css = readFileSync(p(CSS_FILE), 'utf8');
const styleBlock =
  '<style data-inlined="' + CSS_FILE + '">\n' + css + '\n</style>';

// 注入 index.html
// 支持重复运行：优先替换未打包的 src 标签；若已是内联 bundle，则替换旧 bundle。
let html = readFileSync(p('index.html'), 'utf8');

// 兼容 CRLF / LF 两种换行：此前正则写死 \n，文件变成 CRLF 后匹配失败，构建直接中断。
const srcTagRe = /<script[^>]*src="js\/app\.js"[^>]*><\/script>/;
const inlineRe = /<script>\r?\n\/\* =+\r?\n \*  EC配置刷写插件[\s\S]*?\r?\n<\/script>/;

// <link> 若还在就换成内联 <style>；已经是 <style data-inlined> 则原地替换。
const linkRe = /[ \t]*<link[^>]*rel=["']stylesheet["'][^>]*>[ \t]*\r?\n?/i;
const styleRe = /<style data-inlined="css\/ec-config\.css">[\s\S]*?<\/style>/;

const newTag = '<script>\n' + bundle + '\n</script>';
let out;

if (srcTagRe.test(html)) {
  out = html.replace(srcTagRe, newTag);
} else if (inlineRe.test(html)) {
  out = html.replace(inlineRe, newTag);
} else {
  console.error('❌ index.html 中既找不到 app.js 的 script 标签，也找不到已有 bundle');
  process.exit(1);
}

// CSS：先尝试替换 link，再尝试替换已有 style
if (linkRe.test(out)) {
  out = out.replace(linkRe, styleBlock + '\n');
} else if (styleRe.test(out)) {
  out = out.replace(styleRe, styleBlock);
} else {
  console.error('❌ index.html 中既找不到 stylesheet 的 link 标签，也找不到已内联的 style');
  process.exit(1);
}

writeFileSync(p('index.html'), out, 'utf8');

console.log('✅ 打包完成');
console.log('   bundle 大小:', bundle.length, 'bytes');
console.log('   css 内联:', css.length, 'bytes');
console.log('   index.html 大小:', out.length, 'bytes');
