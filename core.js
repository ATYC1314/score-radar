/*!
 * 成绩雷达 ScoreRadar —— 核心逻辑
 * v0.1.0
 *
 * 这个文件里【没有任何界面代码】，只做三件事：
 *   1. parseTable()     把粘贴进来的成绩表文本，变成程序能理解的数据
 *   2. trendStats()     算趋势：涨了多少、稳不稳、有没有连续下滑
 *      diagnose()        把算出来的数字翻译成人话
 *   3. lineChartSVG()   把数据画成折线图（SVG 图片）
 *      barChartSVG()     画条形图
 *
 * 为什么要把它们单独放一个文件？
 *   因为这些都是"纯函数"——给同样的输入，永远得到同样的输出，
 *   不依赖浏览器、不依赖网络。所以它们可以被自动测试（见 test.js）。
 *
 * 这个文件同时支持两种用法：
 *   - 浏览器：<script src="core.js"></script>  → 得到全局变量 ScoreCore
 *   - Node ： const ScoreCore = require('./core.js')
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(); // Node 环境
  } else {
    root.ScoreCore = factory(); // 浏览器环境
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "0.1.0";

  /* 及格线：平均得分率低于这个值就发出预警。0.6 = 60%，也就是通常说的"及格"。
     这是全项目唯一一个"绝对标准"——其他规则都在比哪科更强哪科更弱，
     只有它直接说"这科已经不及格了"。
     想改成 70%？把 0.6 改成 0.7，然后跑 node test.js 看看会发生什么。 */
  var PASS_RATE = 0.6;

  /* 给不同科目分配颜色。索引会循环使用，所以科目再多也不会没颜色。 */
  var PALETTE = [
    "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2",
    "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#b45309"
  ];

  /* SVG 里统一用这套字体，保证中文不会变成方块 */
  var FONT = ' font-family="system-ui,-apple-system,\'Segoe UI\',\'Microsoft YaHei\',\'PingFang SC\',sans-serif"';

  /* ================================================================== *
   * 一、最基础的小工具
   * ================================================================== */

  /** 四舍五入到 d 位小数。0.1+0.2 这种浮点误差也靠它收拾。 */
  function round(n, d) {
    var p = Math.pow(10, d == null ? 0 : d);
    return Math.round(n * p) / p;
  }

  /** 把全角数字（０１２…）转成半角，不然中文输入法打出来的数字会被当成乱码 */
  var FULLWIDTH = "０１２３４５６７８９";
  function normalizeDigits(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      var idx = FULLWIDTH.indexOf(ch);
      if (idx >= 0) out += String(idx);
      else if (ch === "．") out += ".";
      else if (ch === "－" || ch === "—" || ch === "−") out += "-";
      else out += ch;
    }
    return out;
  }

  /**
   * 把一格文本变成数字。
   * 返回 null 表示"这一格是空的"（缺考），返回 NaN 表示"这格填的不是数字"（真出错）。
   * 这两种情况必须分开——空着是正常的，填错字才需要提醒用户。
   */
  function toNumber(raw) {
    if (raw == null) return null;
    var s = normalizeDigits(String(raw)).replace(/[分\s%]/g, "").trim();
    if (s === "") return null;
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  /** 去掉格子两边的空格和引号，顺便清掉 Excel 复制出来时带的 BOM */
  function cleanCell(s) {
    var t = String(s == null ? "" : s).replace(/^\uFEFF/, "").trim();
    if (t.length >= 2) {
      var a = t.charAt(0), b = t.charAt(t.length - 1);
      if ((a === '"' && b === '"') || (a === "'" && b === "'")) t = t.slice(1, -1).trim();
    }
    return t;
  }

  /** 数字格式化。isFinite 判断是为了让 NaN / Infinity 显示成 "-" 而不是 "NaN" */
  function formatNumber(n, digits) {
    if (n == null || !isFinite(n)) return "-";
    var d = digits == null ? 1 : digits;
    return String(round(n, d));
  }

  /** 把 & < > " ' 转义，否则考试名里有个 < 就会把 SVG/HTML 弄坏 */
  function escapeXml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * 粗略估算一段文字有多宽（像素）。
   * 中文一个字差不多等于字号，英文数字差不多是字号的 0.58 倍。
   * 用来排图例和坐标轴标签，不需要很准，够用就行。
   */
  function estimateTextWidth(str, size) {
    var s = String(str == null ? "" : str), f = size || 12, w = 0;
    for (var i = 0; i < s.length; i++) {
      w += s.charCodeAt(i) > 0x2e80 ? f : f * 0.58;
    }
    return w;
  }

  /* ================================================================== *
   * 二、把文本变成表格
   * ================================================================== */

  /** 按分隔符把一行切开。分隔符可能是制表符、逗号、中文逗号，或者两个以上空格。 */
  function splitLine(line, delim) {
    if (delim === "SPACES") return line.trim().split(/\s{2,}/);
    return line.split(delim);
  }

  /**
   * 自动猜用户用的是哪种分隔符。
   * 思路：把每种分隔符都试一遍，看哪一种切出来的列数"最整齐"（每行列数最一致），
   * 在最整齐的前提下选列数最多的那种。这样从 Excel 复制的表格和手写的 CSV 都能认。
   */
  function detectDelimiter(lines) {
    var candidates = ["\t", ",", "，", "SPACES"];
    var best = { d: ",", score: -1 };
    candidates.forEach(function (d) {
      var counts = lines.map(function (l) { return splitLine(l, d).length; });

      // 统计每种列数出现了多少次，找出出现最多的那个（众数）
      var freq = {}, modeCount = 0, modeCols = 0;
      counts.forEach(function (c) {
        freq[c] = (freq[c] || 0) + 1;
        if (freq[c] > modeCount || (freq[c] === modeCount && c > modeCols)) {
          modeCount = freq[c];
          modeCols = c;
        }
      });

      if (modeCols < 2) return; // 只能切出 1 列，说明这个分隔符不对
      var score = modeCount * 1000 + modeCols;
      if (score > best.score) best = { d: d, score: score };
    });
    return best.d;
  }

  /** 判断某一行的第一格是不是"满分"标记行 */
  function isFullMarkLabel(label) {
    return /^(满分|满分值|各科满分|full\s*marks?|fullmarks?)$/i.test(String(label || "").trim());
  }

  /**
   * 解析成绩表。
   *
   * 支持的格式（分隔符可以是 Tab / 逗号 / 两个以上空格）：
   *
   *     考试,语文,数学,英语
   *     满分,150,150,150      ← 这一行可选，但强烈建议填！
   *     第一次月考,102,118,112
   *     期中考试,108,126,109
   *
   * 返回 { ok: true, headers, rows, fullMarks, warnings }
   * 或者 { ok: false, error, warnings }
   */
  function parseTable(text) {
    var warnings = [];

    if (typeof text !== "string" || text.trim() === "") {
      return { ok: false, error: "没有内容——请先把成绩表粘贴进来。", warnings: warnings };
    }

    // 统一换行符，去掉空行
    var lines = text.replace(/\r\n?/g, "\n").split("\n").filter(function (l) {
      return l.trim() !== "";
    });

    if (lines.length < 2) {
      return {
        ok: false,
        error: "至少需要「1 行表头 + 1 行成绩」，现在只读到 " + lines.length + " 行。",
        warnings: warnings
      };
    }

    var delim = detectDelimiter(lines);
    var grid = lines.map(function (l) { return splitLine(l, delim).map(cleanCell); });

    // 各行列数可能不一样，统一补齐到最宽的那一行
    var width = 0;
    grid.forEach(function (r) { if (r.length > width) width = r.length; });
    grid.forEach(function (r) { while (r.length < width) r.push(""); });

    if (width < 2) {
      return {
        ok: false,
        error: "只读到 1 列。至少需要「考试名 + 1 个科目」两列，请检查分隔符（推荐从 Excel 直接全选复制）。",
        warnings: warnings
      };
    }

    // —— 表头 ——
    var headers = grid[0].slice();
    if (!headers[0]) headers[0] = "考试";
    for (var h = 1; h < headers.length; h++) {
      if (!headers[h]) headers[h] = "科目" + h;
    }

    var body = grid.slice(1);

    // —— 找可选的"满分"行 ——
    var fullMarks = null;
    for (var i = 0; i < body.length; i++) {
      if (!isFullMarkLabel(body[i][0])) continue;
      var fm = [], bad = false;
      for (var c = 1; c < headers.length; c++) {
        var n = toNumber(body[i][c]);
        if (n == null || isNaN(n) || n <= 0) { fm.push(null); bad = true; }
        else fm.push(n);
      }
      if (bad) warnings.push("「满分」那一行有读不懂或不是正数的格子，已按“没有填满分”处理。");
      else fullMarks = fm;
      body.splice(i, 1); // 这一行不是一次考试，从成绩里拿掉
      break;
    }

    // —— 逐行读成绩 ——
    var rows = [];
    var errors = [];

    for (var r = 0; r < body.length; r++) {
      var row = body[r];
      var examName = row[0] || ("第" + (r + 1) + "次考试");
      var values = [examName];

      for (var c2 = 1; c2 < headers.length; c2++) {
        var num = toNumber(row[c2]);
        if (num !== null && isNaN(num)) {
          errors.push("《" + examName + "》的「" + headers[c2] + "」填的是“" + row[c2] + "”，不是数字");
          num = null;
        }
        values.push(num);
      }
      rows.push(values);
    }

    if (errors.length) {
      var shown = errors.slice(0, 5).join("\n· ");
      return {
        ok: false,
        error: "有 " + errors.length + " 个格子读不懂：\n· " + shown +
               (errors.length > 5 ? "\n· ……还有 " + (errors.length - 5) + " 处" : ""),
        warnings: warnings
      };
    }

    if (rows.length === 0) {
      return { ok: false, error: "除了表头，没有读到任何一次考试的成绩。", warnings: warnings };
    }

    if (rows.length < 2) {
      warnings.push("只有 1 次考试的数据，画不出趋势。建议至少录入 3 次。");
    }

    return {
      ok: true,
      headers: headers,
      rows: rows,
      fullMarks: fullMarks,
      examCount: rows.length,
      subjectCount: headers.length - 1,
      warnings: warnings
    };
  }

  /* ================================================================== *
   * 三、统计
   * ================================================================== */

  /**
   * 一条数列的趋势统计。values 里允许有 null（缺考）。
   * 返回的对象里：
   *   change        第一次到最后一次涨了几分（可以是负数）
   *   slope         线性回归斜率 = 平均每次考试涨几分（比 change 更能反映整体趋势）
   *   std           标准差（样本标准差），越大说明成绩越不稳定
   *   maxDeclineRun 最长"连续下滑"了几次
   *   maxDrop       从最高点最多回落了多少分
   */
  function trendStats(values) {
    var pts = [];
    for (var i = 0; i < (values || []).length; i++) {
      var v = values[i];
      if (v == null || !isFinite(v)) continue;
      pts.push({ i: i, v: v });
    }

    var n = pts.length;
    var res = {
      n: 0, first: null, last: null, firstIndex: null, lastIndex: null,
      change: null, slope: null, avg: null, std: null,
      min: null, max: null, peakIndex: null,
      maxDrop: 0, dropFrom: null, dropTo: null,
      maxDeclineRun: 0, declineRunEnd: -1
    };
    if (n === 0) return res;

    res.n = n;
    res.first = pts[0].v;
    res.last = pts[n - 1].v;
    res.firstIndex = pts[0].i;
    res.lastIndex = pts[n - 1].i;
    res.change = round(res.last - res.first, 4);

    // 平均数和标准差
    var sum = 0;
    pts.forEach(function (p) { sum += p.v; });
    res.avg = sum / n;

    var sq = 0;
    pts.forEach(function (p) { sq += (p.v - res.avg) * (p.v - res.avg); });
    res.std = n > 1 ? Math.sqrt(sq / (n - 1)) : 0;

    // 最小 / 最大 / 最高点位置
    // 注意：peakIndex 必须先初始化成第一个点。
    // 否则当"最高分就是第一次考试"时，循环里的 p.v > maxV 永远不成立，
    // 结果 peakIndex 会一直是 null —— 这正是测试帮我们抓到的 bug。
    var minV = pts[0].v, maxV = pts[0].v;
    res.peakIndex = pts[0].i;
    pts.forEach(function (p) {
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) { maxV = p.v; res.peakIndex = p.i; }
    });
    res.min = minV;
    res.max = maxV;

    // 线性回归斜率：用最小二乘法拟合一条直线
    if (n >= 2) {
      var mx = 0, my = 0;
      pts.forEach(function (p) { mx += p.i; my += p.v; });
      mx /= n; my /= n;

      var num = 0, den = 0;
      pts.forEach(function (p) {
        num += (p.i - mx) * (p.v - my);
        den += (p.i - mx) * (p.i - mx);
      });
      res.slope = den === 0 ? 0 : round(num / den, 4);

      // 残差标准差 = 去掉"整体趋势"之后，还剩下多少上下抖动。
      // 为什么不能用普通的 std 来判断"稳不稳定"？
      //   因为一路匀速下滑的科目，它的 std 也很大，
      //   但那是"趋势"，不是"抖动"。用 std 会把"一直在退步"误判成"忽高忽低"。
      //   残差 std 则只关心相对趋势线的偏离，这才是真正的"不稳定"。
      if (den > 0) {
        var intercept = my - res.slope * mx;
        var ss = 0;
        pts.forEach(function (p) {
          var err = p.v - (intercept + res.slope * p.i);
          ss += err * err;
        });
        res.residStd = round(Math.sqrt(ss / (n - 1)), 6);
      } else {
        res.residStd = 0;
      }
    } else {
      res.slope = 0;
      res.residStd = 0;
    }

    // 从历史最高点回落的最大幅度
    var runningMax = pts[0].v, runningMaxIndex = pts[0].i;
    for (var k = 1; k < n; k++) {
      var p = pts[k];
      if (p.v > runningMax) { runningMax = p.v; runningMaxIndex = p.i; }
      var drop = runningMax - p.v;
      if (drop > res.maxDrop) {
        res.maxDrop = round(drop, 4);
        res.dropFrom = runningMaxIndex;
        res.dropTo = p.i;
      }
    }

    // 最长连续下滑。
    // 必须"相邻两次考试"都有效才算连续——中间缺考就断开了。
    var run = 0;
    for (var j = 1; j < n; j++) {
      var prev = pts[j - 1], cur = pts[j];
      if (cur.i === prev.i + 1 && cur.v < prev.v) run += 1;
      else run = 0;
      if (run > res.maxDeclineRun) {
        res.maxDeclineRun = run;
        res.declineRunEnd = cur.i;
      }
    }

    return res;
  }

  /* ================================================================== *
   * 四、组装成数据集
   * ================================================================== */

  /**
   * 把 parseTable 的结果整理成"以科目为单位"的结构，方便后面画图和诊断。
   *
   * 关于「满分」：语文 150、物理 100，直接比原始平均分是不公平的。
   * 所以如果用户填了满分，我们会额外算一个"得分率"（得分 ÷ 满分），
   * 跨科目比较一律用得分率。
   */
  function buildDataset(parsed) {
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || "解析失败" };
    }

    var subjectNames = parsed.headers.slice(1);
    var examNames = parsed.rows.map(function (r) { return r[0]; });

    var hasFullMarks = !!(parsed.fullMarks && parsed.fullMarks.every(function (f) {
      return f != null && f > 0;
    }));

    var columns = subjectNames.map(function (name, si) {
      var values = parsed.rows.map(function (r) { return r[si + 1]; });
      var col = {
        name: name,
        index: si,
        color: PALETTE[si % PALETTE.length],
        values: values,
        full: parsed.fullMarks ? parsed.fullMarks[si] : null
      };
      col.stats = trendStats(values);

      if (hasFullMarks && col.full > 0) {
        col.rates = values.map(function (v) { return v == null ? null : v / col.full; });
        col.rateStats = trendStats(col.rates);
      } else {
        col.rates = null;
        col.rateStats = null;
      }
      return col;
    });

    // 每次考试的总分（把有成绩的科目加起来，缺考的科目不加）
    var totals = parsed.rows.map(function (r) {
      var s = 0, has = false;
      for (var si = 0; si < subjectNames.length; si++) {
        var v = r[si + 1];
        if (v != null && isFinite(v)) { s += v; has = true; }
      }
      return has ? round(s, 2) : null;
    });

    return {
      ok: true,
      headers: parsed.headers,
      examNames: examNames,
      subjectNames: subjectNames,
      columns: columns,
      totals: totals,
      totalStats: trendStats(totals),
      hasFullMarks: hasFullMarks,
      fullMarks: parsed.fullMarks || null,
      warnings: parsed.warnings || []
    };
  }

  /* ================================================================== *
   * 五、把数字翻译成人话
   * ================================================================== */

  /**
   * 自动诊断，返回一组结论卡片：
   *   [{ level: "good" | "warn" | "info", title, text }, ...]
   * level 决定界面上的颜色：good 绿、warn 橙、info 蓝。
   */
  function diagnose(ds) {
    var out = [];
    if (!ds || !ds.ok) return out;
    var names = ds.examNames;

    /* 1. 总分整体趋势 */
    var t = ds.totalStats;
    if (t.n >= 2) {
      var dir = t.change > 0 ? "上升" : (t.change < 0 ? "下降" : "持平");
      var text = "从《" + names[t.firstIndex] + "》到《" + names[t.lastIndex] + "》，总分" + dir +
                 " " + formatNumber(Math.abs(t.change), 1) + " 分（" +
                 formatNumber(t.first, 1) + " → " + formatNumber(t.last, 1) + "）。";
      if (t.n >= 3 && t.slope != null) {
        text += "平均每次考试" + (t.slope >= 0 ? "上升" : "下降") +
                "约 " + formatNumber(Math.abs(t.slope), 1) + " 分。";
      }
      out.push({
        level: t.change > 0 ? "good" : (t.change < 0 ? "warn" : "info"),
        title: "总分趋势",
        text: text
      });
    } else {
      out.push({ level: "info", title: "总分趋势", text: "只有 " + t.n + " 次考试有成绩，还看不出趋势。" });
    }

    /* 2. 单科连续下滑——这是最该被看见的信号 */
    ds.columns.forEach(function (col) {
      var s = col.stats;
      if (s.maxDeclineRun < 2) return;
      var end = s.declineRunEnd;
      var start = end - s.maxDeclineRun;
      out.push({
        level: "warn",
        title: col.name + " 连续下滑 " + s.maxDeclineRun + " 次",
        text: "从《" + names[start] + "》的 " + formatNumber(col.values[start], 1) +
              " 分，一路掉到《" + names[end] + "》的 " + formatNumber(col.values[end], 1) +
              " 分，共 " + formatNumber(col.values[start] - col.values[end], 1) +
              " 分。连续下滑通常不是「没学好」，而是某个具体章节卡住了，建议优先排查。"
      });
    });

    /* 3. 进步最大的科目 */
    var best = null;
    ds.columns.forEach(function (col) {
      if (col.stats.n < 2) return;
      if (best === null || col.stats.change > best.stats.change) best = col;
    });
    if (best && best.stats.change > 0) {
      out.push({
        level: "good",
        title: best.name + " 进步最大",
        text: "上升 " + formatNumber(best.stats.change, 1) + " 分（" +
              formatNumber(best.stats.first, 1) + " → " + formatNumber(best.stats.last, 1) +
              "），说明这套学习方法对这科是有效的，可以复制到别的科目。"
      });
    }

    /* 4. 稳定性分析：用的是"残差标准差"，不是普通标准差。
          一路匀速下滑的科目残差接近 0，所以不会被误判成"忽高忽低"。 */
    if (ds.hasFullMarks) {
      var wild = null;
      ds.columns.forEach(function (col) {
        if (!col.rateStats || col.rateStats.n < 3) return;
        if (wild === null || col.rateStats.residStd > wild.rateStats.residStd) wild = col;
      });
      if (wild && wild.rateStats.residStd > 0.02) {
        out.push({
          level: "warn",
          title: wild.name + " 最不稳定",
          text: "去掉整体趋势后，得分率上下抖动最大（波动 " +
                formatNumber(wild.rateStats.residStd * 100, 1) +
                " 个百分点，最好 " + formatNumber(wild.rateStats.max * 100, 0) +
                "%，最差 " + formatNumber(wild.rateStats.min * 100, 0) +
                "%）。忽高忽低往往比一直低分更值得先解决——它说明你会做，只是不稳。"
        });
      }
    } else {
      out.push({
        level: "info",
        title: "加上「满分」才能跨科对比",
        text: "语文 150 分、物理 100 分，直接比原始平均分是不公平的。在表头下面加一行「满分」" +
              "（例如：满分,150,150,150,100,100,100），就能解锁得分率对比、最强/最弱科目排名和稳定性分析。"
      });
    }

    /* 5. 最强 / 最弱科目 */
    var ranked = ds.columns
      .filter(function (c) { return c.stats.n > 0; })
      .map(function (c) {
        var metric = (ds.hasFullMarks && c.rateStats) ? c.rateStats.avg : c.stats.avg;
        return { col: c, metric: metric };
      })
      .sort(function (a, b) { return b.metric - a.metric; });

    if (ranked.length >= 2) {
      var top = ranked[0], bottom = ranked[ranked.length - 1];
      if (ds.hasFullMarks) {
        out.push({
          level: "good",
          title: "最强科目：" + top.col.name,
          text: "平均得分率 " + formatNumber(top.metric * 100, 1) + "%，是全科里最稳的一块。"
        });
        out.push({
          level: "warn",
          title: "最弱科目：" + bottom.col.name,
          text: "平均得分率只有 " + formatNumber(bottom.metric * 100, 1) + "%，比最强的 " +
                top.col.name + " 低 " + formatNumber((top.metric - bottom.metric) * 100, 1) +
                " 个百分点——这是你提分空间最大的地方。"
        });
      } else {
        out.push({
          level: "info",
          title: "原始平均分最高：" + top.col.name + "（" + formatNumber(top.metric, 1) + " 分）",
          text: "注意：因为没有填满分，这里比的是原始平均分，满分不同的科目之间不能直接比较。"
        });
      }
    }

    /* 6. 及格线预警 —— 唯一一条"绝对标准"的判断。
          上面那些规则比的都是"哪科相对更强/更弱"，
          但一科完全可能"在全班里不算最差，绝对水平却已经掉到及格线以下"。
          这两种问题不一样，所以分开报。 */
    if (ds.hasFullMarks) {
      ds.columns.forEach(function (col) {
        if (!col.rateStats || col.rateStats.n === 0) return;
        if (col.rateStats.avg >= PASS_RATE) return;

        var gapPoints = (PASS_RATE - col.rateStats.avg) * 100;
        var text = "平均得分率只有 " + formatNumber(col.rateStats.avg * 100, 1) + "%，" +
                   "距离及格线（" + formatNumber(PASS_RATE * 100, 0) + "%）还差 " +
                   formatNumber(gapPoints, 1) + " 个百分点。";

        // 知道满分的话，把"差几个百分点"换算成"平均少拿多少分"——这个更好懂
        if (col.full > 0) {
          text += "满分 " + formatNumber(col.full, 0) + " 分，相当于每次平均少拿 " +
                  formatNumber(gapPoints / 100 * col.full, 1) + " 分。";
        }
        text += "先别急着刷题，把最近三次卷子的错题按知识点归类，通常能立刻找到突破口。";

        out.push({
          level: "warn",
          title: col.name + " 已低于及格线",
          text: text
        });
      });
    }

    /* 7. 数据质量提醒 */
    if (ds.examNames.length < 3) {
      out.push({
        level: "info",
        title: "数据还太少",
        text: "目前只有 " + ds.examNames.length + " 次考试。3 次才能看出方向，5 次以上结论才比较可靠，" +
              "所以这条趋势先别太当真。"
      });
    }

    var missing = 0;
    ds.columns.forEach(function (c) {
      c.values.forEach(function (v) { if (v == null) missing++; });
    });
    if (missing > 0) {
      out.push({
        level: "info",
        title: "有 " + missing + " 个空格（缺考）",
        text: "这些格子已自动跳过，不会被当成 0 分，也不会把折线连起来。"
      });
    }

    return out;
  }

  /* ================================================================== *
   * 六、画图（直接生成 SVG，不依赖任何第三方库）
   * ================================================================== */

  /** 把范围切成"好看"的刻度，比如 0/20/40/60/80/100 */
  function niceNum(range, roundTo) {
    if (!(range > 0)) range = 1;
    var exp = Math.floor(Math.log(range) / Math.LN10);
    var f = range / Math.pow(10, exp);
    var nf;
    if (roundTo) nf = f < 1.5 ? 1 : (f < 3 ? 2 : (f < 7 ? 5 : 10));
    else nf = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 5 ? 5 : 10));
    return nf * Math.pow(10, exp);
  }

  function niceScale(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
    if (min === max) { min -= 1; max += 1; }
    var step = niceNum(niceNum(max - min, false) / Math.max(1, count - 1), true);
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(round(v, 6));
    return { min: lo, max: hi, step: step, ticks: ticks };
  }

  /**
   * 折线图。
   * opt = {
   *   labels:  ["第一次月考", "期中", ...],
   *   series:  [{ name: "数学", values: [118, 126, 135], color: "#2563eb" }, ...],
   *   width, height, title,
   *   showValues: true 时会在每个点上标数字,
   *   formatY: 自定义 Y 轴刻度格式（比如得分率用百分号）
   * }
   */
  function lineChartSVG(opt) {
    var o = opt || {};
    var labels = o.labels || [];
    var n = labels.length;
    var width = o.width || 760;
    var height = o.height || 380;
    var series = (o.series || []).filter(function (s) {
      return s && s.values && s.values.length;
    });

    var all = [];
    series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (v != null && isFinite(v)) all.push(v);
      });
    });

    if (!all.length || n === 0) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
             '" width="100%" role="img"><text x="' + (width / 2) + '" y="' + (height / 2) +
             '" text-anchor="middle" font-size="14" fill="#94a3b8"' + FONT + '>没有可画的数据</text></svg>';
    }

    var padLeft = 58, padRight = 28;

    // 先算图例要占几行，再决定顶部留多少空间，避免图例压住图形
    var legend = [];
    var lx = padLeft, ly = 16, rowH = 18, legendRows = 1;
    var availW = width - padLeft - padRight;
    series.forEach(function (s) {
      var w = estimateTextWidth(s.name, 12) + 26;
      if (lx + w > width - padRight && lx > padLeft) { lx = padLeft; ly += rowH; legendRows++; }
      legend.push({ x: lx, y: ly, w: w, name: s.name, color: s.color || PALETTE[0] });
      lx += w;
    });

    var pad = { top: 16 + legendRows * rowH + 8, right: padRight, bottom: 68, left: padLeft };
    var plotW = Math.max(10, width - pad.left - pad.right);
    var plotH = Math.max(10, height - pad.top - pad.bottom);

    var scale = niceScale(Math.min.apply(null, all), Math.max.apply(null, all), 5);
    var tickDigits = scale.step >= 1 ? 0 : (scale.step >= 0.1 ? 1 : 2);
    var formatY = o.formatY || function (v) { return formatNumber(v, tickDigits); };

    function xFor(i) { return n <= 1 ? pad.left + plotW / 2 : pad.left + plotW * i / (n - 1); }
    function yFor(v) { return pad.top + plotH * (1 - (v - scale.min) / (scale.max - scale.min)); }

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
             '" width="100%" height="auto" role="img" aria-label="' +
             escapeXml(o.title || "成绩趋势图") + '">');
    out.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="12" fill="#ffffff"/>');

    // 横向网格线 + Y 轴刻度文字
    scale.ticks.forEach(function (v) {
      var y = round(yFor(v), 2);
      out.push('<line x1="' + pad.left + '" y1="' + y + '" x2="' + (pad.left + plotW) +
               '" y2="' + y + '" stroke="#eef2f7" stroke-width="1"/>');
      out.push('<text x="' + (pad.left - 10) + '" y="' + y +
               '" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#94a3b8"' +
               FONT + '>' + escapeXml(formatY(v)) + '</text>');
    });

    // X 轴
    var axisY = round(pad.top + plotH, 2);
    out.push('<line x1="' + pad.left + '" y1="' + axisY + '" x2="' + (pad.left + plotW) +
             '" y2="' + axisY + '" stroke="#cbd5e1" stroke-width="1.5"/>');

    // X 轴标签：考试名太长或者考试次数太多就斜过来写
    var rotate = n > 6 || labels.some(function (l) { return String(l).length > 4; });
    labels.forEach(function (lab, i) {
      var x = round(xFor(i), 2);
      var y = axisY + 18;
      var anchor = rotate ? "end" : "middle";
      var transform = rotate ? ' transform="rotate(-35 ' + x + ' ' + y + ')"' : '';
      out.push('<text x="' + x + '" y="' + y + '" text-anchor="' + anchor +
               '" font-size="11" fill="#64748b"' + transform + FONT + '>' + escapeXml(lab) + '</text>');
    });

    // 每条折线
    series.forEach(function (s) {
      var color = s.color || PALETTE[0];

      // 中间缺考时要把折线断开，不能连成一条假的直线
      var segs = [], seg = [];
      for (var i = 0; i < n; i++) {
        var v = s.values[i];
        if (v == null || !isFinite(v)) {
          if (seg.length) { segs.push(seg); seg = []; }
        } else {
          seg.push({ x: xFor(i), y: yFor(v) });
        }
      }
      if (seg.length) segs.push(seg);

      segs.forEach(function (g) {
        if (g.length < 2) return;
        out.push('<polyline fill="none" stroke="' + color +
                 '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' +
                 g.map(function (p) { return round(p.x, 2) + "," + round(p.y, 2); }).join(" ") + '"/>');
      });

      // 数据点（鼠标悬停能看到具体分数）
      for (var j = 0; j < n; j++) {
        var vv = s.values[j];
        if (vv == null || !isFinite(vv)) continue;
        var cx = round(xFor(j), 2), cy = round(yFor(vv), 2);
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#ffffff" stroke="' + color +
                 '" stroke-width="2.5"><title>' +
                 escapeXml(s.name + " · " + labels[j] + "：" + formatNumber(vv, 1)) +
                 '</title></circle>');
        if (o.showValues) {
          out.push('<text x="' + cx + '" y="' + (cy - 10) +
                   '" text-anchor="middle" font-size="10.5" font-weight="600" fill="' + color +
                   '"' + FONT + '>' + escapeXml(formatNumber(vv, 1)) + '</text>');
        }
      }
    });

    // 图例
    legend.forEach(function (item) {
      out.push('<rect x="' + round(item.x, 2) + '" y="' + (item.y - 9) +
               '" width="11" height="11" rx="2.5" fill="' + item.color + '"/>');
      out.push('<text x="' + round(item.x + 16, 2) + '" y="' + (item.y + 0.5) +
               '" font-size="12" fill="#334155"' + FONT + '>' + escapeXml(item.name) + '</text>');
    });

    out.push("</svg>");
    return out.join("");
  }

  /**
   * 横向条形图，适合比较"各科平均得分率"这种一眼看高低的场景。
   * opt = { items: [{ label, value, display, color }], width, max, labelWidth }
   */
  function barChartSVG(opt) {
    var o = opt || {};
    var items = (o.items || []).filter(function (it) {
      return it && it.value != null && isFinite(it.value);
    });
    var width = o.width || 760;
    var rowH = o.rowH || 26;
    var gap = o.gap == null ? 10 : o.gap;
    var padLeft = o.labelWidth || 78;
    var padRight = 76;
    var padTop = 14, padBottom = 14;

    if (!items.length) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' 80" width="100%" role="img"></svg>';
    }

    var height = o.height || (padTop + padBottom + items.length * (rowH + gap) - gap);
    var plotW = Math.max(10, width - padLeft - padRight);
    var max = o.max != null ? o.max : Math.max.apply(null, items.map(function (it) { return it.value; }));
    if (!(max > 0)) max = 1;

    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height +
             '" width="100%" height="auto" role="img">');
    out.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="12" fill="#ffffff"/>');

    items.forEach(function (it, i) {
      var y = padTop + i * (rowH + gap);
      var barW = Math.max(2, plotW * (it.value / max));
      var color = it.color || PALETTE[i % PALETTE.length];

      out.push('<text x="' + (padLeft - 10) + '" y="' + (y + rowH / 2) +
               '" text-anchor="end" dominant-baseline="middle" font-size="12.5" fill="#334155"' +
               FONT + '>' + escapeXml(it.label) + '</text>');

      out.push('<rect x="' + padLeft + '" y="' + y + '" width="' + round(plotW, 2) + '" height="' + rowH +
               '" rx="6" fill="#f1f5f9"/>');
      out.push('<rect x="' + padLeft + '" y="' + y + '" width="' + round(barW, 2) + '" height="' + rowH +
               '" rx="6" fill="' + color + '" opacity="0.9"/>');

      out.push('<text x="' + round(padLeft + barW + 8, 2) + '" y="' + (y + rowH / 2) +
               '" dominant-baseline="middle" font-size="12" font-weight="600" fill="' + color +
               '"' + FONT + '>' + escapeXml(it.display != null ? it.display : formatNumber(it.value, 1)) +
               '</text>');
    });

    out.push("</svg>");
    return out.join("");
  }

  /* ================================================================== */

  return {
    VERSION: VERSION,
    PALETTE: PALETTE,
    parseTable: parseTable,
    buildDataset: buildDataset,
    trendStats: trendStats,
    diagnose: diagnose,
    lineChartSVG: lineChartSVG,
    barChartSVG: barChartSVG,
    formatNumber: formatNumber,
    escapeXml: escapeXml,
    toNumber: toNumber,
    niceScale: niceScale,
    estimateTextWidth: estimateTextWidth
  };
});
