/**
 * 成绩雷达 ScoreRadar · 自动测试
 *
 * 运行方式：  node test.js
 *
 * 为什么要写测试？
 *   因为人对自己的代码会有错觉——"看起来对"不等于"真的对"。
 *   测试就是把你认为正确的答案写成代码，让机器每次都帮你复核一遍。
 *   以后你改代码改坏了，跑一下 test.js 就能立刻发现。
 *
 * 这里不依赖任何第三方测试框架，自己写 20 行就够了。
 */

"use strict";

var C = require("./core.js");

var passed = 0;
var failed = 0;
var failures = [];
var currentGroup = "";

function group(name) {
  currentGroup = name;
  console.log("\n" + name);
}

function check(label, condition, extra) {
  if (condition) {
    passed++;
    console.log("  \u2713 " + label);
  } else {
    failed++;
    failures.push(currentGroup + " \u203A " + label + (extra ? "\n      " + extra : ""));
    console.log("  \u2717 " + label + (extra ? "\n      " + extra : ""));
  }
}

function eq(label, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  check(label, a === e, "期望 " + e + "，实际 " + a);
}

/* ================================================================== */
group("一、解析成绩表（parseTable）");
/* ================================================================== */

// 从 Excel 里复制出来的是制表符分隔
var tsv = [
  "考试\t语文\t数学\t英语",
  "第一次月考\t102\t118\t112",
  "期中考试\t108\t126\t109"
].join("\n");

var r1 = C.parseTable(tsv);
check("制表符格式能解析成功", r1.ok, r1.error);
eq("识别出 2 次考试", r1.examCount, 2);
eq("识别出 3 个科目", r1.subjectCount, 3);
eq("表头正确", r1.headers, ["考试", "语文", "数学", "英语"]);
eq("第一次考试的名字", r1.rows[0][0], "第一次月考");
eq("数学成绩读对了", r1.rows[0][2], 118);

// 手写的逗号 CSV
var csv = "考试,语文,数学\n月考一,100,90\n月考二,105,95\n月考三,110,99";
var r2 = C.parseTable(csv);
check("逗号格式能解析成功", r2.ok, r2.error);
eq("逗号格式的考试次数", r2.examCount, 3);
eq("逗号格式的最后一科成绩", r2.rows[2][2], 99);

// 两个以上空格分隔
var spaced = "考试  语文  数学\n月考一  100  90\n月考二  105  95";
var r3 = C.parseTable(spaced);
check("空格分隔能解析成功", r3.ok, r3.error);
eq("空格格式的科目数", r3.subjectCount, 2);

// 「满分」行应该被识别出来，而且不能算成一次考试
var withFull = [
  "考试,语文,数学,物理",
  "满分,150,150,100",
  "月考一,102,118,88",
  "月考二,108,126,84"
].join("\n");
var r4 = C.parseTable(withFull);
check("带满分行的表能解析", r4.ok, r4.error);
eq("满分行没有被当成考试", r4.examCount, 2);
eq("满分值读取正确", r4.fullMarks, [150, 150, 100]);

// 全角数字应该也能认
var fullwidth = "考试,语文\n月考一,１０２\n月考二,１１５";
var r5 = C.parseTable(fullwidth);
check("全角数字能识别", r5.ok, r5.error);
eq("全角 １０２ 被转成 102", r5.rows[0][1], 102);

// 空单元格 = 缺考，应该是 null 而不是 0
var withBlank = "考试,语文,数学\n月考一,100,\n月考二,105,95";
var r6 = C.parseTable(withBlank);
check("有空格的表能解析", r6.ok, r6.error);
eq("空着的那格是 null（缺考），不是 0", r6.rows[0][2], null);

// 填了非数字要报错，而且要指出是哪一格
var broken = "考试,语文,数学\n月考一,100,缺考\n月考二,105,95";
var r7 = C.parseTable(broken);
check("填了非数字时解析失败", r7.ok === false);
check("报错信息里指出了科目和考试名",
  !r7.ok && r7.error.indexOf("数学") >= 0 && r7.error.indexOf("月考一") >= 0,
  r7.error);

// 空输入
var r8 = C.parseTable("   ");
check("空输入给出友好提示", r8.ok === false && r8.error.length > 0);

// 只有一列
var r9 = C.parseTable("考试\n月考一\n月考二");
check("只有一列时报错", r9.ok === false);

