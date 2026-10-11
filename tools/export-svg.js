#!/usr/bin/env node
/**
 * 成绩雷达 ScoreRadar · 命令行导出工具
 *
 * 用法：
 *   node tools/export-svg.js sample-data.csv out
 *
 * 它会读取一个 CSV 成绩表，生成：
 *   out/总分趋势.svg
 *   out/各科趋势.svg
 *   out/各科得分率.svg
 *   out/分析报告.html   ← 用浏览器打开这个就能看全部内容
 *
 * 什么时候用得上？
 *   - 想把这些图贴到 Word / PPT 里交作业
 *   - 想在没有浏览器的环境里批量生成图表
 */

"use strict";

var fs = require("fs");
var path = require("path");
var C = require("../core.js");

var inputPath = process.argv[2];
var outDir = process.argv[3] || "out";

if (!inputPath) {
  console.log("用法: node tools/export-svg.js <成绩表.csv> [输出目录]");
  console.log("例子: node tools/export-svg.js sample-data.csv out");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error("找不到文件: " + inputPath);
  process.exit(1);
}

var text = fs.readFileSync(inputPath, "utf8");
var parsed = C.parseTable(text);

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
var totalSvg = C.lineChartSVG({
  title: "总分趋势",
  labels: ds.examNames,
  series: [{ name: "总分", values: ds.totals, color: "#2563eb" }],
  showValues: true,
  width: 820,
  height: 400
});
save("总分趋势.svg", totalSvg);

/* —— 图 2：各科趋势 —— */
var subjectSvg = C.lineChartSVG({
  title: "各科趋势",
  labels: ds.examNames,
  series: ds.columns.map(function (col) {
    return { name: col.name, values: col.values, color: col.color };
  }),
  width: 820,
  height: 440
});
save("各科趋势.svg", subjectSvg);

/* —— 图 3：各科平均得分率（没填满分就画原始平均分）—— */
var barSvg = "";
var barTitle = "";
if (ds.hasFullMarks) {
  barTitle = "各科平均得分率";
  var items = ds.columns.map(function (col) {
    return {
      label: col.name,
      value: col.rateStats ? col.rateStats.avg : 0,
      display: C.formatNumber((col.rateStats ? col.rateStats.avg : 0) * 100, 1) + "%",
      color: col.color
    };
  }).sort(function (a, b) { return b.value - a.value; });
  barSvg = C.barChartSVG({ items: items, width: 820, labelWidth: 90 });
  save("各科得分率.svg", barSvg);
} else {
  barTitle = "各科平均分（未填满分，仅供参考）";
  var items2 = ds.columns.map(function (col) {
    return {
      label: col.name,
      value: col.stats.avg,
      display: C.formatNumber(col.stats.avg, 1),
      color: col.color
    };
  }).sort(function (a, b) { return b.value - a.value; });
  barSvg = C.barChartSVG({ items: items2, width: 820, labelWidth: 90 });
  save("各科平均分.svg", barSvg);
}

/* —— 分析报告 HTML —— */
var insights = C.diagnose(ds);
var colorOf = { good: "#059669", warn: "#dc2626", info: "#2563eb" };
var bgOf = { good: "#ecfdf5", warn: "#fef2f2", info: "#eff6ff" };

var cards = insights.map(function (it) {
  return '<div class="card" style="border-left-color:' + colorOf[it.level] + ';background:' + bgOf[it.level] + '">' +
         '<div class="ct" style="color:' + colorOf[it.level] + '">' + C.escapeXml(it.title) + '</div>' +
         '<div class="cx">' + C.escapeXml(it.text) + '</div></div>';
}).join("\n");

var tableHead = "<tr><th>考试</th>" + ds.subjectNames.map(function (s) {
  return "<th>" + C.escapeXml(s) + "</th>";
}).join("") + "<th>总分</th></tr>";

var tableBody = ds.examNames.map(function (name, i) {
  var tds = ds.columns.map(function (col) {
    return "<td>" + C.formatNumber(col.values[i], 1) + "</td>";
  }).join("");
  return "<tr><th>" + C.escapeXml(name) + "</th>" + tds +
         "<td class='total'>" + C.formatNumber(ds.totals[i], 1) + "</td></tr>";
}).join("\n");

var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<title>成绩趋势分析报告</title><style>' +
  'body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}' +
  '.wrap{max-width:900px;margin:0 auto}h1{font-size:24px;margin:0 0 4px}' +
  '.sub{color:#64748b;font-size:13px;margin-bottom:24px}' +
  '.card{border-left:4px solid;border-radius:8px;padding:12px 16px;margin:10px 0}' +
  '.ct{font-weight:700;font-size:14px;margin-bottom:3px}.cx{font-size:13.5px;line-height:1.65;color:#334155}' +
  'h2{font-size:17px;margin:32px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}' +
  'table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;border-radius:10px;overflow:hidden}' +
  'th,td{padding:9px 12px;text-align:right;border-bottom:1px solid #f1f5f9}' +
  'thead th{background:#f1f5f9;color:#475569;font-weight:600}' +
  'tbody th{text-align:left;font-weight:500;color:#334155}' +
  '.total{font-weight:700;color:#2563eb}' +
  '.chartbox{background:#fff;border-radius:12px;padding:8px;margin-bottom:16px;box-shadow:0 1px 3px rgba(15,23,42,.06)}' +
  'footer{margin-top:36px;color:#94a3b8;font-size:12px}' +
  '</style></head><body><div class="wrap">' +
  '<h1>成绩趋势分析报告</h1>' +
  '<div class="sub">共 ' + ds.examNames.length + ' 次考试 · ' + ds.subjectNames.length + ' 个科目 · ' +
  (ds.hasFullMarks ? "已按满分折算得分率" : "未填写满分，跨科对比可能不准") +
  ' · 由成绩雷达 ScoreRadar v' + C.VERSION + ' 生成</div>' +
  '<h2>自动诊断</h2>' + cards +
  '<h2>总分趋势</h2><div class="chartbox">' + totalSvg + '</div>' +
  '<h2>各科趋势</h2><div class="chartbox">' + subjectSvg + '</div>' +
  '<h2>' + barTitle + '</h2><div class="chartbox">' + barSvg + '</div>' +
  '<h2>原始数据</h2><table><thead>' + tableHead + '</thead><tbody>' + tableBody + '</tbody></table>' +
  '<footer>成绩雷达 ScoreRadar · 数据全部在你的电脑上处理，不会上传到任何地方</footer>' +
  '</div></body></html>';

save("分析报告.html", html);

/* —— 终端上也打印一份结论 —— */
console.log("已分析：" + ds.examNames.length + " 次考试，" + ds.subjectNames.length + " 个科目\n");
insights.forEach(function (it) {
  var mark = it.level === "warn" ? "[注意]" : (it.level === "good" ? "[不错]" : "[提示]");
  console.log(mark + " " + it.title);
  console.log("       " + it.text);
});
console.log("\n生成的文件：");
written.forEach(function (p) { console.log("  " + p); });
