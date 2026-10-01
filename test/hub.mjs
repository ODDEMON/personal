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
    /尚无卷宗/.test(w.document.getElementById("ledger").textContent));
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
  ok("总判不宣称自己是结论", /不是结论/.test(v.textContent));

  /* 清空：卷宗散，总判收 */
  w.document.getElementById("clear").click();
  await sleep(60);
  ok("清空后回到空卷宗", /尚无卷宗/.test(w.document.getElementById("ledger").textContent));
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

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
if (fail) process.exit(1);
