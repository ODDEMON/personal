/*
  验算器 · 无头冒烟测试
  目的不是校验像素，而是抓运行时错误、状态机泄漏与不可复现。
  运行（先在仓库根目录执行一次 npm install）：
      npm test
      node proof/test/smoke.mjs
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "..", "index.html");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (x ? "  → " + x : "")); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page() {
  const dom = await JSDOM.fromFile(INDEX, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: "file:///" + INDEX.replace(/\\/g, "/")
  });
  await new Promise(res => dom.window.document.readyState === "complete"
    ? res() : dom.window.addEventListener("load", res));
  await sleep(60);
  return dom;
}

// 走到底：反复点「单步」直到不动
async function runToEnd(doc) {
  for (let i = 0; i < 20; i++) {
    doc.getElementById("step").click();
    await sleep(20);
  }
}

function chainTexts(doc) {
  return Array.from(doc.querySelectorAll("#stage .step .txt")).map(e => e.textContent);
}

// 等判词出现（自动验算每步 620ms，最多 12 步，不能写死等待时长）
async function waitVerdict(doc, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (doc.getElementById("verdict").style.display === "block") return true;
    await sleep(100);
  }
  return false;
}

(async () => {
  console.log("\n=== 载入 ===");
  const dom = await page();
  const doc = dom.window.document;
  const errs = [];
  dom.window.addEventListener("error", e => errs.push(String(e.message || e)));

  ok("页面载入无错误", errs.length === 0, errs.join(" | "));
  ok("初始仅一行（原命题）", doc.querySelectorAll("#stage .step").length === 1);

  console.log("\n=== 确定性：同种子同结果 ===");
  doc.getElementById("seed").value = "42";
  doc.getElementById("seed").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("in").value = "感动是有意义的";
  doc.getElementById("in").dispatchEvent(new dom.window.Event("input"));
  await runToEnd(doc);
  const a = chainTexts(doc).join("|");

  doc.getElementById("reset").click();
  await sleep(30);
  await runToEnd(doc);
  const b = chainTexts(doc).join("|");
  ok("同种子两次结果一致", a === b);
  ok("链路确实推进了", doc.querySelectorAll("#stage .step").length > 1);

  console.log("\n=== 不同种子应产生不同路径 ===");
  doc.getElementById("seed").value = "777";
  doc.getElementById("seed").dispatchEvent(new dom.window.Event("change"));
  await runToEnd(doc);
  const c = chainTexts(doc).join("|");
  ok("换种子后路径改变", a !== c);

  console.log("\n=== 终止守卫 ===");
  const before = doc.querySelectorAll("#stage .step").length;
  for (let i = 0; i < 10; i++) { doc.getElementById("step").click(); await sleep(10); }
  const after = doc.querySelectorAll("#stage .step").length;
  ok("抵达终点后不再增长", after === before, before + " → " + after);
  ok("步数不超过 12", Number(doc.getElementById("m1").textContent) <= 12,
    doc.getElementById("m1").textContent);
  ok("判词已显示", doc.getElementById("verdict").style.display === "block");

  console.log("\n=== 复位应清零运行状态 ===");
  doc.getElementById("reset").click();
  await sleep(30);
  ok("复位后回到 1 行", doc.querySelectorAll("#stage .step").length === 1);
  ok("复位后步数为 0", doc.getElementById("m1").textContent === "0");

  console.log("\n=== 自指 ===");
  doc.getElementById("seed").value = "42";
  doc.getElementById("seed").dispatchEvent(new dom.window.Event("change"));
  doc.getElementById("selfref").click();
  ok("自指后判词最终出现", await waitVerdict(doc));
  ok("自指后输入为公理", doc.getElementById("in").value === "是等于否");
  ok("自指后链路已推进", doc.querySelectorAll("#stage .step").length > 1);
  ok("判词含自指条款", doc.getElementById("verdict").innerHTML.includes("自指条款"));

  console.log("\n=== 冷静模式 ===");
  doc.getElementById("calm").click();
  await sleep(30);
  ok("冷静模式已开启", doc.getElementById("m4").textContent === "开");
  // 只查 GLYPH 独有字符：░ 与 ∷ 同时是「抽空」「稀释」算子的正常产物，
  // 冷静模式关的是视觉降级，不该连算子输出一起关掉
  const withGlyph = chainTexts(doc).some(t => /[ヲミヶˇ∅]/.test(t));
  ok("冷静模式下乱码替换已关闭", !withGlyph);
  doc.getElementById("calm").click();
  await sleep(30);

  console.log("\n=== 边界输入 ===");
  const inputs = ["", "　", "a", "是", "x".repeat(400), "感动是有意义的 and IS EQUAL TO NOT"];
  let crashed = null;
  for (const s of inputs) {
    try {
      doc.getElementById("in").value = s;
      doc.getElementById("in").dispatchEvent(new dom.window.Event("input"));
      await sleep(20);
      await runToEnd(doc);
    } catch (e) { crashed = s.slice(0, 12) + " → " + e.message; }
  }
  ok("全部边界输入不抛错", crashed === null, crashed || "");
  ok("全程无运行时错误", errs.length === 0, errs.join(" | "));

  dom.window.close();
  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败\n");
  process.exit(fail === 0 ? 0 : 1);
})();
