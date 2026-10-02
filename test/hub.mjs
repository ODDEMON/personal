/*
  总台 · 归档协议 无头冒烟测试
  ---------------------------------------------------------------------------
  目的不是校验像素，而是抓：编号派生的可逆性、下发参数是否真的进了链接、
  回收回执是否真的入档、三份齐时总判是否出现、以及自指条款有没有被写丢。
  运行（先在仓库根目录执行一次 npm install）：npm run test:hub
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INDEX = path.join(ROOT, "index.html");
const HTML = fs.readFileSync(INDEX, "utf8");

let pass = 0, fail = 0;
const errors = [];
const ok = (n, c, x = "") => {
  if (c) { pass++; console.log("  PASS  " + n + (x ? "  → " + x : "")); }
  else { fail++; console.log("  FAIL  " + n + (x ? "  → " + x : "")); errors.push(n); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 每个用例一个独立 JSDOM：localStorage 不跨实例，互不污染 */
function open(hash = "") {
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    url: "http://localhost/" + hash,
  });
  const errs = [];
  dom.window.addEventListener("error", e => errs.push("onerror: " + e.message));
  dom.window.onerror = m => errs.push("onerror: " + m);
  return { dom, w: dom.window, errs };
}

/* ---- 1. 冷启动 ---- */
{
  const { w, errs } = open();
  await sleep(120);
  const caseTxt = w.document.getElementById("case").textContent;
  const seedTxt = w.document.getElementById("seed").textContent;

  ok("页面载入无错误", errs.length === 0, errs[0] || "");
  ok("编号格式正确", /^OD-[0-9A-Z]+$/.test(caseTxt), caseTxt);
  ok("种子是数字", /^\d+$/.test(seedTxt), seedTxt);

  // 编号必须由种子派生：OD-<seed 的 36 进制>，反过来能解回同一个种子
  const back = parseInt(caseTxt.replace("OD-", ""), 36);
  ok("编号与种子同源且可逆", back === parseInt(seedTxt, 10), caseTxt + " ↔ " + seedTxt);

  const links = [...w.document.querySelectorAll("a.entry")];
  ok("三个入口已渲染", links.length === 3, String(links.length));
  ok("入口链接都带上编号与种子",
    links.length === 3 && links.every(a =>
      a.getAttribute("href").includes("case=" + caseTxt) &&
      a.getAttribute("href").includes("seed=" + seedTxt)));

  ok("空卷宗有明确说法",
    /卷宗空着/.test(w.document.getElementById("ledger").textContent));
  ok("空卷宗不出总判",
    !w.document.getElementById("verdict").classList.contains("on"));

  /* 重新编号：编号必变，卷宗必清 */
  const before = caseTxt;
  w.document.getElementById("reseed").click();
  await sleep(60);
  const after = w.document.getElementById("case").textContent;
  ok("重新编号会换号", after !== before, before + " → " + after);
  ok("重新编号后仍是合法编号", /^OD-[0-9A-Z]+$/.test(after), after);

  ok("冷启动全程无运行时错误", errs.length === 0, errs[0] || "");
}

