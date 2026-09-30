/*
  来访者协议 · 无头冒烟测试
  ---------------------------------------------------------------------------
  目的不是校验像素，而是抓运行时错误与交互链路断裂。
  运行（先在仓库根目录执行一次 npm install）：
      npm test
      node the-visitor-protocol/test/smoke.mjs
  退出码 0 = 全部通过。
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// ESM 不读 NODE_PATH，走 createRequire 复用 CJS 解析，测试目录本身不落依赖
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const INDEX = path.join(ROOT, "index.html");

let pass = 0;
let fail = 0;

function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name + (extra ? "  → " + extra : "")); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage() {
  const dom = await JSDOM.fromFile(INDEX, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: "file:///" + INDEX.replace(/\\/g, "/")
  });
  await new Promise(res => {
    if (dom.window.document.readyState === "complete") res();
    else dom.window.addEventListener("load", res);
  });
  await sleep(60);
  return dom;
}

async function walkthrough(choicePicker) {
  const dom = await newPage();
  const { window } = dom;
  const doc = window.document;
  const $ = id => doc.getElementById(id);

  const errors = [];
  window.addEventListener("error", e => errors.push(String(e.message || e)));

  ok("协议核心已挂载", !!window.VisitorProtocol);
  ok("六道门已定义", window.VisitorProtocol.GATES.length === 6);

  $("seed-text").value = "感动是有意义的";
  $("begin-btn").click();
  await sleep(40);

  ok("入口场景已隐藏", $("intro").hidden === true);
  ok("门场景已显示", $("gate").hidden === false);

  const total = window.VisitorProtocol.GATES.length;
  for (let g = 0; g < total; g++) {
    const gate = window.VisitorProtocol.GATES[g];
    ok(`第 ${g + 1} 门标题非空`, ($("gate-title").textContent || "").length > 0, $("gate-title").textContent);
    ok(`第 ${g + 1} 门提示非空`, ($("gate-prompt").textContent || "").length > 0);
    ok(`第 ${g + 1} 门定理非空`, ($("gate-theorem").textContent || "").length > 0);
    ok(`第 ${g + 1} 门有 3 个选项`, $("gate-choices").children.length === 3,
      "实际 " + $("gate-choices").children.length);

    const idx = choicePicker(g);
    $("gate-choices").children[idx].click();
    await sleep(260); // 等待文字过渡的 setTimeout

    ok(`第 ${g + 1} 门记录已写入`, $("log").children.length === g + 1,
      "实际 " + $("log").children.length);
    ok(`第 ${g + 1} 门操作条已出现`, $("gate-action-bar").hidden === false);
    ok(`第 ${g + 1} 门选项已锁定`, $("gate-choices").children[idx].disabled === true);

    $("next-btn").click();
    await sleep(40);
  }

  ok("归档场景已显示", $("end").hidden === false);
  ok("门场景已隐藏", $("gate").hidden === true);
  ok("归档文本非空", ($("end-text").textContent || "").length > 0);
  ok("步数计量为 6", $("m-steps").textContent === "6", $("m-steps").textContent);

  $("cert-btn").click();
  await sleep(40);
  ok("证明浮层已打开", $("cert-overlay").classList.contains("on"));
  const cert = $("cert-box").textContent || "";
  ok("证明含标题", cert.includes("来访者协议 · 归档证明"));
  ok("证明含案件编号", /案件编号：V-/.test(cert));
  ok("证明含 6 条运算记录", (cert.match(/^\d+\. /gm) || []).length === 6,
    "实际 " + (cert.match(/^\d+\. /gm) || []).length);
  ok("证明含献词原句", cert.includes("感动是有意义的"));
  ok("证明含全称性行", cert.includes("全称性："));
  ok("证明含自指条款", cert.includes("自指条款"));
  ok("全称性指标已渲染", /^\d+$/.test($("m-universal").textContent), $("m-universal").textContent);

  ok("无运行时错误", errors.length === 0, errors.join(" | "));

  window.close();
}

function unitTests() {
  const { hash, entropy, integrity, universality, QUANT, SELF_THEOREM,
          GATES, finalState, buildCertificate } = globalThis.__VP;

  ok("哈希确定性", hash("abc") === hash("abc"));
  ok("哈希区分性", hash("abc") !== hash("abd"));
  ok("熵：单字符为 0", entropy("aaaa") === 0);
  ok("熵：多字符大于 0", entropy("abcd") > 0);
  ok("完整性：原样为 1", integrity("abc", "abc") === 1);
  ok("完整性：空串为 0", integrity("abc", "") === 0);
  ok("完整性：不超过 1", integrity("ab", "abcd") === 1);

  // 全称性：本次改动的度量核心
  ok("全称性：普通句为 0", universality("今天天气不错") === 0);
  ok("全称性：含全称词可计数", universality("一切人皆必须") > 0,
    "实际 " + universality("一切人皆必须"));
  ok("全称性：收拢后归零", universality(QUANT.reduce((s, [a, b]) => s.split(a).join(b), "一切人皆必须")) === 0);
  ok("全称词表非空且成对", QUANT.length > 0 && QUANT.every(p => p.length === 2));
  ok("自指定理已定义", typeof SELF_THEOREM === "string" && SELF_THEOREM.length > 0);

  // 每个算子在空串、单字符、超长串下都不应抛错
  const inputs = ["", "　", "a", "感动是有意义的", "x".repeat(300), "　 is equal to not 　"];
  let crashed = null;
  for (const s of inputs) {
    for (const gate of GATES) {
      for (const c of gate.choices) {
        try {
          const r = c.op(s, { seed: hash(s), original: s, step: 0 });
          if (typeof r.text !== "string" || typeof r.note !== "string") {
            crashed = `${gate.id}/${c.id} 返回结构异常`;
          }
        } catch (e) {
          crashed = `${gate.id}/${c.id} 抛错: ${e.message}`;
        }
      }
    }
  }
  ok("全部算子在边界输入下不抛错", crashed === null, crashed || "");

  // 全链路：任取一条路径都应产出完整证明
  const log = [];
  let cur = "感动是有意义的";
  GATES.forEach((gate, i) => {
    const c = gate.choices[i % gate.choices.length];
    const r = c.op(cur, { seed: hash(cur + i), original: "感动是有意义的", step: i });
    cur = r.text;
    log.push({ gateName: gate.name, choiceLabel: c.label, note: r.note, text: cur });
  });
  const f = finalState("感动是有意义的", log);
  ok("终态文本非空", (f.text || "").length > 0);
  ok("终态含指标", f.metrics && typeof f.metrics.integrity === "number");
  const cert = buildCertificate("感动是有意义的", log);
  ok("证明可生成且非空", cert.length > 100);
}

// 全称坍塌：验证「宣称普遍有效的串」经第一门收拢后全称性确实归零
async function quantCollapse() {
  const dom = await newPage();
  const { window } = dom;
  const doc = window.document;
  const $ = id => doc.getElementById(id);

  $("seed-text").value = "一切人皆必须追求普世的自由";
  $("begin-btn").click();
  await sleep(40);

  const before = window.VisitorProtocol.universality($("gate-text").textContent);
  ok("全称坍塌前：全称性大于 0", before > 0, "实际 " + before);

  $("gate-choices").children[0].click();   // 第一门 · 收拢
  await sleep(260);

  const after = window.VisitorProtocol.universality($("gate-text").textContent);
  ok("全称坍塌后：全称性归零", after === 0, "实际 " + after);
  ok("全称坍塌后：原文已被改写", $("gate-text").textContent !== "一切人皆必须追求普世的自由");
  ok("全称坍塌后：仪表同步归零", $("m-universal").textContent === "0", $("m-universal").textContent);

  window.close();
}

// 自指：最后一门必须把协议自身的断言交出去被否定
async function selfReference() {
  const dom = await newPage();
  const { window } = dom;
  const doc = window.document;
  const $ = id => doc.getElementById(id);
  const VP = window.VisitorProtocol;

  ok("第六门为自指门", VP.GATES[5].id === "self", VP.GATES[5].id);

  $("seed-text").value = "普世价值是终极的";
  $("begin-btn").click();
  await sleep(40);

  for (let g = 0; g < 5; g++) {
    $("gate-choices").children[0].click();
    await sleep(260);
    $("next-btn").click();
    await sleep(40);
  }

  $("gate-choices").children[0].click();   // 自指门 · 施于自身
  await sleep(260);

  ok("自指后：定理已进入文本", $("gate-text").textContent.includes(VP.SELF_THEOREM));
  ok("自指后：定理已被改写", !$("gate-text").textContent.endsWith(VP.SELF_THEOREM));

  window.close();
}

(async () => {
  console.log("\n=== 单元：协议核心 ===");
  const dom0 = await newPage();
  globalThis.__VP = dom0.window.VisitorProtocol;
  unitTests();
  dom0.window.close();

  console.log("\n=== 链路 A：每门都选第一个 ===");
  await walkthrough(() => 0);

  console.log("\n=== 链路 B：每门都选第二个 ===");
  await walkthrough(() => 1);

  console.log("\n=== 链路 C：每门都选第三个 ===");
  await walkthrough(() => 2);

  console.log("\n=== 链路 D：混合选择 ===");
  await walkthrough(g => (g * 2 + 1) % 3);

  console.log("\n=== 机制：全称坍塌 ===");
  await quantCollapse();

  console.log("\n=== 机制：自指 ===");
  await selfReference();

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
