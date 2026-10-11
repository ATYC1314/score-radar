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

// 同一个字段要同时装"分数"和"得分率"两种量级，所以按有效数字舍入，
// 不能按固定小数位（两位小数会把得分率 0.548889 舍成 0.55）
eq("除不尽的平均数按有效数字舍入", C.trendStats([1, 2, 2]).avg, 1.66667);
eq("得分率那种量级不会被舍得太粗", C.trendStats([0.5, 0.6, 0.5466667]).avg, 0.548889);

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
group("七、文件编码自动识别（decodeBytes）");
/* ================================================================== */

// 用 TextEncoder 造一段标准 UTF-8
var utf8Bytes = new TextEncoder().encode("考试,语文\n月考一,100");
var d1 = C.decodeBytes(utf8Bytes);
eq("UTF-8 能被识别出来", d1.encoding, "utf-8");
eq("UTF-8 内容正确", d1.text, "考试,语文\n月考一,100");
eq("UTF-8 判定为成功", d1.ok, true);

// GBK 字节（用 Python 的 gbk 编码器取得真值，不是猜的）：
//   考试 = BF BC CA D4    语文 = D3 EF CE C4
// 关键点：这段字节不是合法 UTF-8，所以只能靠"UTF-8 解码失败"来判断
var gbkBytes = new Uint8Array([
  0xBF, 0xBC, 0xCA, 0xD4, 0x2C, 0xD3, 0xEF, 0xCE, 0xC4, 0x0A,
  0xD4, 0xC2, 0xBF, 0xBC, 0xD2, 0xBB, 0x2C, 0x31, 0x30, 0x30
]);
var d2 = C.decodeBytes(gbkBytes);
eq("GBK 能被识别出来", d2.encoding, "gbk");
eq("GBK 中文没有变成乱码", d2.text, "考试,语文\n月考一,100");
eq("GBK 判定为成功", d2.ok, true);

// GBK 的文章解析出来之后，应该能正常进入 parseTable
var gbkParsed = C.parseTable(C.decodeBytes(gbkBytes).text);
check("GBK 解码后的文本能直接被解析", gbkParsed.ok, gbkParsed.error);
eq("GBK 解码后的科目名正确", gbkParsed.headers, ["考试", "语文"]);
eq("GBK 解码后的分数正确", gbkParsed.rows[0][1], 100);

// UTF-8 BOM：Excel 另存为「CSV UTF-8」时会加这个
var bomBytes = new Uint8Array([0xEF, 0xBB, 0xBF].concat(Array.from(new TextEncoder().encode("考试,语文"))));
var d3 = C.decodeBytes(bomBytes);
eq("UTF-8 BOM 被识别", d3.encoding, "utf-8-bom");
eq("BOM 被去掉，没有混进表头", d3.text, "考试,语文");

// 边缘情况
eq("空输入不报错", C.decodeBytes(new Uint8Array([])).ok, true);
eq("null 不崩溃", C.decodeBytes(null).text, "");

/* ================================================================== */
group("八、排行榜数据（rankingItems）");
/* ================================================================== */

var rankFull = C.rankingItems(ds);   // ds 在第三节里定义过，带满分
eq("填了满分时标题是得分率", rankFull.title, "各科平均得分率");
eq("填了满分时标记为比率", rankFull.isRate, true);
eq("排行榜包含所有科目", rankFull.items.length, ds.subjectNames.length);
check("排行榜按从高到低排序",
  rankFull.items[0].value >= rankFull.items[rankFull.items.length - 1].value,
  rankFull.items.map(function (i) { return i.label + "=" + i.display; }).join(", "));
eq("第一名就是最强科目（数学）", rankFull.items[0].label, "数学");
check("得分率显示成百分比", /%$/.test(rankFull.items[0].display), rankFull.items[0].display);

var rankPlain = C.rankingItems(ds2);  // ds2 是没填满分的那个
eq("没填满分时标记为非比率", rankPlain.isRate, false);
check("没填满分时标题会提示仅供参考", rankPlain.title.indexOf("仅供参考") >= 0, rankPlain.title);

eq("传入无效数据时返回空列表", C.rankingItems(null).items.length, 0);

/* ================================================================== */
group("九、HTML 报告生成（buildReportHTML）");
/* ================================================================== */

var report = C.buildReportHTML(ds, { generatedAt: "2025-01-01 00:00" });