/* ---- 2. 回收回执 ---- */
const REC_G = "G~OD-ABC~偏差 3 · 否定度 50%";
{
  const { w, errs } = open("#rec=" + encodeURIComponent(REC_G));
  await sleep(120);

  ok("回执入档", /偏差 3/.test(w.document.getElementById("ledger").textContent));
  ok("编号以回执为准（旧的让位）",
    w.document.getElementById("case").textContent === "OD-ABC",
    w.document.getElementById("case").textContent);
  ok("对应作品标记为已归档",
    /已归档/.test(w.document.querySelector("a.entry").textContent));
  ok("回执只用一次（hash 已清）",
    !/#rec=/.test(w.location.hash), w.location.hash || "(空)");

  const v = w.document.getElementById("verdict");
  ok("一份回执只说卷宗不齐", v.classList.contains("on") && /卷宗不齐/.test(v.textContent));
  ok("不齐时不给总判", !/第六门/.test(v.textContent));
  ok("回收全程无运行时错误", errs.length === 0, errs[0] || "");
}

/* ---- 3. 三份齐：总判与自指 ---- */
{
  const { w, errs } = open("#rec=" + encodeURIComponent("G~OD-ABC~偏差 3 · 否定度 50%"));
  await sleep(80);
  const led1 = w.document.getElementById("ledger").textContent;
  ok("第一份已入档", /偏差 3/.test(led1), led1.slice(0, 50));

  // 后两份在页面开着时抵达：hashchange 必须也能收档
  w.location.hash = "#rec=" + encodeURIComponent("P~OD-ABC~7 步 · 否定度 71%");
  await sleep(120);
  w.location.hash = "#rec=" + encodeURIComponent("V~OD-ABC~全称性 0 · 完整性 0%");
  await sleep(120);

  const led = w.document.getElementById("ledger");
  ok("三份全部入档", led.querySelectorAll("li").length === 3,
    String(led.querySelectorAll("li").length));

  const v = w.document.getElementById("verdict");
  ok("三份齐才出总判", /第六门/.test(v.textContent), v.textContent.slice(0, 40));
  ok("总判带自指条款", /自指条款/.test(v.textContent));
  ok("总判停在残留上，不落款为结论", /否定之后的残留/.test(v.textContent)
    && !/这就是结论/.test(v.textContent), v.textContent.slice(0, 40));

  /* 清空：卷宗散，总判收 */
  w.document.getElementById("clear").click();
  await sleep(60);
  ok("清空后回到空卷宗", /卷宗空着/.test(w.document.getElementById("ledger").textContent));
  ok("清空后总判收起",
    !w.document.getElementById("verdict").classList.contains("on"));

  ok("收档全程无运行时错误", errs.length === 0, errs[0] || "");
}
/* ---- 4. 协议之外：介绍照给，但不发号、不收档 ---- */
{
  const { w, errs } = open();
  await sleep(120);
  const out = w.document.getElementById("outside");
  const txt = out ? out.textContent : "";

  ok("协议之外区块存在", !!out);
  ok("介绍了 oddemon-typo", /ODDEMON 艺术字生成器/.test(txt));
  ok("标为不在协议内", /不在协议内/.test(txt));

  const hrefs = out ? [...out.querySelectorAll("a")].map(a => a.getAttribute("href")) : [];
  ok("给出 README 引用", hrefs.some(h => h === "oddemon-typo/README.md"), hrefs.join(" "));
  ok("给出本地服务地址", hrefs.some(h => h.indexOf("127.0.0.1:7860") >= 0));

  // 关键：它不能被当成第四份证明——否则「三份齐」的含义会被悄悄改写
  ok("不进作品表（拿不到编号）", w.document.querySelectorAll("a.entry").length === 3,
    String(w.document.querySelectorAll("a.entry").length));
  ok("协议之外无运行时错误", errs.length === 0, errs[0] || "");
}
void REC_G;

/* ---- 5. 声轨 · 形式层：在，但不占协议的位置 ---- */
{
  const { w, errs } = open();
  await sleep(120);
  const doc = w.document;
  const hub = doc.getElementById("bgm-hub");

  ok("声轨区块存在", !!hub);
  ok("声轨挂点不在作品表里", doc.querySelectorAll("a.entry").length === 3,
    String(doc.querySelectorAll("a.entry").length));
  const hint = hub ? (hub.parentElement.textContent || "") : "";
  ok("写明起于静默位", /起于静默位/.test(hint));
  ok("写明落在判据与证明之外", /判据之外/.test(hint) && /行间也照不到它/.test(hint));
  ok("写明它与否定性事物分处两层", /分处两层/.test(hint));
  // 配对方向写反过一次，这里把它钉死：强→否定，弱→肯定
  ok("写明配对：弱→肯定", /弱→肯定/.test(hint));
  ok("写明配对：强→否定", /强→否定/.test(hint));
  ok("写明读反的危险", /当心读反/.test(hint));
  const href = doc.querySelector('a[href="bgm/声轨层.md"]');
  ok("给出声轨层说明的链接", !!href);

  ok("声轨区块无运行时错误", errs.length === 0, errs[0] || "");
}

/* ---- 6. 语气守卫：字面否定词不许挤在文案里 ----
   ---------------------------------------------------------------------------
   这些作品讲的是否定，所以很容易把「无 / 没有 / 不能 / 无法」撒得满屏都是。
   字面否定一多，幻灭感就变成标语气——读的人被反复告知该有什么感受，
   于是真的什么感受也没有了。规矩：把否定交给结构去演，字面让位。

   单靠自觉守不住，所以钉成断言：
   扫「界面与证明里真正会被读到的中文串」，字面否定词必须为零。
   算子（ANTI / NEGOPS / QUANT 等）替身在这条规则之外——
   那里「有→无」「能→不能」是正在执行的动作本身，剥掉它等于削掉否定算子。 */
{
  const TARGETS = [
    ["总台", "index.html"],
    ["羊肠小道", "game/index.html"],
    ["验算器", "proof/index.html"],
    ["来访者协议", "the-visitor-protocol/index.html"],
    ["来访者协议 · 核心", "the-visitor-protocol/protocol.js"]
  ];
  const BANNED = ["没有", "不能", "无法", "禁止", "不许", "不必", "不再",
                  "绝不", "毫无", "缺乏", "未", "无"];
  /* 例外只有一条：作者落款。它是签名，不是陈述，四处证明材料靠它互相认出来。 */
  const ALLOWED = ["我不会对此进行完善"];
  const TABLES = ["ANTI", "ANTI_EN", "NEGOPS", "WRAP", "TIME", "QUANT", "VALUES",
                  "REFUSAL", "ENDINGS", "FILL", "GLYPH", "PRON", "DECOR", "LEVELS"];

  /* 按括号配平摘掉算子表：表里每一行都在替否定算子干活，与文案无关 */
  function dropTables(src) {
    let out = src;
    for (const name of TABLES) {
      const re = new RegExp("\\b" + name + "\\s*=\\s*\\[", "g");
      let m;
      while ((m = re.exec(src))) {
        const start = m.index + m[0].length - 1;
        let depth = 0, i = start;
        for (; i < src.length; i++) {
          if (src[i] === "[") depth++;
          else if (src[i] === "]") { depth--; if (!depth) break; }
        }
        out = out.split(src.slice(m.index, i + 1)).join("[表]");
      }
    }
    return out;
  }

  /* 取所有含中文的字符串字面量 + 剥掉标签后的正文（署名mvc除外） */
  function poolOf(file) {
    let s = fs.readFileSync(path.join(ROOT, file), "utf8");
    s = s.replace(/<style[\s\S]*?<\/style>/g, " ")
         .replace(/<!--[\s\S]*?-->/g, " ")
         .replace(/\/\*[\s\S]*?\*\//g, " ")
         .replace(/\/\/[^\n]*/g, " ");
    s = dropTables(s);
    let body = s.replace(/<[^>]+>/g, " ");
    const lits = [...s.matchAll(/"([^"\n]*[一-龥][^"\n]*)"/g)].map(m => m[1])
      .concat([...s.matchAll(/'([^'\n]*[一-龥][^'\n]*)'/g)].map(m => m[1]));
    let pool = lits.join(" | ") + " | " + body;
    for (const phrase of ALLOWED) pool = pool.split(phrase).join(" ");
    return pool;
  }

  ok("语气采集脚本能读到文案", poolOf("index.html").length > 200);
  for (const [label, file] of TARGETS) {
    const pool = poolOf(file);
    const hits = BANNED
      .map(w => [w, pool.split(w).length - 1])
      .filter(([, n]) => n > 0)
      .map(([w, n]) => w + "×" + n);
    ok("语气：文案里没有字面否定词 · " + label, hits.length === 0, hits.join(" "));
  }
}

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
if (fail) process.exit(1);
