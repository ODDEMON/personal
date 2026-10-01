/**
 * 无头冒烟测试：用 jsdom + 模拟 2D 上下文跑通整条渲染管线。
 * 目的不是校验像素，而是抓运行时错误（未定义变量、签名错误、空引用）。
 * 运行（先在仓库根目录执行一次 npm install）：npm test
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/* jsdom 装在仓库根目录的 node_modules 里（npm install 一次即可）。
   用 createRequire 复用 CJS 解析，它会自动向上查找到仓库根，不依赖任何绝对路径。 */
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

/* APP = 本文件所在目录的上一级，即 oddemon-typo/ —— 换机器也不失效 */
const APP = fileURLToPath(new URL("..", import.meta.url));
const JS = fs.readFileSync(path.join(APP, "assets/engine.js"), "utf8");

const errors = [];
function normShort(v) { return String(v).replace(/\s+/g, " ").trim().slice(0, 46) + "…"; }

const dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="od-header"><h1>ODDEMON · 文字 → 艺术字实时生成器</h1>
       <blockquote><p>这不是梦核，不是电波，不是任何一种可以贴在墙上的标签。\n它是一种个人特色鲜明的反抗精神艺术：<strong>拒绝被给定的形式</strong>。\n文字的本质，在这里被改写为——对「是等于否」这一等式的一次可视化验算。</p></blockquote>
       <p><code>空格</code> 播放/暂停　·　<code>R</code> 随机扰动　·　<code>S</code> 导出 PNG　·　<code>L</code> 低烈度　·　双击画面 = 重新投胎</p></div>
     <div id="od-mount"></div>
     <div id="od-pyzone"><h4>服务端 · Python 侧（神谕 / 预设 / 落盘 / 参数）</h4><button>✦ 神谕抽取 · 随机文案</button><button id="savebtn">save</button></div>
     <div id="od-bridge"><textarea></textarea></div>
     <div id="od-png"><textarea></textarea></div>
     <div id="od-params"><textarea></textarea></div>
   </body></html>`,
  { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/#p=低烈度·可读&lang=en" }
);
const { window } = dom;

window.__OD_PRESETS__ = JSON.parse(
  fs.readFileSync(path.join(APP, "assets/presets.json"), "utf8")
);

/* ---- 模拟 CanvasRenderingContext2D ---- */
function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  const ctx = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "left",
    textBaseline: "alphabetic", lineJoin: "miter", shadowBlur: 0, shadowColor: "",
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (s) => ({ width: (s || "").length * 12 }),
    getImageData: (x, y, w, h) => ({
      width: w, height: h,
      data: new Uint8ClampedArray(Math.max(4, w * h * 4)).fill(120),
    }),
    createImageData: (w, h) => ({
      width: w, height: h, data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData() {}, drawImage() {}, clearRect() {}, fillRect() {},
    strokeRect() {}, fillText() {}, strokeText() {}, beginPath() {}, moveTo() {},
    lineTo() {}, arc() {}, fill() {}, stroke() {}, closePath() {}, save() {},
    restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {},
    transform() {}, clip() {},
  };
  return ctx;
}
window.HTMLCanvasElement.prototype.getContext = function () {
  if (!this.__ctx) this.__ctx = makeCtx(this);
  return this.__ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = function () {
  return "data:image/png;base64,iVBORw0KGgo=";
};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);

window.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));
window.onerror = (m) => errors.push("onerror: " + m);

/* ---- 注入引擎 ---- */
const s = window.document.createElement("script");
s.textContent = JS;
try {
  window.document.head.appendChild(s);
} catch (e) {
  errors.push("inject: " + e.message);
}

await new Promise((r) => setTimeout(r, 900));

const D = window.oddemon;
const report = [];
function check(name, cond, extra = "") {
  report.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
  if (!cond) errors.push(name);
}

check("window.oddemon 暴露", !!D);
check("根已挂载", !!window.document.querySelector("#od-root"));
check("画布存在", !!window.document.querySelector("#od-canvas"));
check("预设 chip 数量 > 0", window.document.querySelectorAll(".od-chip").length > 0,
  String(window.document.querySelectorAll(".od-chip").length));
check("控件已生成", window.document.querySelectorAll(".od-ctl").length > 45,
  String(window.document.querySelectorAll(".od-ctl").length));
check("页面挂上 od-page 暗色主题", window.document.body.classList.contains("od-page"));
check("URL hash 预设生效（低烈度）", D && D.state.lowPower === true);

if (D) {
  /* 五种界面语言全部重建一遍面板，抓 i18n 缺键 */
  const langs = ["zh", "en", "ru", "es", "ja"];
  for (const lg of langs) {
    try {
      D.setLang(lg);
      const labels = [...window.document.querySelectorAll(".od-lab span")].map((n) => n.textContent);
      check("i18n " + lg + " 无缺键", !labels.some((x) => x === x.toLowerCase() && /^[a-z_]+$/.test(x)),
        labels.length + " 个标签");
    } catch (e) {
      errors.push("lang " + lg + ": " + e.message);
    }
  }
  /* 真实交互路径：操作面板里的语言下拉框并派发 change */
  try {
    var sel = null;
    var sels = window.document.querySelectorAll(".od-ctl select");
    for (var si = 0; si < sels.length; si++) {
      var vals = [];
      for (var oi = 0; oi < sels[si].options.length; oi++) vals.push(sels[si].options[oi].value);
      if (["zh", "en", "ru", "es", "ja"].every(function (v) { return vals.indexOf(v) >= 0; })) { sel = sels[si]; break; }
    }
    check("找到界面语言下拉框", !!sel);
    if (sel) {
      sel.value = "ru";
      sel.dispatchEvent(new window.Event("change", { bubbles: true }));
      var firstLab = window.document.querySelector(".od-lab span");
      check("下拉框切换语言即时生效", !!firstLab && /[А-Яа-я]/.test(firstLab.textContent),
        firstLab ? firstLab.textContent : "null");
      var h1 = window.document.querySelector("#od-header h1");
      var h4 = window.document.querySelector("#od-pyzone h4");
      check("chrome 区标题随语言切换", !!h1 && /Генеративная/.test(h1.textContent), h1 ? h1.textContent : "null");
      check("chrome 区按钮随语言切换", !!h4 && /Сервер/.test(h4.textContent), h4 ? h4.textContent : "null");
      var bq = window.document.querySelector("#od-header blockquote p");
      check("引言（含块级容器）随语言切换", !!bq && /дримкор/.test(bq.textContent),
        bq ? normShort(bq.textContent) : "null");
      var hk = window.document.querySelectorAll("#od-header p")[1];
      check("快捷键行（含 <code> 子元素）随语言切换", !!hk && /Пробел/.test(hk.textContent),
        hk ? normShort(hk.textContent) : "null");
      check("语言写入 URL hash", /lang=ru/.test(window.location.hash || ""), window.location.hash);
    }
  } catch (e) { errors.push("lang-select: " + e.message); }
  D.setLang("zh");

  /* 逐个预设跑帧 */
  const presets = window.__OD_PRESETS__ || [];
  for (const p of presets) {
    try { D.apply(p.params); D.exportPNG(); }
    catch (e) { errors.push("preset " + p.name + ": " + e.message); }
  }
  check("全部预设无异常", !errors.some((x) => /preset /.test(x)));

  /* 极端参数 + 新增背景/画幅 */
  const extremes = [
    { res: 0.5 }, { res: 1.4 }, { text: "" }, { text: "\n\n\n" },
    { text: "あああ".repeat(20), fontSize: 280, corrupt: 1, glyphs: 1, sliceN: 70 },
    { bgMode: "grid" }, { bgMode: "cloud" }, { bgMode: "rainbow" }, { bgMode: "void" },
    { bgMode: "geo" }, { geo: 1, geoSpin: 3 },
    { geoType: "tristar" }, { geoType: "tristar", geo: 1, geoSpin: 3 },
    { geoType: "flower" }, { geoType: "metatron" }, { geoType: "platonic" },
    { geoType: "mandala" }, { geoType: "lattice" },
    { fillMode: "chrome" }, { fillMode: "prism" }, { fillMode: "solid" }, { fillMode: "outline" },
    { melt: 1, warp: 70, rgbShift: 48, burst: 1, echo: 0.95, barrel: 0.3, noise: 1, scan: 1 },
    { skew: 30, mirror: true, mirrorA: 1, hud: true, glow: 240, bloom: 1.6 },
    { lowPower: true, burst: 1, glow: 240, bloom: 1.6, noise: 1, scan: 1 },
    { glyphs: 0, slice: 0, warp: 0, melt: 0, noise: 0, scan: 0, echo: 0, bloom: 0, fade: 0, vignette: 0, geo: 0 },
    { aspect: "9:16" }, { aspect: "1:1" }, { aspect: "4:3" }, { aspect: "3:4" },
    { stageW: 40 }, { stageW: 100 }, { zen: true }, { autoFit: false },
  ];
  for (const ex of extremes) {
    try { D.apply(ex); D.exportPNG(); }
    catch (e) { errors.push("extreme " + JSON.stringify(ex) + ": " + e.message); }
  }
  try { D.randomize(); D.exportPNG(); } catch (e) { errors.push("randomize: " + e.message); }
  check("全部极端参数无异常", !errors.some((x) => /extreme|randomize/.test(x)));

  /* 画幅切换是否真的改了画布尺寸 */
  D.apply({ aspect: "9:16", res: 1 });
  const cw = window.document.querySelector("#od-canvas").width;
  const ch = window.document.querySelector("#od-canvas").height;
  check("竖幅 9:16 画布尺寸", cw === 540 && ch === 960, cw + "×" + ch);
  D.apply({ aspect: "16:9" });

  /* 桥接：模拟 Python 下发 */
  try {
    const beforeLow = D.state.lowPower;
    const b = window.document.querySelector("#od-bridge textarea");
    b.value = JSON.stringify({ cmd: "text", value: "桥接测试\nODDEMON" });
    await new Promise((r) => setTimeout(r, 300));
    check("桥接 text 生效", D.state.text === "桥接测试\nODDEMON", D.state.text);
    b.value = JSON.stringify({ cmd: "params", params: { hue: 12, bgMode: "void" } });
    await new Promise((r) => setTimeout(r, 300));
    check("桥接 params 生效", D.state.hue === 12 && D.state.bgMode === "void");
    b.value = JSON.stringify({ cmd: "act", value: "low" });
    await new Promise((r) => setTimeout(r, 300));
    check("桥接 act=low 生效（低烈度被切换）", D.state.lowPower === !beforeLow,
      "切换前 " + beforeLow + " → 切换后 " + D.state.lowPower);
  } catch (e) {
    errors.push("bridge: " + e.message);
  }

  /* 模拟点击 pyzone 按钮 → 回写 png/params */
  try {
    window.document.querySelector("#savebtn").dispatchEvent(
      new window.MouseEvent("click", { bubbles: true })
    );
    const pf = window.document.querySelector("#od-png textarea");
    const qf = window.document.querySelector("#od-params textarea");
    check("回写 PNG dataURL", /^data:image\/png;base64,/.test(pf.value || ""), (pf.value || "").slice(0, 24));
    check("回写参数 JSON", JSON.parse(qf.value || "{}").text !== undefined);
  } catch (e) {
    errors.push("pyzone click: " + e.message);
  }
}

/* 让 rAF 多跑几帧，抓循环内异常 */
await new Promise((r) => setTimeout(r, 700));

console.log(report.join("\n"));
console.log("\n--- 运行时错误 ---");
console.log(errors.length ? errors.join("\n") : "（无）");
process.exit(errors.length ? 1 : 0);
