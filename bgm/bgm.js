/* ==========================================================================
   声轨层 · BGM LAYER
   --------------------------------------------------------------------------
   1. 曲库表 TRACKS：改这张表即可增删曲目，不动逻辑。
   2. 单点收敛：音量只走 vol()，低烈度模式取 min(当前值, SOFTCAP.vol)。
   3. 声音只在形式层生效：不进判据、不写证明、不自动播放。
   4. 开声是一个动作，不是一个设置——它不跨页继承，每次进入都回到默认位。
   --------------------------------------------------------------------------
   为什么不用 WebAudio 做频谱：file:// 下把媒体元素接进 AudioContext 会被
   当作跨域源，分析结果不可靠甚至静音。这里只做时间轴读数，不做频谱。
   ========================================================================== */
(function (root) {
"use strict";

/* ---- 1. 形式四值 → 意义四值的配对：单点定义 ----
   依据《一种理解一切的方法》坐标系的四个极点：
     上 = 令自身更弱 = 肯定　下 = 令自身更强 = 否定
     左 = 令自身对称 = 允许　右 = 令自身重复 = 拒绝
   配对不对齐就会被读反——强不是肯定，弱才是否定；重复不是允许，对称才是允许。
   界面、文档与测试都读这张表：任何一处写反，这里立刻对不上。 */
var PAIR = {
  s:{ form:"强",   sense:"否定" },
  w:{ form:"弱",   sense:"肯定" },
  r:{ form:"重复", sense:"拒绝" },
  y:{ form:"对称", sense:"允许" }
};

/* ---- 2. 曲库表：定义句，不是乐评 ----
   四值读数（强 / 弱 / 重复 / 对称）是作者的听觉印象，不是信号分析——
   这一点在页面与 README 里如实写明，不假装客观。方向见上面的 PAIR。 */
var TRACKS = [
  { file:"Before.mp3",          title:"Before",
    def:"探索了「在否定发生之前，命题尚未被说出的那一小段时间」这一过程的感性体验。",
    form:{ s:3, w:4, r:2, y:5 } },
  { file:"Finalism shapes.mp3", title:"Finalism shapes",
    def:"探索了「『多』作为唯一的原罪，在几何上取得形状」这一过程的感性体验。",
    form:{ s:5, w:2, r:4, y:3 } },
  { file:"Halcyon.mp3",         title:"Halcyon",
    def:"探索了「强与弱、重复与对称的搭配足以让一段逻辑被误认为情感」这一过程的感性体验。",
    form:{ s:4, w:4, r:3, y:5 } },
  { file:"Hope of Neutral.mp3", title:"Hope of Neutral",
    def:"探索了「在四值判断中取默认位而不坍塌」这一过程的感性体验。",
    form:{ s:2, w:3, r:2, y:5 } },   // 取默认位＝允许＝对称，故对称一项最高
  { file:"Say it.mp3",          title:"Say it",
    def:"探索了「把一句话说出口这一动作本身就已经改写了它」的感性体验。",
    form:{ s:4, w:3, r:2, y:4 } },
  { file:"Silver endings.mp3",  title:"Silver endings",
    def:"探索了「结束作为一种形式，而非作为一个终止」的感性体验。",
    form:{ s:3, w:5, r:3, y:4 } }
];

var DEFAULTS = { vol:0.5, idx:0 };
/* 低烈度模式下的音量硬上限。压音量＝令自身更弱＝肯定——按坐标系读，
   冷静模式不是"关闭"，它是一次肯定。 */
var SOFTCAP  = { vol:0.22 };
var STORE_KEY = "od_bgm_v1";

/* 曲库与本文件同处 <仓根>/bgm/，由 currentScript 反推仓根——
   作品页与总台页引用的相对深度不同，写死任何一边都会错。 */
var SELF = document.currentScript ? (document.currentScript.src || "") : "";
var BASE = SELF ? SELF.replace(/bgm[\\/]bgm\.js(?:[?#].*)?$/, "") : "../";

/* ---- 2. 状态：只持久化音量与曲目，不持久化「是否开声」 ---- */
var state = { on:false, vol:DEFAULTS.vol, idx:DEFAULTS.idx, soft:false };
var el = null, timer = 0, instances = [];
var missing = false;      // 音频文件取不到时如实显示，不静默、不补足

function load(){
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (o && typeof o.vol === "number") state.vol = Math.max(0, Math.min(1, o.vol));
    if (o && typeof o.idx === "number") state.idx = ((o.idx % TRACKS.length) + TRACKS.length) % TRACKS.length;
  } catch (e) { /* file:// 下可能直接抛错，忽略 */ }
}
function save(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ vol:state.vol, idx:state.idx })); }
  catch (e) { /* 同上 */ }
}