/* ================================================================== */
group("二、趋势统计（trendStats）");
/* ================================================================== */

var s1 = C.trendStats([100, 110, 120]);
eq("第一次的值", s1.first, 100);
eq("最后一次的值", s1.last, 120);
eq("总变化 = 20", s1.change, 20);
eq("斜率 = 每次 +10", s1.slope, 10);
eq("平均分 = 110", s1.avg, 110);
eq("标准差 = 10", s1.std, 10);

var s2 = C.trendStats([120, 110, 100, 95]);
eq("连续下滑次数 = 3", s2.maxDeclineRun, 3);
eq("连续下滑结束在第 4 次（下标 3）", s2.declineRunEnd, 3);
eq("总变化 = -25", s2.change, -25);
eq("最高点下标 = 0", s2.peakIndex, 0);
eq("从最高点回落 25", s2.maxDrop, 25);

var s3 = C.trendStats([100, 130, 90, 120]);
eq("回落幅度 = 40（130 → 90）", s3.maxDrop, 40);
eq("回落起点下标 = 1", s3.dropFrom, 1);
eq("回落终点下标 = 2", s3.dropTo, 2);
// 130 → 90 只跌了 1 次，之后又涨回去了，所以不该被当成"连续下滑"来警告。
// （诊断逻辑要求 maxDeclineRun >= 2 才发警告，见下面第四节。）
eq("忽高忽低时最长连续下滑只有 1 次", s3.maxDeclineRun, 1);

// 缺考（null）必须被打断，不能算成连续下滑
var s4 = C.trendStats([100, 90, null, 80, 70]);
eq("缺考会打断连续下滑", s4.maxDeclineRun, 1);
eq("有效数据点只有 4 个", s4.n, 4);

var s5 = C.trendStats([null, null]);
eq("全是空值时 n = 0", s5.n, 0);
eq("全是空值时 change 为 null", s5.change, null);

var s6 = C.trendStats([88]);
eq("只有一个点时标准差为 0", s6.std, 0);
eq("只有一个点时斜率为 0", s6.slope, 0);

// 浮点数不应该出现 0.30000000000000004 这种鬼东西
var s7 = C.trendStats([0.1, 0.2, 0.3]);
eq("浮点误差被处理掉", s7.change, 0.2);

// 残差标准差：用来区分"一直在退步"和"忽高忽低"，这两件事完全不同
eq("完美直线上残差为 0", C.trendStats([100, 110, 120]).residStd, 0);
check("匀速下滑的残差也很小（不算不稳定）",
  C.trendStats([88, 84, 79, 76, 72, 68]).residStd < 1.5,
  "residStd=" + C.trendStats([88, 84, 79, 76, 72, 68]).residStd);
check("忽高忽低的残差明显更大",
  C.trendStats([100, 130, 100, 130]).residStd > 10,
  "residStd=" + C.trendStats([100, 130, 100, 130]).residStd);

/* ================================================================== */
group("三、组装数据集（buildDataset）");
/* ================================================================== */

var ds = C.buildDataset(C.parseTable([
  "考试,语文,数学,物理",
  "满分,150,150,100",
  "月考一,102,118,88",
  "月考二,108,126,84",
  "月考三,105,135,79"
].join("\n")));

check("数据集构建成功", ds.ok, ds.error);
eq("考试名列表", ds.examNames, ["月考一", "月考二", "月考三"]);
eq("科目名列表", ds.subjectNames, ["语文", "数学", "物理"]);
eq("总分计算正确", ds.totals, [308, 318, 319]);
eq("识别出填了满分", ds.hasFullMarks, true);
eq("物理满分是 100", ds.columns[2].full, 100);
eq("语文得分率 102/150 = 0.68", C.formatNumber(ds.columns[0].rates[0], 2), "0.68");
eq("数学趋势上升 17 分", ds.columns[1].stats.change, 17);
eq("物理连续下滑 2 次", ds.columns[2].stats.maxDeclineRun, 2);

// 不填满分时，不应该凭空造出得分率
var ds2 = C.buildDataset(C.parseTable("考试,语文\n月考一,100\n月考二,110"));
eq("没填满分时 hasFullMarks 为 false", ds2.hasFullMarks, false);
eq("没填满分时得分率为 null", ds2.columns[0].rates, null);

/* ================================================================== */
group("四、自动诊断（diagnose）");
/* ================================================================== */

