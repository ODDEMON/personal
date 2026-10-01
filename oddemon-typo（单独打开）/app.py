# -*- coding: utf-8 -*-
"""
=============================================================================
 文字 → 艺术字实时生成器  ·  ODDEMON TYPOGRAPHY GENERATOR
=============================================================================
 ODDEMON：一种个人特色鲜明的反抗精神艺术。与梦核、电波系无关。
-----------------------------------------------------------------------------
 服务端（Python / Gradio）负责：文案神谕、预设调度、落盘、参数导入导出。
 客户端（Canvas 2D + 像素级后处理）负责：全部实时渲染。
 界面语言：中文 / English / Русский / Español / 日本語
-----------------------------------------------------------------------------
 运行：
     python app.py            # http://127.0.0.1:7860
     PORT=8080 python app.py
=============================================================================
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import random
import re
import time

import gradio as gr

HERE = pathlib.Path(__file__).parent.resolve()
ASSETS = HERE / "assets"
OUTDIR = HERE / "outputs"
OUTDIR.mkdir(exist_ok=True)

JS = (ASSETS / "engine.js").read_text(encoding="utf-8")
CSS = (ASSETS / "ui.css").read_text(encoding="utf-8")


# =============================================================================
# 1. 语料：毁灭性文字艺术
# =============================================================================
FRAG_CORE = [
    "是 等 于 否", "一切感动皆自我感动", "我由上帝养大", "深渊即我本体",
    "末日审判", "超级恐惧时代", "全不知全不能者", "第三类虚无主义",
    "glowith / ered", "叙事管理学", "生存-审美学说", "名可名，恒名曰自",
    "只有绝对质变，没有绝对的量变", "爆炸 · 融化 · 误差",
    "感动是不发生冲动时可表达的内容与实际所想之间的差异",
    "钱确实就是命", "认真是对一切错误的彻底否定",
    "唯一的原罪是多", "智慧生命的完整性等价于自身存在的无意义",
]
FRAG_EN = [
    "RIDICULIOUS", "SOCIALLISM CONTROLS THE WORLD", "LOVE=>INSANITY+>LOST IN NEVER LOST",
    "GO IN THE TRUTH OF NOWHERE", "ODDEMON", "ERROR 404: MEANING NOT FOUND",
    "IS EQUAL TO NOT", "MELTDOWN", "BLAST // ERROR // MELTDOWN", "REFUSE THE GIVEN FORM",
]
FRAG_NUM = ["-190754078740", "4671060894715079375", "-777", "0.0000001", "114514", "8", "-∞", "999999999"]
FRAG_DECOR = ["、、、、、", "————**————", "///////", "▓▒░█▓▒░", "════════", "∷∷∷∷∷∷∷", "░░░░░░░░"]
FRAG_END = [
    "醒醒！现在明明无事发生啊", "停下，快停下来！快！", "这一点到为止",
    "证明初步完毕，我不会对此进行完善", "【已归档】", "Q.E.D.",
]

CORPUS = FRAG_CORE + FRAG_EN + FRAG_NUM + FRAG_DECOR + FRAG_END


def make_oracle(seed: int | None = None) -> str:
    """抽取一段乱码神谕。本质，是对于语言失效过程的一次可视化验算。"""
    rng = random.Random(seed if seed is not None else os.urandom(8))
    pool = FRAG_CORE + FRAG_EN
    parts: list[str] = []
    for _ in range(rng.choice([1, 1, 2, 2, 3])):
        s = rng.choice(pool)
        if rng.random() < 0.35:
            s = " ".join(s)                      # 把词与词之间突然拉开
        if rng.random() < 0.30:
            s = f"{s} {rng.choice(FRAG_NUM)}"    # 插入随机负数与长数字串
        parts.append(s)
    if rng.random() < 0.35:
        parts.insert(rng.randrange(len(parts) + 1), rng.choice(FRAG_DECOR))
    if rng.random() < 0.22 and parts:
        parts.append(parts[0])                   # 同一行重复两遍
    if rng.random() < 0.30:
        parts.append(rng.choice(FRAG_END))
    return "\n".join(parts[:5])


# =============================================================================
# 2. 预设（数据源：assets/presets.json，改这个文件即可增删预设）
# =============================================================================
PRESETS: list[dict] = json.loads((ASSETS / "presets.json").read_text(encoding="utf-8"))
PRESET_MAP = {p["name"]: p["params"] for p in PRESETS}


# =============================================================================
# 3. 头部注入（CSS + 数据 + 引擎）
# =============================================================================
HEAD = (
    "<style>\n" + CSS + "\n</style>\n"
    '<script>window.__OD_PRESETS__=' + json.dumps(PRESETS, ensure_ascii=False) + ";</script>\n"
    '<script>window.__OD_CORPUS__=' + json.dumps(CORPUS, ensure_ascii=False) + ";</script>\n"
    "<script>\n" + JS + "\n</script>\n"
)

TITLE = "文字 → 艺术字实时生成器 · ODDEMON"

HEADER_MD = """
# ODDEMON · 文字 → 艺术字实时生成器

