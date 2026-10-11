#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 里抽出某个版本的说明，用来生成 GitHub Release 的正文。
 *
 * 用法：
 *   node tools/changelog-notes.js v0.2.0
 *
 * 为什么要有这个文件？
 *   发版时最烦的就是"再手写一遍更新说明"——写两遍必然写不一致。
 *   让 Release 的说明直接从 CHANGELOG.md 里取，就只有一份真实来源。
 *
 * 找不到对应版本时会以非零状态码退出，这样发版流程会自动失败，
 * 而不是悄悄发一个空的 Release 出去。
 */

"use strict";

var fs = require("fs");
var path = require("path");

var tag = (process.argv[2] || "").trim();

if (!tag) {
  console.error("用法: node tools/changelog-notes.js <版本标签>");
  console.error("例子: node tools/changelog-notes.js v0.2.0");
  process.exit(1);
}

// 标签可能是 v0.2.0 或 0.2.0，统一去掉开头的 v
var version = tag.replace(/^v/i, "");

var changelogPath = path.join(__dirname, "..", "CHANGELOG.md");
if (!fs.existsSync(changelogPath)) {
  console.error("找不到 CHANGELOG.md");
  process.exit(1);
}

var md = fs.readFileSync(changelogPath, "utf8");

// 按二级标题切开，找以 [版本号] 开头的那一段
var sections = md.split(/^## /m);
var hit = null;
for (var i = 0; i < sections.length; i++) {
  if (sections[i].indexOf("[" + version + "]") === 0) { hit = sections[i]; break; }
}

if (!hit) {
  console.error("CHANGELOG.md 里找不到版本 " + version + "。");
  console.error("已经有的版本：");
  sections.forEach(function (s) {
    var m = s.match(/^\[([^\]]+)\]/);
    if (m) console.error("  " + m[1]);
  });
  process.exit(1);
}

process.stdout.write("## " + hit.trim() + "\n");
