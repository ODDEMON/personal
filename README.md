# ODDEMON · 四件离线玩具

四个可离线运行的小作品。共同规则：**不联网、不上传、无后端、不收集任何数据**。
否定施加于符号，不施加于人；全过程可审计，不掩饰。

| 目录 | 名字 | 怎么跑 |
| --- | --- | --- |
| [`game/`](game/) | 羊肠小道 · 否定版 | 双击 `index.html` |
| [`proof/`](proof/) | 是 等于 否 · 验算器 | 双击 `index.html` |
| [`the-visitor-protocol/`](the-visitor-protocol/) | 来访者协议 v1.2 | 双击 `index.html` |
| [`oddemon-typo/`](oddemon-typo/) | ODDEMON 艺术字生成器 | `start.bat` / `start.sh` |
| [`反演设计法/`](反演设计法/) | 通用规律提示词 | 直接读（`.md`） |

---

## 一、总台与归档协议

根目录的 `index.html` 不只是目录页，它是**总台**：发号、收档、然后在三份回执都到齐时给一句总判。

1. **编号与种子同源。** `CASE = OD-<seed 的 36 进制>`。编号不是外部赋予的身份，只是种子的另一种写法，反过来能解回同一个种子。
2. **下发。** 点进任一作品，链接自带 `#case` 与 `#seed`。作品读出来、写进自己的证明——三份证明因此在同一编号下可互相复算。
3. **回收。** 作品结束时点「⤤ 归档至总台」，把一句判词摘要塞回 `#rec` 交还总台。总台只收摘要，不收全文。
4. **自指。** 三份齐了才出总判，而总判正文**已按本协议第六门处理**——你读到的是否定之后的残留，不是结论。本页若把「不生产结论」当成结论，那句话同样已被处理。

全程只走 URL，不落任何存储；卷宗另存一份到浏览器本地存储以便刷新后还在，`file://` 下若被禁用则退回「仅本次会话有效」，页面里如实写明。

键盘 `1` `2` `3` 可直达三件作品。

**协议之外**另有一栏：`oddemon-typo`。介绍与引用照给，但**不发号、不收档**——它跑在一个本地服务里，本页递不到编号。总台只收能在同一编号下互相复算的证明，这不是把谁排除在外，是一条边界，写在界面上而不是藏在代码里。

## 二、三个纯静态作品：下载后直接打开

`game/`、`proof/`、`the-visitor-protocol/` 三个作品**不需要任何安装**：

1. 下载并解压
2. 双击 `index.html`（或拖进浏览器）

它们不使用 ES 模块、`fetch`、CDN 或任何构建步骤，因此 `file://` 协议下也能完整运行。
也可以直接开 GitHub Pages：仓库根目录的 `index.html` 就是总台入口。

单独打开也能跑——只是没有总台编号，作品会自己临时造一个（`P-` / `V-` 开头）。这不影响任何机制，只是那份证明不再与别的证明互认。

- `game/` —— 鼠标控一点走羊肠小道，撞墙的代价不是重来，而是**命题被改写一次**并退回存档点。六道逐道收窄，通关只给一张证明。
- `proof/` —— 输入一句话，交给否定算子一路推到不动点。同种子必得同结果，可复现；`seed` 写在界面上，可自行核对。
- `the-visitor-protocol/` —— 六道门，每门三个选择。**选择只决定否定的形式，不改变否定本身**。最后一门把协议自己的断言交出去被否定，否则它会变成新的终极。

## 三、oddemon-typo：一键启动

这是唯一需要 Python 的一个（Gradio 只用来起一个本地服务，渲染全在浏览器端完成）。

要求：**Python 3.10+**，且装有 gradio。若解释器里已经有 gradio，启动器**直接跑 `app.py`**——不建虚拟环境、不下载、不重装；没有才会建 `.venv` 装一次。

```bash
# Windows
#   双击 start.bat

# macOS / Linux
chmod +x start.sh && ./start.sh
```

**用哪个 Python**（命中即止）：`PYTHON_EXE` 环境变量 → 同目录 `python.txt`（一行完整路径）→ PATH 上的 `python` → Windows `py`。
`python.txt` 是本机覆盖项，已 gitignore。PATH 上混杂了多个 Python（比如 msys64 那个）时，写这个文件或设环境变量即可钉死。

也可以手动：

```bash
cd oddemon-typo
python -c "import gradio"                    # 有输出即已装好，直接下一步
python app.py                                # 否则先 pip install -r requirements.txt
```

启动后打开 <http://127.0.0.1:7860>。端口被占用时会自动顺延到 7861、7862……（也可自行指定：`PORT=8080 python app.py`）。

依赖只有一个：`gradio>=6,<7`（见 `oddemon-typo/requirements.txt`，实测 6.27.0 / 6.29.0）。

## 四、冒烟测试（可选）

运行作品本身**不需要** Node.js；只有跑测试时才需要（Node 18+）。

```bash
npm install        # 只装 jsdom，一次性
npm test           # 总台 + 四个作品全跑
python run-tests.py hub     # 或只跑其中一个（hub / game / proof / …）
```

当前：总台 33 · game 27 · proof 18 · visitor 259 · typo 全套，共 365 项断言全绿。

jsdom 跑在仓库根目录的 `node_modules/`，各项目的 `test/smoke.mjs` 用 `createRequire(import.meta.url)` 向上查找，不依赖任何绝对路径——换机器照样通过。

## 五、仓库里不会出现的东西

`.gitignore` 已排除：

- `.workbuddy/` —— 本机工作区记忆，属私人内容
- `python.txt`、`.vscode/` —— 本机解释器选择（本机指向 `E:\PPPYYYTTTHHHOOONNN3.12\python.exe`，换机器各写各的）
- `__pycache__/`、`.venv/` —— Python 中间产物
- `oddemon-typo/outputs/*` —— 运行落盘的图片与参数（目录本身保留，程序会自动重建）
- `node_modules/` —— 测试依赖

也就是说，克隆下来就是干净的源码，不含本机痕迹。

## 六、如果打不开

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击 HTML 没反应 | 关联到了别的东西 | 右键 → 打开方式 → 选浏览器 |
| `start.bat` 一闪而过 | 没装 Python，或没勾 "Add python.exe to PATH" | 重装 Python 并勾选该项 |
| `pip install` 超时 | 网络问题 | 换源：`pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple` |
| 7860 打不开 | 端口被占 | 看启动窗口实际打印的端口号（会自动顺延） |