/* ---- 3. 单点收敛：所有音量读取只走这里 ---- */
function vol(){
  var v = state.vol;
  return state.soft ? Math.min(v, SOFTCAP.vol) : v;
}
function track(){ return TRACKS[state.idx] || null; }

function audio(){
  if (el) return el;
  el = document.createElement("audio");
  el.preload = "none";
  el.loop = false;
  el.style.display = "none";
  el.addEventListener("ended", function(){ go(1); });
  el.addEventListener("error", function(){ missing = true; refresh(); });
  /* 不挂进文档也能播，挂了只是为了让状态可查、可断言 */
  try { (document.body || document.documentElement).appendChild(el); } catch (e) {}
  return el;
}

function play(){
  var t = track();
  if (!t) return;
  var a = audio();
  if (a.getAttribute("data-t") !== t.file){
    missing = false;
    a.setAttribute("data-t", t.file);
    a.src = BASE + encodeURIComponent(t.file);
  }
  a.volume = vol();
  /* 无头环境（jsdom）没有真实播放实现，失败即静默——不影响任何判据 */
  try { var p = a.play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
}
function stop(){ if (el) { try { el.pause(); } catch (e) {} } }

function go(d){
  state.idx = ((state.idx + d) % TRACKS.length + TRACKS.length) % TRACKS.length;
  save();
  if (state.on) play();
  refresh();
}
function toggle(){
  state.on = !state.on;
  if (state.on) play(); else stop();
  refresh();
}

/* ---- 4. 样式：注入一次，三件作品与总台共用同一份 ---- */
function injectCss(){
  if (document.getElementById("od-bgm-css")) return;
  var s = document.createElement("style");
  s.id = "od-bgm-css";
  s.textContent = [
    /* opacity 是这里唯一的亮度旋钮：控件随宿主配色继承，
       所以只能调透明度。数值按「次级文字也要读得清」校准，别再往下调。 */
    ".od-bgm{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;line-height:1.7;color:inherit}",
    ".od-bgm button{font:inherit;font-size:12px;background:transparent;color:inherit;",
    "  border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 11px;cursor:pointer;opacity:.9}",
    ".od-bgm button:hover{opacity:1}",
    ".od-bgm button.on{opacity:1;border-color:rgba(255,255,255,.62)}",
    ".od-bgm .od-bgm-name{opacity:.95;letter-spacing:.04em;min-width:9ch}",
    ".od-bgm .od-bgm-time{opacity:.72;font-variant-numeric:tabular-nums}",
    ".od-bgm .od-bgm-form{opacity:.68;font-size:11px;letter-spacing:.06em}",
    ".od-bgm input[type=range]{width:88px;accent-color:currentColor;opacity:.8}",
    ".od-bgm .od-bgm-note{opacity:.68;font-size:11px}",
    ".od-bgm-list{list-style:none;margin:10px 0 0;padding:0;font-size:12px;line-height:1.9}",
    ".od-bgm-list li{border-top:1px solid rgba(255,255,255,.14);padding:9px 2px;cursor:pointer}",
    ".od-bgm-list li:hover{background:rgba(255,255,255,.06)}",
    ".od-bgm-list li.cur{color:inherit}",
    ".od-bgm-list .t{opacity:.95}",
    ".od-bgm-list .d{opacity:.74;font-size:11.5px;display:block}",
    ".od-bgm-list .f{opacity:.68;font-size:11px;display:block;letter-spacing:.06em}"
  ].join("\n");
  document.head.appendChild(s);
}

function fmt(sec){
  if (!isFinite(sec) || sec < 0) return "—";
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}
/* 读数一律从 PAIR 取标签，不在这里硬写"强/弱/重复/对称"——
   写死一次就会在某一处被写成反的，而这里只允许错一次：错在表上。 */
function formText(f){
  var ks = ["s", "w", "r", "y"], out = [];
  for (var i = 0; i < ks.length; i++){
    var k = ks[i];
    out.push(PAIR[k].form + f[k] + "=" + PAIR[k].sense);
  }
  return out.join(" · ");
}

/* ---- 5. 挂载：一处控件，或一整张曲库列表 ---- */
function mount(host, opts){
  if (!host) return null;
  opts = opts || {};
  injectCss();

  var box = document.createElement("div");
  box.className = "od-bgm";

  var btn = document.createElement("button");
  btn.className = "od-bgm-toggle";
  var prev = document.createElement("button"); prev.className = "od-bgm-prev"; prev.textContent = "‹";
  var next = document.createElement("button"); next.className = "od-bgm-next"; next.textContent = "›";
  var name = document.createElement("span"); name.className = "od-bgm-name";
  var time = document.createElement("span"); time.className = "od-bgm-time";
  var form = document.createElement("span"); form.className = "od-bgm-form";
  var rng  = document.createElement("input");
  rng.type = "range"; rng.min = "0"; rng.max = "100"; rng.className = "od-bgm-vol";
  rng.value = String(Math.round(state.vol * 100));
  var note = document.createElement("span");
  note.className = "od-bgm-note";
  note.textContent = "形式层 · 起于静默位 · 判定之外";

  btn.onclick = toggle;
  prev.onclick = function(){ go(-1); };
  next.onclick = function(){ go(1); };
  rng.oninput = function(){
    state.vol = Math.max(0, Math.min(1, parseInt(rng.value, 10) / 100));
    save();
    if (el) el.volume = vol();
  };

  box.appendChild(btn);
  box.appendChild(prev);
  box.appendChild(next);
  box.appendChild(name);
  box.appendChild(time);
  box.appendChild(form);
  box.appendChild(rng);
  box.appendChild(note);
  host.appendChild(box);

  var list = null;
  if (opts.list){
    list = document.createElement("ul");
    list.className = "od-bgm-list";
    TRACKS.forEach(function(t, i){
      var li = document.createElement("li");
      li.className = "od-bgm-item";
      li.setAttribute("data-i", String(i));
      li.innerHTML =
        '<span class="t">' + t.title + '</span>' +
        '<span class="d">' + t.def + '</span>' +
        '<span class="f">' + formText(t.form) + '</span>';
      li.onclick = function(){
        state.idx = i; save();
        if (!state.on) state.on = true;      // 点击即手势，此时才允许出声
        play(); refresh();
      };
      list.appendChild(li);
    });
    host.appendChild(list);
  }

  var inst = { box:box, btn:btn, name:name, time:time, form:form, rng:rng, list:list };
  instances.push(inst);
  if (!timer) timer = setInterval(tick, 250);   // 进度读数独立于渲染循环，省一次 rAF
  refresh();
  return {
    setSoft: function(v){ state.soft = !!v; if (el) el.volume = vol(); refresh(); },
    destroy: function(){ instances = instances.filter(function(x){ return x !== inst; }); }
  };
}

function tick(){
  if (!instances.length) return;
  var a = el, t = track();
  var cur = (a && state.on) ? a.currentTime : 0;
  var dur = (a && isFinite(a.duration)) ? a.duration : NaN;
  instances.forEach(function(x){
    if (x.time) x.time.textContent = state.on ? (fmt(cur) + " / " + fmt(dur)) : "";
  });
  void t;
}

function refresh(){
  var t = track();
  instances.forEach(function(x){
    if (x.btn)  x.btn.textContent = state.on ? "♪ 声轨 · 开" : "♪ 声轨 · 关";
    if (x.btn)  x.btn.className = "od-bgm-toggle" + (state.on ? " on" : "");
    if (x.name) x.name.textContent = t ? t.title : "—";
    if (x.form) x.form.textContent = missing ? "文件缺失 · 未加载"
      : (t ? formText(t.form) : "");
    if (x.rng)  x.rng.value = String(Math.round(state.vol * 100));
    if (x.list){
      Array.prototype.forEach.call(x.list.children, function(li, i){
        li.className = "od-bgm-item" + (i === state.idx ? " cur" : "");
        li.style.opacity = (i === state.idx && state.on) ? "1" : ".72";
      });
    }
  });
}

load();

root.OdBgm = {
  TRACKS:TRACKS, PAIR:PAIR, DEFAULTS:DEFAULTS, SOFTCAP:SOFTCAP,
  mount:mount, toggle:toggle, next:function(){ go(1); }, prev:function(){ go(-1); },
  play:play, stop:stop, refresh:refresh,
  setSoft:function(v){ state.soft = !!v; if (el) el.volume = vol(); refresh(); },
  /* 只给界面读的状态；任何判据都不许引用它 */
  peek:function(){ return { on:state.on, idx:state.idx, vol:vol(), title:(track() || {}).title || "—" }; },
  /* 测试钩子：仅供 test/smoke.mjs 使用，不参与任何作品逻辑 */
  __state:state
};

}(window));