> 这不是梦核，不是电波，不是任何一种可以贴在墙上的标签。
> 它是一种个人特色鲜明的反抗精神艺术：**拒绝被给定的形式**。
> 文字的本质，在这里被改写为——对「是等于否」这一等式的一次可视化验算。

说白了：往左上打字，往右下拉滑块，一直拉到你自己有点晕。这就对了。

`空格` 播放/暂停　·　`R` 随机扰动　·　`S` 导出 PNG　·　`L` 低烈度　·　双击画面 = 重新投胎

**界面语言**：中文 / English / Русский / Español / 日本語（在「运行 · RUN」分组里切换）
"""

FOOTER_MD = """
---
*证明初步完毕，我不会对此进行完善。*　·　*实用的好与认真的死，我无时无刻不会不选择前者。*
"""


# =============================================================================
# 4. 服务端逻辑
# =============================================================================
def _slug(text: str, n: int = 18) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "", text or "")[:n]
    return s or "untitled"


def _b64(data_url: str) -> bytes | None:
    m = re.match(r"^data:image/png;base64,(.+)$", (data_url or "").strip(), re.S)
    if not m:
        return None
    return base64.b64decode(m.group(1))


def bridge(params: dict | None = None, text: str | None = None, act: str | None = None) -> str:
    if params is not None:
        return json.dumps({"cmd": "params", "params": params}, ensure_ascii=False)
    if text is not None:
        return json.dumps({"cmd": "text", "value": text}, ensure_ascii=False)
    return json.dumps({"cmd": "act", "value": act}, ensure_ascii=False)


def do_oracle() -> tuple[str, str]:
    txt = make_oracle()
    return bridge(text=txt), f"神谕已抽取：`{txt.splitlines()[0][:28]}`　（共 {len(txt.splitlines())} 行）"


def do_preset(name: str) -> tuple[str, str]:
    p = PRESET_MAP.get(name)
    if not p:
        return bridge(), "未找到该预设。"
    note = next((x["note"] for x in PRESETS if x["name"] == name), "")
    return bridge(params=p), f"预设 **{name}** 已注入。{note}"


def do_save(png_data: str, params_json: str) -> tuple[str | None, str]:
    raw = _b64(png_data)
    if raw is None:
        return None, "⚠ 没有拿到画布数据。请等画面渲染出来（约 1 秒）后再点一次。"
    try:
        p = json.loads(params_json) if params_json else {}
    except Exception:
        p = {}
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = OUTDIR / f"oddemon_{stamp}_{_slug(p.get('text', ''))}.png"
    path.write_bytes(raw)
    return str(path), f"已落盘：`{path.name}`　{len(raw) / 1024:.1f} KB"


def do_export(params_json: str) -> tuple[str | None, str]:
    try:
        p = json.loads(params_json) if params_json else {}
    except Exception:
        p = {}
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = OUTDIR / f"oddemon-params_{stamp}.json"
    path.write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path), "参数已导出。本质上讲，这就是一张可复现的判决书。"


def do_import(file) -> tuple[str, str]:
    if not file:
        return bridge(), "没有文件。"
    try:
        p = json.loads(pathlib.Path(file).read_text(encoding="utf-8"))
    except Exception as e:
        return bridge(), f"解析失败：{e}"
    return bridge(params=p), "参数已导入并应用到画面。"


def do_batch(params_json: str, n: int) -> tuple[str | None, str]:
    """批量变异：在当前参数基础上做 n 次随机扰动，导出为 JSON 序列。"""
    try:
        base = json.loads(params_json) if params_json else {}
    except Exception:
        base = {}
    out = []
    rng = random.Random()
    for _ in range(int(n)):
        v = dict(base)
        for k, val in list(v.items()):
            if isinstance(val, (int, float)) and k not in ("res", "targetFps"):
                v[k] = val * (1 + rng.uniform(-0.35, 0.35))
        out.append(v)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = OUTDIR / f"oddemon-variants_{stamp}.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path), f"已生成 {len(out)} 组变异参数。按需自取。"


# =============================================================================
# 5. 界面
# =============================================================================
with gr.Blocks(title=TITLE) as demo:
    gr.Markdown(HEADER_MD, elem_id="od-header")
    gr.HTML("<div id='od-mount'></div>")

    with gr.Group(elem_id="od-pyzone"):
        gr.Markdown("#### 服务端 · Python 侧（神谕 / 预设 / 落盘 / 参数）")
        with gr.Row():
            oracle_btn = gr.Button("✦ 神谕抽取 · 随机文案", variant="primary")
            preset_dd = gr.Dropdown(
                choices=[p["name"] for p in PRESETS],
                value=PRESETS[0]["name"],
                label="预设（注入整套参数）",
                scale=2,
            )
            low_btn = gr.Button("☾ 低烈度模式（切换）")
            shot_btn = gr.Button("⤓ 落盘 PNG（服务端）")
        with gr.Row():
            export_btn = gr.Button("⇪ 导出参数 JSON")
            batch_n = gr.Number(value=6, precision=0, label="变异数量", minimum=1, maximum=64)
            batch_btn = gr.Button("⇪ 批量变异参数")
            imp = gr.File(label="导入参数 JSON", file_types=[".json"])
        with gr.Row():
            file_out = gr.File(label="产物")
            status = gr.Markdown("等待指令。")

    gr.Markdown(FOOTER_MD, elem_id="od-footer")

    # ---- 桥接（隐藏）----
    bridge_box = gr.Textbox(elem_id="od-bridge", elem_classes=["od-hide"], label="bridge")
    png_box = gr.Textbox(elem_id="od-png", elem_classes=["od-hide"], label="png")
    params_box = gr.Textbox(elem_id="od-params", elem_classes=["od-hide"], label="params")

    oracle_btn.click(do_oracle, outputs=[bridge_box, status])
    preset_dd.change(do_preset, inputs=[preset_dd], outputs=[bridge_box, status])
    low_btn.click(lambda: bridge(act="low"), outputs=[bridge_box, status])
    shot_btn.click(do_save, inputs=[png_box, params_box], outputs=[file_out, status])
    export_btn.click(do_export, inputs=[params_box], outputs=[file_out, status])
    batch_btn.click(do_batch, inputs=[params_box, batch_n], outputs=[file_out, status])
    imp.change(do_import, inputs=[imp], outputs=[bridge_box, status])


def _launch():
    """从首选端口开始找一个空位。端口被占是常态，不是故障。"""
    preferred = int(os.environ.get("PORT", "7860"))
    last: Exception | None = None
    for p in [preferred] + list(range(preferred + 1, preferred + 40)):
        try:
            return demo.launch(
                server_name="127.0.0.1",
                server_port=p,
                head=HEAD,
                allowed_paths=[str(OUTDIR)],
                inbrowser=False,
                show_error=True,
            )
        except OSError as e:
            last = e
            continue
    raise RuntimeError(str(last))


if __name__ == "__main__":
    _launch()
