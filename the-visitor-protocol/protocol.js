/*
  来访者协议 · The Visitor Protocol
  ---------------------------------------------------------------------------
  一个形式化的否定演算系统。
  本次的目标：在语言体系内部，彻底否定普世价值的终极地位。
  ---------------------------------------------------------------------------
  方法论（不是立场，是机制）：
  1. 全称量词不是特殊性更少的量词，它只是另一种量词；
  2. 名可名，恒名曰自——所谓普世之名只是某一字符集里的一个字符串；
  3. 是、否、拒绝、默认四值等价，所谓终极只是把「默认」误认为「是」；
  4. 最后，本协议自身的断言同样被本协议否定——否则它只是换了一个新终极。
  ---------------------------------------------------------------------------
  所有变换都在浏览器内完成，不发送任何数据，不调用任何外部服务。
*/

(function (root) {
"use strict";

/* =========================================================================
   归档协议：与总台互认案件编号与种子
   -------------------------------------------------------------------------
   总台把 #case 与 #seed 写进链接，本作读出来、写进证明；
   结束时把全称性与完整性塞回 #rec 交还总台。全程只走 URL，不落任何存储。
   本作的选择分支由输入串的形式属性决定，种子仅用于与总台互认。
   ========================================================================= */
const ARC = (function () {
  const q = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  return {
    case: q.get("case") || "",
    seed: q.get("seed") || "",
    back(proj, verdict) {
      location.href = "../index.html#rec="
        + encodeURIComponent([proj, this.case || "-", verdict].join("~"));
    }
  };
})();
root.ARC = ARC;

/* =========================================================================
   声明式表：改数据不改代码
   ========================================================================= */

// 全称量词表：宣称普遍有效的词 → 它的对应否定
const QUANT = [
  ["一切", "什么也不"], ["所有", "无"], ["每个", "没有一个"], ["任何人", "无人"],
  ["人人", "无人"], ["永远", "从不"], ["始终", "从未"], ["必须", "不必"],
  ["应当", "不该"], ["应该", "不该"], ["普遍", "个别的"], ["普世", "某一处的"],
  ["绝对", "相对的"], ["必然", "偶然"], ["任何", "某个"], ["皆", "概不"],
  ["均", "参差"], ["全体", "空集"], ["总是", "有时不"], ["无一例外", "仅此一例"],
  ["普适", "适用一次的"], ["普天之下", "此屋之内"],
  ["universal", "local"], ["all", "none"], ["every", "scarcely any"],
  ["always", "never"], ["must", "need not"], ["total", "partial"]
];

// 价值名词表：常被宣称普世的那类词
const VALUES = [
  "自由", "平等", "正义", "人权", "尊严", "真理", "善良", "公正",
  "道德", "和平", "幸福", "权利", "意义", "价值", "爱", "希望"
];

// 反义表
const ANTI = [
  ["是", "否"], ["等于", "不等于"], ["有", "无"], ["能", "不能"], ["会", "不会"],
  ["要", "不要"], ["好", "坏"], ["真", "假"], ["生", "死"], ["存在", "不存在"],
  ["一切", "什么也不"], ["意义", "无意义"], ["希望", "绝望"], ["爱", "漠然"],
  ["感动", "自我感动"], ["认真", "对一切错误的彻底否定"], ["完整", "自身存在的无意义"],
  ["自由", "必然"], ["快乐", "痛苦"], ["永远", "从不"], ["我", "非我"],
  ["多", "唯一的原罪"], ["命", "钱"], ["命名", "归档"], ["必然", "偶然"],
  ["真理", "等价于无意义的真理"], ["正义", "正义的陈述"]
];

const DECOR = ["、", "／", "░", "▒", "∷", "——"];
const REFUSAL = ["（已拒绝）", "（未选择）", "（待定）", "（无回答）"];
const ENDINGS = [
  "证明初步完毕，我不会对此进行完善。",
  "这一点到为止。",
  "Q.E.D.",
  "【已归档】",
  "醒醒！现在明明无事发生啊。"
];

// 本协议自身的断言。最后一门会把它交出去，让它也走一遍同样的程序。
const SELF_THEOREM = "在语言体系内，终极这一位置始终等待着意义来填。";
const SELF_THEOREM_EN = "THE TERMINAL POSITION STANDS EMPTY.";

/* =========================================================================
   工具
   ========================================================================= */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
function chars(s) { return [...s]; }

// 软上限：算子可能让文本膨胀（码位展开、重复嵌入），截断以免界面失控
function clamp(s, max) {
  const c = chars(s);
  return c.length <= max ? s : c.slice(0, max).join("") + "…";
}

function entropy(s) {
  const map = new Map();
  const c = chars(s);
  c.forEach(ch => map.set(ch, (map.get(ch) || 0) + 1));
  let e = 0;
  const len = c.length || 1;
  map.forEach(n => { const p = n / len; e -= p * Math.log2(p); });
  return len === 0 ? 0 : e;
}

function integrity(original, current) {
  const o = chars(original).filter(c => c.trim()).length || 1;
  const c = chars(current).filter(c => c.trim()).length;
  return Math.max(0, Math.min(1, c / o));
}

// 全称性：串里还剩多少个宣称普遍有效的词
function universality(s) {
  let n = 0;
  QUANT.forEach(([a]) => {
    let i = 0;
    while ((i = s.indexOf(a, i)) !== -1) { n++; i += a.length; }
  });
  return n;
}

function replaceAll(s, table) {
  let out = s;
  table.forEach(([a, b]) => { out = out.split(a).join(b); });
  return out;
}

function toCodepoints(s, max) {
  const c = chars(s).filter(x => x.trim()).slice(0, max);
  return c.map(x => "U+" + x.codePointAt(0).toString(16).toUpperCase()).join(" ");
}

function antiReplace(s, seed) {
  const r = rng(seed);
  const pairs = ANTI.slice().sort(() => r() - 0.5);
  for (const [a, b] of pairs) {
    if (s.includes(a)) return { text: s.replace(a, b), note: "反义替换：" + a + " → " + b };
  }
  return { text: s, note: "此项留在原地：清单里的对子都对不上号。" };
}

function shuffle(s, seed) {
  const r = rng(seed);
  const a = chars(s).filter(c => c.trim());
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join("");
}

/* =========================================================================
   六道门
   ========================================================================= */

const GATES = [
  {
    id: "quant",
    name: "全称 · QUANT",
    prompt: "哪些词在宣称自己的普遍有效？",
    theorem: "全称量词不是特殊性更少的量词，它只是另一种量词。它的终极地位来自它被重复的次数，而不是它的形式。",
    choices: [
      {
        id: "collapse", label: "收拢",
        op: (s) => {
          // 跑两遍：第一遍的替换产物里若残留量词，第二遍清掉
          const t = replaceAll(replaceAll(s, QUANT), QUANT);
          return { text: t, note: t === s ? "串内全称词缺席——它走的是别的一条路，与宣称普遍是两回事。" : "全称词被替换为各自的对应否定。全称性下降。" };
        }
      },
      {
        id: "count", label: "计数",
        op: (s) => {
          let out = s, n = 0;
          QUANT.forEach(([a]) => {
            if (out.includes(a)) { out = out.split(a).join("【" + a + "】"); n++; }
          });
          return { text: out, note: `标出 ${n} 个全称词。它们是可数的——凡可数者，皆远离终极。` };
        }
      },
      {
        id: "locate", label: "处所化",
        op: (s) => {
          let out = s;
          QUANT.forEach(([a]) => { out = out.split(a).join("在某一处的"); });
          return { text: out, note: "每个全称词都被安放了一个处所。凡有处所者，皆非普世。" };
        }
      }
    ]
  },

  {
    id: "name",
    name: "常名 · NAME",
    prompt: "为这些价值重新命名。",
    theorem: "名可名，恒名曰自。所谓普世之名，只是某一字符集里的一个字符串；它的身体随语言更换。",
    choices: [
      {
        id: "split", label: "拆名",
        op: (s) => {
          let out = s, hit = false;
          VALUES.forEach(v => {
            if (out.includes(v)) { out = out.split(v).join(chars(v).join("／")); hit = true; }
          });
          if (!hit) out = chars(s).filter(c => c.trim()).join("／");
          return { text: out, note: hit ? "价值词被拆成构成字符。整体只是部分的暂时排列。" : "整句被拆成字符。命名的最小单位不是词，是字符。" };
        }
      },
      {
        id: "codepoint", label: "码位",
        op: (s) => {
          const t = toCodepoints(s, 26);
          return { text: t, note: "名字被还原为码位。它在不同语言里换着身体住，编号是唯一留下来的东西。" };
        }
      },
      {
        id: "number", label: "去名",
        op: (s) => {
          let out = s, n = 0;
          VALUES.forEach(v => {
            if (out.includes(v)) { n++; out = out.split(v).join("第" + n + "号价值"); }
          });
          return { text: out, note: n ? `${n} 个价值词被替换为编号。编号只登记位置，意义与普遍都不在它的职责里。` : "串内价值词缺席，去名这一手悬着。" };
        }
      }
    ]
  },

  {
    id: "four",
    name: "四值 · FOUR",
    prompt: "这个命题属于哪一种判断？",
    theorem: "意识由是、否、拒绝、默认四值构成。所谓终极价值，只是把「默认」误认为「是」。",
    choices: [
      {
        id: "yes2no", label: "是为否",
        op: (s) => ({ text: s.split("是").join("否"), note: "「是」被写成「否」。若二者可互换，「是」与终极之间就隔了一层。" })
      },
      {
        id: "default", label: "标注默认",
        op: (s) => ({ text: s + "（默认）", note: "「（默认）」被追加。凡需标注者，皆非自明。" })
      },
      {
        id: "refuse", label: "拒绝",
        op: (s, ctx) => {
          const r = rng(ctx.seed);
          const t = s + pick(REFUSAL, r);
          return { text: t, note: "拒绝被追加。拒绝对默认落在否定那一极——旧的被取消，新的由它替不出来。" };
        }
      }
    ]
  },

  {
    id: "default",
    name: "默认 · DEFAULT",
    prompt: "它凭什么是默认的？",
    theorem: "默认之所以为默认，正因为它绕开了选择这一关，必然这一说法在此缺少落点。任何默认都可以被重新设为非默认。",
    choices: [
      {
        id: "reset", label: "重设",
        op: (s) => {
          const c = chars(s);
          return { text: c.reverse().join(""), note: "默认的位置被颠倒。位置一变，默认的效力即消失。" };
        }
      },
      {
        id: "deprive", label: "抽掉系词",
        op: (s) => {
          const t = s.replace(/[是为乃即系]/g, "");
          return { text: t.length ? t : "（系词本就缺席）", note: "系词被抽掉。命题丢了系词，宣称这回事随之落空。" };
        }
      },
      {
        id: "mark", label: "逐字标注",
        op: (s) => {
          const t = chars(s).map(c => c.trim() ? c + "（留白）" : c).join("");
          return { text: clamp(t, 240), note: "每个字都被标注为留白。留白者与终极之间隔着一层。" };
        }
      }
    ]
  },

  {
    id: "refuse",
    name: "拒绝 · REFUSE",
    prompt: "你拒绝哪一层的默认？",
    theorem: "拒绝对默认落在否定那一侧。它取消旧的终极，新的那一份替不出来——拒绝只做取消这一件事。",
    choices: [
      {
        id: "syntax", label: "拒绝句法",
        op: (s, ctx) => ({ text: shuffle(s, ctx.seed), note: "字符顺序被打乱。句法被拒绝后，命题就此散架。" })
      },
      {
        id: "lexis", label: "拒绝词汇",
        op: (s) => ({ text: s.replace(/[一-龥]/g, "▓"), note: "全部汉字被涂黑。失去词汇的命题只剩长度。" })
      },
      {
        id: "whole", label: "拒绝整句",
        op: (s) => ({ text: chars(s).filter(c => c.trim()).map(() => "×").join(""), note: "整句被替换为等长的否定记号。形式保留，主张归零。" })
      }
    ]
  },

  {
    id: "self",
    name: "自指 · SELF",
    prompt: "本协议自身的断言，是否也适用于本协议？",
    theorem: "若「终极这一位置始终空着」为真，则该断言自己也落进同一种空。回到这一问题本身，等于对自指再自指一次。",
    choices: [
      {
        id: "apply", label: "施于自身",
        op: (s) => {
          const applied = replaceAll(SELF_THEOREM, ANTI);
          return {
            text: clamp(s + "　‖　" + SELF_THEOREM + " → " + applied, 300),
            note: "协议定理被施加于自身并被反义替换。自指完成。"
          };
        }
      },
      {
        id: "suspend", label: "悬置",
        op: (s) => ({
          text: clamp(s + "　‖　（" + SELF_THEOREM_EN + "）", 300),
          note: "定理被括起并标注为待定。悬置与否认隔着一层：它拒绝让定理落地成为新的终极。"
        })
      },
      {
        id: "recurse", label: "递归嵌入",
        op: (s) => ({
          text: clamp(s.slice(0, 120) + "（" + s.slice(0, 60) + "（" + SELF_THEOREM + "）" + "）", 300),
          note: "当前文本被嵌入自身，定理置于最内层。递归一路向下，终点这一站始终排不上日程。"
        })
      }
    ]
  }
];

/* =========================================================================
   终态与证明
   ========================================================================= */

function finalState(input, log) {
  const last = log[log.length - 1];
  const current = last ? last.text : input;
  const int = integrity(input, current);
  const uni = universality(current);
  const r = rng(hash(input));
  const ending = pick(ENDINGS, r);

  let verdict;
  if (uni === 0 && int === 0) {
    verdict = "全称性归零，完整性归零。终极那一把椅子始终空着——连同本句在内。";
  } else if (uni === 0) {
    verdict = "全称性归零。串内宣称普遍有效的词已经散尽，形式尚有残留。";
  } else {
    verdict = `全称性尚余 ${uni}。否定还在路上，仍有词在宣称普遍。`;
  }

  return {
    text: `${current}\n\n${verdict}\n${ending}`,
    metrics: {
      integrity: int,
      universality: uni,
      entropy: entropy(current),
      steps: log.length
    }
  };
}

function buildCertificate(input, log) {
  const f = finalState(input, log);
  const lines = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "来访者协议 · 归档证明",
    "THE VISITOR PROTOCOL · CERTIFICATE",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "案件编号：" + (ARC.case || ("V-" + Date.now().toString(36).toUpperCase())),
    "总台种子：" + (ARC.seed || "—") + "　（本作分支由输入串的形式属性决定，种子仅用于互认）",
    "献词原句：" + input,
    "最终形态：" + (f.metrics.integrity === 0 ? "（留白）" : f.text.split("\n")[0]),
    "",
    "全称性：" + f.metrics.universality + "　（串内剩余宣称普遍有效的词数）",
    "完整性：" + (f.metrics.integrity * 100).toFixed(1) + "%",
    "字符熵：" + f.metrics.entropy.toFixed(2),
    "步数：" + f.metrics.steps,
    "",
    "运算记录："
  ];
  log.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.gateName} · ${e.choiceLabel} → ${e.note}`);
  });
  lines.push("");
  lines.push("声轨层：" + (root.OdBgm ? root.OdBgm.peek().title : "—")
    + " · 全程在场，另行记账。");
  lines.push("");
  lines.push("自指条款：本协议自身的断言已被本协议否定。");
  lines.push("　　　　　若这句断言安然走完全程，本协议只是换了一把新椅子。");
  lines.push("");
  lines.push("说明：本证明仅在当前浏览器窗口内有效。关闭标签页即销毁。");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

root.VisitorProtocol = {
  GATES, QUANT, VALUES, ANTI, DECOR,
  SELF_THEOREM, ARC,
  hash, entropy, integrity, universality,
  finalState, buildCertificate
};

}(window));