var dsBig = C.buildDataset(C.parseTable([
  "考试,语文,数学,英语,物理,化学,生物",
  "满分,150,150,150,100,100,100",
  "高二上月考1,102,118,112,88,72,75",
  "高二上期中,108,126,109,84,70,78",
  "高二上月考2,105,135,115,79,76,82",
  "高二下月考1,112,128,118,76,79,80",
  "高二下期中,110,142,121,72,83,86",
  "高二下月考2,116,139,124,68,88,84"
].join("\n")));

var insights = C.diagnose(dsBig);
check("产生了诊断结论", insights.length > 0, "共 " + insights.length + " 条");

var titles = insights.map(function (i) { return i.title; }).join(" | ");
check("发现了物理连续下滑", titles.indexOf("物理 连续下滑 5 次") >= 0, titles);
check("指出了总分趋势", titles.indexOf("总分趋势") >= 0, titles);
check("指出了最强科目", titles.indexOf("最强科目") >= 0, titles);
check("指出了最弱科目", titles.indexOf("最弱科目") >= 0, titles);

var physicsCard = insights.filter(function (i) { return i.title.indexOf("物理 连续下滑") === 0; })[0];
check("连续下滑的卡片是警告级别", physicsCard && physicsCard.level === "warn");
check("卡片里写了从几分掉到几分",
  physicsCard && physicsCard.text.indexOf("88") >= 0 && physicsCard.text.indexOf("68") >= 0,
  physicsCard && physicsCard.text);

// 回归测试：物理是一路匀速下滑，绝不能被同时说成"忽高忽低、最不稳定"。
// （曾经因为用普通标准差判断波动，真的踩过这个坑。）
check("匀速下滑的科目不会被误判为最不稳定",
  !insights.some(function (i) { return i.title === "物理 最不稳定"; }),
  insights.map(function (i) { return i.title; }).join(" / "));

// 没填满分时，必须明确提醒"不能跨科比平均分"，而不是默默给个错结论
var insights2 = C.diagnose(ds2);
var hasHint = insights2.some(function (i) { return i.title.indexOf("满分") >= 0; });
check("没填满分时会提醒加满分", hasHint);

// 数据太少时要提醒
var dsTiny = C.buildDataset(C.parseTable("考试,语文\n月考一,100\n月考二,110"));
check("数据少时会提醒",
  C.diagnose(dsTiny).some(function (i) { return i.title.indexOf("数据还太少") >= 0; }));

/* —— 及格线预警 ——
   故意让语文掉到 55% 左右（该报警），数学卡在 65% 左右（不该报警）。
   这两个数字是精心挑的：如果谁把及格线从 60% 调成 70%，
   下面那条"数学不该报警"的测试就会当场失败。 */
var dsFail = C.buildDataset(C.parseTable([
  "考试,语文,数学,物理",
  "满分,150,150,100",
  "月考一,80,100,70",
  "月考二,85,95,72",
  "月考三,82,98,68"
].join("\n")));

check("测试数据准备正确（语文 54.9%、数学 65.1%）",
  C.formatNumber(dsFail.columns[0].rateStats.avg * 100, 1) === "54.9" &&
  C.formatNumber(dsFail.columns[1].rateStats.avg * 100, 1) === "65.1",
  "语文=" + C.formatNumber(dsFail.columns[0].rateStats.avg * 100, 1) +
  " 数学=" + C.formatNumber(dsFail.columns[1].rateStats.avg * 100, 1));

var insights3 = C.diagnose(dsFail);

var failCard = insights3.filter(function (i) { return i.title === "语文 已低于及格线"; })[0];
check("得分率低于 60% 会触发及格预警", !!failCard,
  insights3.map(function (i) { return i.title; }).join(" / "));
check("及格预警是警告级别", failCard && failCard.level === "warn");
check("预警里写明了差几个百分点",
  failCard && failCard.text.indexOf("5.1 个百分点") >= 0,
  failCard && failCard.text);
check("预警里把百分点换算成了具体分数（差 7.7 分）",
  failCard && failCard.text.indexOf("7.7 分") >= 0,
  failCard && failCard.text);

// 这条是"护栏"：改及格线的人会先撞上它
check("得分率高于 60% 的科目不应该被预警",
  !insights3.some(function (i) { return i.title === "数学 已低于及格线"; }),
  insights3.map(function (i) { return i.title; }).join(" / "));
