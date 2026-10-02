/*
  声轨层 · 无头冒烟测试
  ---------------------------------------------------------------------------
  目的不是校验声音，而是抓：曲库表与磁盘上的文件是否对得上、开关状态机是否
  断裂、低烈度上限是否真的生效、以及——最关键的——声轨有没有伸手去碰判据。
  运行（先在仓库根目录执行一次 npm install）：
      npm test
      node bgm/test/smoke.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require("jsdom");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "fixture.html");
const ROOT = path.resolve(HERE, "..", "..");      // 仓库根目录：音频文件放在那里

let pass = 0, fail = 0;
const ok = (n, c, x = "") => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (x ? "  → " + x : "")); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page() {
  // jsdom 没有真实播放实现，play() 的「Not implemented」只是噪声，
  // 用一个不转发的 virtualConsole 吞掉它；真正的脚本错误走 window error 事件
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromFile(INDEX, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    url: "file:///" + INDEX.replace(/\\/g, "/"),
    virtualConsole: vc
  });
  await new Promise(res => dom.window.document.readyState === "complete"
    ? res() : dom.window.addEventListener("load", res));
  await sleep(60);
  return dom;
}

(async () => {
  console.log("\n=== 载入 ===");
  const dom = await page();
  const { window } = dom;
  const doc = window.document;
  const errs = [];
  window.addEventListener("error", e => errs.push(String(e.message || e)));

  const B = window.OdBgm;
  ok("声轨层已挂载", !!B);
  ok("页面载入无错误", errs.length === 0, errs.join(" | "));

  console.log("\n=== 曲库表：定义句与磁盘是否对得上 ===");
  ok("曲库共 6 首", B.TRACKS.length === 6, String(B.TRACKS.length));
  const missing = B.TRACKS.filter(t => !fs.existsSync(path.join(ROOT, t.file))).map(t => t.file);
  ok("每一首都指向真实存在的文件", missing.length === 0, missing.join(" | "));
  ok("每首都有定义句（不是乐评，也是一句）",
    B.TRACKS.every(t => typeof t.def === "string" && t.def.length > 8));
  ok("每首都有四值读数（强/弱/重复/对称 四项齐全）",
    B.TRACKS.every(t => t.form && ["s", "w", "r", "y"].every(k => typeof t.form[k] === "number")));

  console.log("\n=== 配对方向：强→否定，弱→肯定（读反即整体上下颠倒）===");
  const P = B.PAIR;
  ok("强 对应 否定（不是肯定）", P.s.form === "强" && P.s.sense === "否定");
  ok("弱 对应 肯定（不是否定）", P.w.form === "弱" && P.w.sense === "肯定");
  ok("重复 对应 拒绝", P.r.form === "重复" && P.r.sense === "拒绝");
  ok("对称 对应 允许", P.y.form === "对称" && P.y.sense === "允许");
  // 四项若有两项指向同一个意义，说明表里被写成反的或写重了
  ok("四个形式值各占一个意义，无重复占用",
    new Set(["s", "w", "r", "y"].map(k => P[k].sense)).size === 4,
    ["s", "w", "r", "y"].map(k => P[k].sense).join(","));
  const formEl = doc.querySelector("#bgm .od-bgm-form");
  const ft = formEl.textContent || "";
  ok("界面按「形式=意义」成对显示，不并列裸标签", /强\d=否定/.test(ft) && /弱\d=肯定/.test(ft), ft);
  ok("界面没有把强弱读反", !/强\d=肯定/.test(ft) && !/弱\d=否定/.test(ft), ft);

  console.log("\n=== 读数与定义句是否自洽（按坐标系，不按感觉）===");
  ok("每项读数落在 1–5",
    B.TRACKS.every(t => ["s", "w", "r", "y"].every(k => t.form[k] >= 1 && t.form[k] <= 5)));
  ok("没有任何一首四项全同（全同等于没读）",
    B.TRACKS.every(t => new Set(["s", "w", "r", "y"].map(k => t.form[k])).size > 1));
  // 「取默认位」＝允许＝对称：定义句这么写的，读数里对称就必须最高，否则是表写错了
  const neutral = B.TRACKS.find(t => /默认位/.test(t.def));
  ok("定义句写「取默认位」的那首，对称（允许）一项最高",
    !!neutral && neutral.form.y === Math.max(neutral.form.s, neutral.form.w, neutral.form.r, neutral.form.y),
    neutral ? JSON.stringify(neutral.form) : "(未找到)");

  console.log("\n=== 默认位：不自动出声 ===");
  ok("默认是关的", B.peek().on === false);
  ok("控件已渲染", !!doc.querySelector("#bgm .od-bgm"));
  ok("按钮如实写着「关」", /关/.test(doc.querySelector("#bgm .od-bgm-toggle").textContent));
  ok("曲目名已显示（关着也有名字）", (doc.querySelector("#bgm .od-bgm-name").textContent || "").length > 0);

  console.log("\n=== 开关：一次手势，一次状态 ===");
  const btn = doc.querySelector("#bgm .od-bgm-toggle");
  btn.click();
  await sleep(30);
  ok("点击后开声", B.peek().on === true);
  ok("按钮改为「开」", /开/.test(btn.textContent));
  const au = doc.querySelector("audio");
  ok("音频元素已创建", !!au);
  ok("音频指向当前曲目", !!au && decodeURIComponent(au.getAttribute("src") || "").endsWith(".mp3"),
    au ? au.getAttribute("src") : "(无)");
  ok("音频源为曲库中的某一首",
    !!au && B.TRACKS.some(t => decodeURIComponent(au.getAttribute("src") || "").endsWith(t.file)));

  btn.click();
  await sleep(30);
  ok("再点即关", B.peek().on === false);
  ok("关后按钮回到「关」", /关/.test(btn.textContent));

  console.log("\n=== 切歌：环绕且不越界 ===");
  const i0 = B.peek().idx;
  B.next();
  ok("下一首确实前进", B.peek().idx === (i0 + 1) % B.TRACKS.length,
    i0 + " → " + B.peek().idx);
  B.prev(); B.prev();
  ok("上一首会绕回末尾", B.peek().idx === (i0 - 1 + B.TRACKS.length) % B.TRACKS.length,
    String(B.peek().idx));
  let bad = null;
  for (let k = 0; k < 13; k++) { B.next(); if (B.peek().idx < 0 || B.peek().idx > 5) bad = B.peek().idx; }
  ok("连切 13 次仍在合法区间", bad === null, String(bad));

  console.log("\n=== 低烈度上限 ===");
  B.setSoft(true);
  ok("低烈度下音量被钳到上限", B.peek().vol <= B.SOFTCAP.vol + 1e-9,
    B.peek().vol + " vs " + B.SOFTCAP.vol);
  B.setSoft(false);
  ok("解除后音量恢复原值", B.peek().vol > B.SOFTCAP.vol, String(B.peek().vol));

  console.log("\n=== 列表模式（总台用） ===");
  ok("列表已渲染 6 项", doc.querySelectorAll("#bgm-list .od-bgm-item").length === 6,
    String(doc.querySelectorAll("#bgm-list .od-bgm-item").length));
  const third = doc.querySelectorAll("#bgm-list .od-bgm-item")[2];
  third.click();
  await sleep(30);
  ok("点选曲目即切换到该首", B.peek().idx === 2, String(B.peek().idx));
  ok("点选即出声（点击本身就是手势）", B.peek().on === true);

  console.log("\n=== 声轨不伸手碰判据 ===");
  const keys = Object.keys(B.peek()).sort().join(",");
  ok("对外只暴露标题与音量，不暴露任何判据", keys === "idx,on,title,vol", keys);
  ok("不导出任何写判据的接口",
    ["mount", "toggle", "next", "prev", "play", "stop", "refresh", "setSoft", "peek"]
      .every(k => typeof B[k] === "function") && !("judge" in B) && !("score" in B));
  ok("全程无运行时错误", errs.length === 0, errs.join(" | "));

  window.close();
  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败\n");
  process.exit(fail === 0 ? 0 : 1);
})();