check("生成了完整的 HTML 文档", report.indexOf("<!doctype html>") === 0);
check("文档正常闭合", report.trim().lastIndexOf("</html>") === report.trim().length - 7);
check("包含自动诊断区块", report.indexOf("自动诊断") >= 0);
check("包含总分趋势图", report.indexOf("总分趋势") >= 0 && report.indexOf("<svg") >= 0);
check("包含各科趋势图", report.indexOf("各科趋势") >= 0);
check("包含排行榜", report.indexOf("各科平均得分率") >= 0);
check("包含原始数据表格", report.indexOf("<table>") >= 0);
check("包含生成时间", report.indexOf("2025-01-01 00:00") >= 0);
check("包含版本号", report.indexOf(C.VERSION) >= 0);
check("声明了 UTF-8 编码（否则中文乱码）", report.indexOf('charset="utf-8"') >= 0);
check("包含打印样式", report.indexOf("@media print") >= 0);

// 报告不能引用任何外部资源，否则拷到没网的电脑上就废了
check("没有任何外部资源引用",
  !/src=["']https?:/.test(report) && !/href=["']https?:/.test(report) && !/@import/.test(report),
  "报告必须是完全自包含的单文件");

// 诊断卡片里的中文标点和内容应该原样出现
check("诊断结论的文字进了报告", report.indexOf("总分趋势") >= 0 && report.indexOf("连续下滑") >= 0);

// 危险内容必须被转义
var dsXss = C.buildDataset(C.parseTable([
  "考试,<img src=x onerror=alert(1)>,数学",
  "月考一,100,90",
  "月考二,105,95"
].join("\n")));
var reportXss = C.buildReportHTML(dsXss);
check("科目名里的 HTML 标签被转义",
  reportXss.indexOf("<img src=x") < 0 && reportXss.indexOf("&lt;img") >= 0);

eq("传入无效数据返回空字符串", C.buildReportHTML(null), "");

/* ================================================================== */
group("十、成绩预测（predictNext）");
/* ================================================================== */

// 完美直线：往后一格就是 130
eq("完美直线上预测下一点 = 130", C.trendStats([100, 110, 120]).predictNext, 130);
eq("上升趋势预测值高于最后一次", C.trendStats([100, 110, 120]).predictNext > 120, true);

// 下降趋势
var pd = C.trendStats([120, 110, 100, 90]);
eq("下降趋势预测下一点 = 80", pd.predictNext, 80);

// 只有两个点时不该给预测：两点必在一条直线上，"预测"等于复读
eq("只有两个点时不预测", C.trendStats([100, 110]).predictNext, null);
eq("只有一个点时不预测", C.trendStats([100]).predictNext, null);
eq("空数组不预测", C.trendStats([]).predictNext, null);

// 预测用的是回归线，不是"最后一个值 + 上一次的变化量"。
// 最后一个是异常高分时，朴素外推会把这次的运气一起放大出去，
// 而回归线用的是全部数据，会克制很多。
var spike = C.trendStats([100, 100, 100, 100, 160]);
var naive = 160 + (160 - 100); // 朴素外推：最后值 + 上一次变化量 = 220
check("最后一个是异常高分时，回归预测比朴素外推克制",
  spike.predictNext < naive && spike.predictNext < 160,
  "predictNext=" + spike.predictNext + "，朴素外推会得到 " + naive);
check("但仍然反映了上升方向", spike.predictNext > 100, "predictNext=" + spike.predictNext);

// 缺考不影响预测（用有效点的下标做回归）
var withGap = C.trendStats([100, 110, null, 130, 140]);
check("缺考时仍能给出预测", withGap.predictNext != null, "predictNext=" + withGap.predictNext);

/* ================================================================== */
group("十一、班级平均行（classAvg）");
/* ================================================================== */

var tsvAvg = [
  "考试,语文,数学,物理",
  "满分,150,150,100",
  "班级平均,108,120,84",
  "月考一,102,118,88",
  "月考二,108,126,84",
  "月考三,105,135,79"
].join("\n");

var rAvg = C.parseTable(tsvAvg);
check("带班级平均行的表能解析", rAvg.ok, rAvg.error);
eq("班级平均没有被当成一次考试", rAvg.examCount, 3);
eq("班级平均的数值读对了", rAvg.classAvg, [108, 120, 84]);
eq("满分也照常读出来（两行互不干扰）", rAvg.fullMarks, [150, 150, 100]);

var dsAvg = C.buildDataset(rAvg);
eq("识别出有班级平均", dsAvg.hasClassAvg, true);
// 物理平均分 = (88+84+79)/3 = 83.67，班平均 84 -> 差 -0.33
eq("物理与班平均的差距算对了", dsAvg.columns[2].vsClass, -0.33);
// 数学平均分 = (118+126+135)/3 = 126.33，班平均 120 -> +6.33
eq("数学与班平均的差距算对了", dsAvg.columns[1].vsClass, 6.33);

// 顺序反过来也要能认
var reversed = C.parseTable([
  "考试,语文,数学",
  "班级平均,108,120",
  "满分,150,150",
  "月考一,102,118",
  "月考二,108,126"
].join("\n"));
check("班级平均写在满分前面也能认", reversed.ok && reversed.classAvg != null, reversed.error);
eq("反序时满分也读对了", reversed.fullMarks, [150, 150]);
eq("反序时没有多余考试行", reversed.examCount, 2);

// 没有这一行时不能凭空造出来
eq("没填班级平均时 hasClassAvg 为 false", ds.hasClassAvg, false);
eq("没填班级平均时差距为 null", ds.columns[0].vsClass, null);

// 缺一格就没法做完整对比，应当整体作废
var partial = C.parseTable([
  "考试,语文,数学",
  "班级平均,108,",
  "月考一,102,118",
  "月考二,108,126"
].join("\n"));
check("班级平均缺一格时不会给出半吊子的对比",
  C.buildDataset(partial).hasClassAvg === false);

/* ================================================================== */
group("十二、双向条形图（divergingBarChartSVG）");
/* ================================================================== */

var dv = C.divergingBarChartSVG({
  items: [
    { label: "数学", value: 21, display: "+21 分" },
    { label: "生物", value: 9, display: "+9 分" },
    { label: "物理", value: -20, display: "-20 分" }
  ],
  width: 800,
  labelWidth: 84
});

check("生成了 SVG", dv.indexOf("<svg") === 0 && dv.indexOf("</svg>") > 0);
check("正数用绿色、负数用红色", dv.indexOf("#059669") >= 0 && dv.indexOf("#dc2626") >= 0);
check("两个数值都被画出来", dv.indexOf("+21 分") >= 0 && dv.indexOf("-20 分") >= 0);
check("有中轴线", dv.indexOf('stroke="#cbd5e1"') >= 0);

// 回归测试：最长的负条曾经把数值标签顶到科目名上，两段文字叠成一团。
// 现在左右各留了 74px 的"数值栏"，所以负数数值标签的 x 永远不小于 labelWidth。
var labelW = 84, valueW = 74;
var valueLabels = [];
var reLabel = /<text x="([\d.]+)" y="[\d.]+" text-anchor="(start|end)" dominant-baseline="middle" font-size="12\.5"/g;
var mm;
while ((mm = reLabel.exec(dv))) valueLabels.push({ x: parseFloat(mm[1]), anchor: mm[2] });

eq("找到了 3 个数值标签", valueLabels.length, 3);
check("负数数值标签不会被挤进科目名区域",
  valueLabels.filter(function (l) { return l.anchor === "end"; })
             .every(function (l) { return l.x >= labelW; }),
  JSON.stringify(valueLabels));
check("所有数值标签都在画布内",
  valueLabels.every(function (l) { return l.x >= 0 && l.x <= 800; }),
  JSON.stringify(valueLabels));

check("空数据时给占位图而不是崩溃",
  C.divergingBarChartSVG({ items: [] }).indexOf("<svg") === 0);
check("全是 0 时不会除以零",
  C.divergingBarChartSVG({ items: [{ label: "语文", value: 0 }] }).indexOf("<svg") === 0);

/* ================================================================== */
group("十三、雷达图（radarChartSVG）");
/* ================================================================== */

var radar = C.radarChartSVG({
  axes: [
    { label: "语文", value: 0.73 },
    { label: "数学", value: 0.88 },
    { label: "英语", value: 0.78 },
    { label: "物理", value: 0.78 },
    { label: "化学", value: 0.78 },
    { label: "生物", value: 0.81 }
  ],
  max: 1,
  width: 640,
  height: 470
});

check("生成了 SVG", radar.indexOf("<svg") === 0 && radar.indexOf("</svg>") > 0);
eq("画了 4 圈网格 + 1 个数据多边形", (radar.match(/<polygon/g) || []).length, 5);
eq("每个科目一个圆点", (radar.match(/<circle/g) || []).length, 6);
["语文", "数学", "英语", "物理", "化学", "生物"].forEach(function (name) {
  check("雷达图上出现了科目名：" + name, radar.indexOf(name) >= 0);
});
check("百分比进了图里（88%）", radar.indexOf("88%") >= 0);
check("有半透明的填充", radar.indexOf("fill-opacity") >= 0);

// 少于 3 根轴连不成多边形，硬画只会是一团糟
check("只有 2 个科目时给提示而不是乱画",
  C.radarChartSVG({ axes: [{ label: "语文", value: 0.7 }, { label: "数学", value: 0.8 }] })
    .indexOf("至少需要 3 个科目") >= 0);
check("没有科目时给占位图", C.radarChartSVG({ axes: [] }).indexOf("<svg") === 0);

// 超过最大值的数据必须被夹住，否则会画到圈外面去
var over = C.radarChartSVG({
  axes: [
    { label: "A", value: 1.5 },
    { label: "B", value: 0.5 },
    { label: "C", value: 0.5 }
  ],
  max: 1, width: 400, height: 400
});
check("超过最大值的科目被夹在 100% 以内", over.indexOf("100%") >= 0 && over.indexOf("150%") < 0);

/* ================================================================== */
group("十四、排行榜数据（进步退步 / 班级差距）");
/* ================================================================== */

var changes = C.changeRankingItems(ds);
eq("每个科目一条", changes.length, ds.subjectNames.length);
check("按变化从大到小排序",
  changes[0].value >= changes[changes.length - 1].value,
  changes.map(function (c) { return c.label + "=" + c.display; }).join(", "));
eq("进步最大的是数学", changes[0].label, "数学");
check("正数带 + 号", changes[0].display.charAt(0) === "+", changes[0].display);
check("负数带 - 号", changes[changes.length - 1].display.charAt(0) === "-",
  changes[changes.length - 1].display);
eq("只有一次考试的科目不参与排名",
  C.changeRankingItems(C.buildDataset(C.parseTable("考试,语文\n月考一,100"))).length, 0);

var gaps2 = C.classGapItems(dsAvg);
eq("班级差距也是每科一条", gaps2.length, 3);
eq("领先班平均最多的是数学", gaps2[0].label, "数学");
// 语文平均 (102+108+105)/3 = 105，班平均 108 -> -3，是落后最多的一科；
// 物理是 83.67 对 84 -> 只差 -0.33
eq("落后班平均最多的是语文", gaps2[gaps2.length - 1].label, "语文");
eq("语文的差距是 -3 分", gaps2[gaps2.length - 1].value, -3);

// 没填班级平均时必须返回空数组，而不是报错
eq("没填班级平均时差距列表为空", C.classGapItems(ds).length, 0);

/* ================================================================== */
group("十五、主题配色（深色 / 浅色）");
/* ================================================================== */

check("两套主题是不同的对象", C.themeOf(true) !== C.themeOf(false));
check("深色主题底色不是白色", C.themeOf(true).bg !== "#ffffff", C.themeOf(true).bg);
check("浅色主题底色是白色", C.themeOf(false).bg, "#ffffff");
check("两套主题的键完全一致（少一个键就会有地方取到 undefined）",
  JSON.stringify(Object.keys(C.themeOf(true)).sort()) ===
  JSON.stringify(Object.keys(C.themeOf(false)).sort()));

var lineArgs = {
  labels: ["月考一", "月考二", "月考三"],
  series: [{ name: "数学", values: [100, 110, 120], color: "#2563eb" }],
  width: 600, height: 300
};
var lineLight = C.lineChartSVG(lineArgs);
var lineDark = C.lineChartSVG(Object.assign({}, lineArgs, { dark: true }));
check("折线图浅色版用白底", lineLight.indexOf("#ffffff") >= 0);
check("折线图深色版用深底", lineDark.indexOf("#131c2e") >= 0);
check("折线图深色版没有残留白底", lineDark.indexOf("#ffffff") < 0);
check("深浅两版确实不一样", lineLight !== lineDark);
check("深浅两版的折线颜色一致（只换底色，不换数据色）",
  lineLight.indexOf("#2563eb") >= 0 && lineDark.indexOf("#2563eb") >= 0);

check("条形图深色生效",
  C.barChartSVG({ items: [{ label: "数学", value: 0.8, display: "80%" }], dark: true })
    .indexOf("#131c2e") >= 0);
check("双向条形图深色生效",
  C.divergingBarChartSVG({ items: [{ label: "数学", value: 5 }], dark: true })
    .indexOf("#131c2e") >= 0);
check("雷达图深色生效",
  C.radarChartSVG({ axes: [{ label: "语", value: .7 }, { label: "数", value: .8 }, { label: "英", value: .6 }],
                    dark: true }).indexOf("#131c2e") >= 0);

// 没数据时的占位图也必须有底色，否则深色页面里会是一块白斑
var emptyDark = C.lineChartSVG({ labels: [], series: [], dark: true });
check("空数据的占位图在深色下也是深底", emptyDark.indexOf("#131c2e") >= 0,
  emptyDark.slice(0, 160));

// 默认（不传 dark）必须是浅色，不然命令行导出的图会突然变黑
check("不传 dark 时默认是浅色",
  C.lineChartSVG(lineArgs).indexOf("#ffffff") >= 0);

/* ================================================================== */
group("十六、单科详情（subjectSummary / subjectCards）");
/* ================================================================== */

// 和 sample-data.csv 完全一致的一份数据：
// 6 科、6 次考试、有满分也有班级平均，单科详情要的数字这里全都有
var dsBig2 = C.buildDataset(C.parseTable([
  "考试,语文,数学,英语,物理,化学,生物",
  "满分,150,150,150,100,100,100",
  "班级平均,108,120,115,84,74,82",
  "高二上月考1,102,118,112,88,72,75",
  "高二上期中,108,126,109,84,70,78",
  "高二上月考2,105,135,115,79,76,82",
  "高二下月考1,112,128,118,76,79,80",
  "高二下期中,110,142,121,72,83,86",
  "高二下月考2,116,139,124,68,88,84"
].join("\n")));

var phy = C.subjectSummary(dsBig2, "物理");
check("能取到物理的详情", !!phy);
eq("科目名正确", phy.name, "物理");
eq("颜色和数据集里一致", phy.color, dsBig2.columns[3].color);
eq("平均分正确", phy.avg, 77.8333);
eq("从第一次到最后一次的变化正确", phy.change, -20);
eq("最高分正确", phy.max, 88);
eq("最低分正确", phy.min, 68);
eq("考试次数正确", phy.examCount, 6);
eq("总分科目数正确", phy.subjectCount, 6);
check("给出了下次预测", phy.predictNext != null, "predictNext=" + phy.predictNext);
check("预测值低于最后一次（因为在下滑）", phy.predictNext < phy.last,
  phy.predictNext + " vs " + phy.last);
check("给出了与班平均的差距", phy.vsClass != null, "vsClass=" + phy.vsClass);
eq("与班平均的差距是 -6.17", phy.vsClass, -6.17);

// 排名：按得分率从高到低
eq("数学排名第 1", C.subjectSummary(dsBig2, "数学").rank, 1);
eq("语文排名第 6", C.subjectSummary(dsBig2, "语文").rank, 6);
eq("物理排名第 4", phy.rank, 4);
check("排名序号都在 1..科目数 之间",
  dsBig2.subjectNames.every(function (n) {
    var r = C.subjectSummary(dsBig2, n).rank;
    return r >= 1 && r <= dsBig2.subjectNames.length;
  }));

// 边界
eq("不存在的科目返回 null", C.subjectSummary(dsBig2, "体育"), null);
eq("空数据集返回 null", C.subjectSummary(null, "语文"), null);
eq("无效数据集返回 null", C.subjectSummary({ ok: false }, "语文"), null);
eq("没填满分时 avgRate 为 null", C.subjectSummary(ds2, ds2.subjectNames[0]).avgRate, null);

// 诊断筛选
var phyCards = C.subjectCards(dsBig2, "物理");
check("能筛出物理相关的诊断", phyCards.length > 0, "共 " + phyCards.length + " 条");
check("筛出来的每一条标题里都带科目名",
  phyCards.every(function (c) { return c.title.indexOf("物理") >= 0; }),
  phyCards.map(function (c) { return c.title; }).join(" / "));
check("筛出来了「物理 连续下滑」", phyCards.some(function (c) {
  return c.title.indexOf("连续下滑") >= 0;
}));
check("不会混进别的科目",
  !phyCards.some(function (c) { return c.title.indexOf("数学") >= 0; }),
  phyCards.map(function (c) { return c.title; }).join(" / "));
eq("不存在的科目筛出空数组", C.subjectCards(dsBig2, "体育").length, 0);

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