check("物理 70% 也不该被预警",
  !insights3.some(function (i) { return i.title === "物理 已低于及格线"; }));

// 没填满分就算不出得分率，自然也不该瞎报警
check("没填满分时不会出现及格预警",
  !C.diagnose(ds2).some(function (i) { return i.title.indexOf("已低于及格线") >= 0; }));

/* ================================================================== */
group("五、画图（SVG）");
/* ================================================================== */

var svg = C.lineChartSVG({
  labels: ["月考一", "月考二", "月考三"],
  series: [
    { name: "数学", values: [118, 126, 135], color: "#2563eb" },
    { name: "物理", values: [88, 84, 79], color: "#dc2626" }
  ],
  title: "各科趋势",
  width: 720,
  height: 360
});

check("返回的是 SVG", svg.indexOf("<svg") === 0);
check("SVG 正确闭合", svg.lastIndexOf("</svg>") === svg.length - 6);
check("画出了折线", svg.indexOf("<polyline") >= 0);
check("画出了数据点", svg.indexOf("<circle") >= 0);
check("画出了两个科目的图例", svg.indexOf("数学") >= 0 && svg.indexOf("物理") >= 0);
check("折线有注释（鼠标悬停可看分数）", svg.indexOf("<title>") >= 0);

// 缺考时折线必须断开，不能连成一条假的直线
var svgGap = C.lineChartSVG({
  labels: ["一", "二", "三", "四", "五"],
  series: [{ name: "数学", values: [100, 110, null, 120, 130] }]
});
var polylineCount = (svgGap.match(/<polyline/g) || []).length;
eq("中间缺考时折线断成 2 段", polylineCount, 2);

// 孤立的单点连不成线，但仍要把那个点画出来（不然学生会以为数据丢了）
var svgLone = C.lineChartSVG({
  labels: ["一", "二", "三"],
  series: [{ name: "数学", values: [100, null, 120] }]
});
eq("孤立单点不画折线", (svgLone.match(/<polyline/g) || []).length, 0);
eq("但孤立单点仍然画出来", (svgLone.match(/<circle/g) || []).length, 2);

// 危险字符必须被转义，否则会破坏 SVG 结构
var svgEsc = C.lineChartSVG({
  labels: ["<script>bad</script>"],
  series: [{ name: "<b>数学</b>", values: [100, 110] }]
});
check("尖括号被转义", svgEsc.indexOf("<script>") < 0 && svgEsc.indexOf("&lt;script&gt;") >= 0);
check("科目名里的标签被转义", svgEsc.indexOf("<b>") < 0);

check("没有数据时返回占位图而不是崩溃",
  C.lineChartSVG({ labels: [], series: [] }).indexOf("<svg") === 0);

var bar = C.barChartSVG({
  items: [
    { label: "语文", value: 0.72, display: "72%" },
    { label: "物理", value: 0.78, display: "78%" }
  ],
  width: 600
});
check("条形图能生成", bar.indexOf("<svg") === 0 && bar.indexOf("72%") >= 0);
check("条形图画了背景条和数值条", (bar.match(/<rect/g) || []).length >= 4);

/* ================================================================== */
group("六、刻度算法（niceScale）");
/* ================================================================== */

var ns = C.niceScale(62, 142, 5);
check("刻度下界不高于最小值", ns.min <= 62, "min=" + ns.min);
check("刻度上界不低于最大值", ns.max >= 142, "max=" + ns.max);
check("刻度是整数好看的数", ns.step === 20 || ns.step === 10 || ns.step === 25, "step=" + ns.step);
eq("刻度数量合理", ns.ticks.length >= 4 && ns.ticks.length <= 9, true);

var ns2 = C.niceScale(0.6, 0.85, 5);
check("得分率这种小数刻度也能处理", ns2.step > 0 && ns2.step < 0.2, "step=" + ns2.step);

var ns3 = C.niceScale(100, 100, 5);
check("所有分数一样时不会除以零", isFinite(ns3.min) && isFinite(ns3.max) && ns3.max > ns3.min);

/* ================================================================== */
console.log("\n" + "-".repeat(52));
if (failed === 0) {
  console.log("全部通过： " + passed + " 项");
} else {
  console.log("通过 " + passed + " 项，失败 " + failed + " 项：");
  failures.forEach(function (f) { console.log("  \u2717 " + f); });
}
console.log("-".repeat(52));

process.exit(failed === 0 ? 0 : 1);
