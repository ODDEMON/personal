/*
  羊肠小道 · 无头冒烟测试
  ---------------------------------------------------------------------------
  jsdom 没有真实 Canvas，这里注入一个 no-op 2D 上下文替身：
  目的不是校验像素，而是抓运行时错误、几何异常与状态机断裂。
  运行：NODE_PATH=<jsdom 所在 node_modules> node test/smoke.mjs
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

// no-op 2D 上下文替身：任何方法调用都吞掉，只把必要的返回值补齐
function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === "canvas") return { width: 1000, height: 620 };
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "createRadialGradient" || k === "createLinearGradient")
        return () => ({ addColorStop() {} });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set() { return true; }
  });
}

async function page() {
  const dom = await JSDOM.fromFile(INDEX, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: "file:///" + INDEX.replace(/\\/g, "/"),
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = () => fakeCtx();
      // jsdom 的 getBoundingClientRect 全零，会让坐标换算变成 NaN
      window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
        left: 0, top: 0, width: 1000, height: 620, right: 1000, bottom: 620, x: 0, y: 0
      });
    }
  });
  await new Promise(res => dom.window.document.readyState === "complete"
    ? res() : dom.window.addEventListener("load", res));
  await sleep(80);
  return dom;
}

function move(doc, win, x, y) {
  const cv = doc.getElementById("cv");
  cv.dispatchEvent(new win.MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
}

(async () => {
  console.log("\n=== 载入 ===");
  const dom = await page();
  const { window } = dom;
  const doc = window.document;
  const errs = [];
  window.addEventListener("error", e => errs.push(String(e.message || e)));

  ok("页面载入无错误", errs.length === 0, errs.join(" | "));
  ok("测试钩子已暴露", !!window.__NP__);
  ok("六道已定义", window.__NP__.LEVELS.length === 6);

  console.log("\n=== 几何：每一道都可用 ===");
  let geoBad = null;
  for (let i = 0; i < 6; i++) {
    const p = window.__NP__.buildPath(window.__NP__.LEVELS[i]);
    if (!p.pts.length || p.len < 500) { geoBad = "第 " + (i + 1) + " 道长度异常 " + p.len.toFixed(0); break; }
    let out = 0;
    for (const pt of p.pts) if (pt.x < 0 || pt.x > 1000 || pt.y < 0 || pt.y > 620) out++;
    if (out) { geoBad = "第 " + (i + 1) + " 道有 " + out + " 点越界"; break; }
    // 半径必须逐道收窄
    if (i > 0 && p.r >= window.__NP__.buildPath(window.__NP__.LEVELS[i - 1]).r)
      { geoBad = "第 " + (i + 1) + " 道半径未收窄"; break; }
  }
  ok("六道几何全部合法且逐道收窄", geoBad === null, geoBad || "");

  console.log("\n=== 流程 ===");
  doc.getElementById("btn-start").click();
  await sleep(30);
  ok("START 后进入第 1 道说明", doc.getElementById("ov-lv").classList.contains("on"));
  ok("说明含命题", doc.getElementById("lv-prop").textContent.includes("一切都会好起来"));
  doc.getElementById("btn-lv").click();
  await sleep(30);
  ok("进入本道后浮层关闭", !doc.getElementById("ov-lv").classList.contains("on"));

  console.log("\n=== 沿通道前进（只走到一半，不要通关）===");
  const P = window.__NP__.path;
  const PROP0 = window.__NP__.prop;
  ok("当前通道已构建", !!P && P.pts.length > 100);
  move(doc, window, P.pts[0].x, P.pts[0].y);
  await sleep(60);
  ok("起点就位后已激活", window.__NP__.armed === true);

  const half = Math.floor(P.pts.length * 0.5);
  for (let i = 0; i <= half; i += 5) {
    move(doc, window, P.pts[i].x, P.pts[i].y);
    await sleep(2);
  }
  await sleep(60);
  ok("进度已推进", window.__NP__.maxIdx > 10, "maxIdx=" + window.__NP__.maxIdx);
  ok("沿通道行走不产生偏差", window.__NP__.hits === 0, "hits=" + window.__NP__.hits);
  ok("未触发通关（仍在同一道）", window.__NP__.li === 0, "li=" + window.__NP__.li);

  console.log("\n=== 碰壁 ===");
  let far = null;
  for (let x = 20; x < 980 && !far; x += 20)
    for (let y = 20; y < 600; y += 20)
      if (window.__NP__.query(P, x, y).d > P.r * 3) { far = { x, y }; break; }
  ok("找到远离通道的点", !!far);
  if (far) {
    move(doc, window, far.x, far.y);
    await sleep(80);
    ok("碰壁后偏差 +1", window.__NP__.hits === 1, "hits=" + window.__NP__.hits);
    ok("碰壁后进入待归位", window.__NP__.awaiting === true);
    ok("碰壁后命题被改写", window.__NP__.prop !== PROP0, window.__NP__.prop);
    ok("碰壁后被退回存档点", window.__NP__.maxIdx === window.__NP__.cpIdx,
      "maxIdx=" + window.__NP__.maxIdx + " cpIdx=" + window.__NP__.cpIdx);
  }

  console.log("\n=== 归位 ===");
  move(doc, window, P.pts[window.__NP__.cpIdx].x, P.pts[window.__NP__.cpIdx].y);
  await sleep(80);
  ok("回到存档点后恢复", window.__NP__.awaiting === false);

  console.log("\n=== 跳过 / 冷静 ===");
  doc.getElementById("btn-skip").click();
  await sleep(40);
  ok("跳过后进入第 2 道", window.__NP__.li === 1, "li=" + window.__NP__.li);
  doc.getElementById("btn-lv").click();
  await sleep(20);
  doc.getElementById("btn-calm").click();
  await sleep(20);
  ok("冷静模式已开启", doc.getElementById("btn-calm").classList.contains("on"));
  doc.getElementById("btn-calm").click();
  await sleep(20);

  console.log("\n=== 通关出证明 ===");
  // 一路跳过直到证明出现（不写死次数）
  for (let k = 0; k < 12 && !doc.getElementById("ov-cert").classList.contains("on"); k++) {
    doc.getElementById("btn-skip").click();
    await sleep(50);
  }
  ok("证明浮层已打开", doc.getElementById("ov-cert").classList.contains("on"));
  const cert = doc.getElementById("cert").textContent || "";
  ok("证明含标题", cert.includes("羊肠小道 · 归档证明"));
  ok("证明含案件编号", /案件编号：P-/.test(cert));
  ok("证明含六道记录", (cert.match(/^\d+\. /gm) || []).length === 6,
    "实际 " + (cert.match(/^\d+\. /gm) || []).length);
  ok("证明含自指条款", cert.includes("自指条款"));
  ok("证明标注已跳过", cert.includes("已跳过"));

  ok("全程无运行时错误", errs.length === 0, errs.join(" | "));

  window.close();
  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败\n");
  process.exit(fail === 0 ? 0 : 1);
})();
