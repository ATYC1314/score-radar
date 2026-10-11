#!/usr/bin/env node
/**
 * 成绩雷达 ScoreRadar · 命令行导出工具
 *
 * 用法：
 *   node tools/export-svg.js sample-data.csv out
 *
 * 它会读取一个 CSV 成绩表（UTF-8 / GBK 都能自动识别），生成：
 *   out/总分趋势.svg
 *   out/各科趋势.svg
 *   out/各科得分率.svg
 *   out/分析报告.html   ← 双击就能看的完整报告
 *
 * 什么时候用得上？
 *   - 想把图表贴进 Word / PPT 交作业
 *   - 想在没有浏览器的环境里批量生成
 *
 * 注意：报告和图表的真正生成逻辑都在 core.js 里（buildReportHTML / rankingItems），
 * 这个文件只负责"读文件、写文件"。这样网页界面和命令行导出的结果永远一致。
 */

"use strict";

var fs = require("fs");
var path = require("path");
var C = require("../core.js");

var inputPath = process.argv[2];
var outDir = process.argv[3] || "out";

if (!inputPath || inputPath === "-h" || inputPath === "--help") {
  console.log("成绩雷达 ScoreRadar v" + C.VERSION + " · 命令行导出");
  console.log("");
  console.log("用法: node tools/export-svg.js <成绩表.csv> [输出目录]");
  console.log("例子: node tools/export-svg.js sample-data.csv out");
  process.exit(inputPath ? 0 : 1);
}

if (!fs.existsSync(inputPath)) {
  console.error("找不到文件: " + inputPath);
  process.exit(1);
}

/* 读原始字节再交给 core.js 判断编码 —— 中文 Windows 上 Excel 存的 CSV 是 GBK，
   直接按 utf8 读会得到一堆乱码。 */
var bytes = new Uint8Array(fs.readFileSync(inputPath));
var decoded = C.decodeBytes(bytes);

if (decoded.encoding !== "utf-8") {
  console.log("检测到文件编码：" + decoded.encoding + "（已自动转换）");
}

var parsed = C.parseTable(decoded.text);
if (!parsed.ok) {
  console.error("成绩表解析失败：\n" + parsed.error);
  process.exit(1);
}

var ds = C.buildDataset(parsed);
if (!ds.ok) {
  console.error("数据组装失败：" + ds.error);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

var written = [];
function save(name, content) {
  var p = path.join(outDir, name);
  fs.writeFileSync(p, content, "utf8");
  written.push(p);
  return p;
}

/* —— 图 1：总分趋势 —— */
save("总分趋势.svg", C.lineChartSVG({
  title: "总分趋势",
  labels: ds.examNames,
  series: [{ name: "总分", values: ds.totals, color: "#2563eb" }],
  showValues: true,
  width: 820,
  height: 400
}));

/* —— 图 2：各科趋势 —— */
save("各科趋势.svg", C.lineChartSVG({
  title: "各科趋势",
  labels: ds.examNames,
  series: ds.columns.map(function (col) {
    return { name: col.name, values: col.values, color: col.color };
  }),
  width: 820,
  height: 440
}));

/* —— 图 3：排行榜（和网页界面共用同一份数据，排序保证一致）—— */
var rank = C.rankingItems(ds);
save(rank.isRate ? "各科得分率.svg" : "各科平均分.svg",
     C.barChartSVG({ items: rank.items, width: 820, labelWidth: 90 }));

/* —— 完整报告 —— */
save("分析报告.html", C.buildReportHTML(ds, {
  width: 820,
  generatedAt: new Date().toLocaleString("zh-CN")
}));

/* —— 终端上也打印一份结论 —— */
console.log("已分析：" + ds.examNames.length + " 次考试，" + ds.subjectNames.length + " 个科目\n");
C.diagnose(ds).forEach(function (it) {
  var mark = it.level === "warn" ? "[注意]" : (it.level === "good" ? "[不错]" : "[提示]");
  console.log(mark + " " + it.title);
  console.log("       " + it.text);
});

console.log("\n生成的文件：");
written.forEach(function (p) { console.log("  " + p); });
