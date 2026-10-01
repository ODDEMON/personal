# ODDEMON · Text → Generative Typography (Live)

### ODDEMON TYPOGRAPHY GENERATOR

> This is not dreamcore, not denpa, not any label you can stick on a wall.
> It is a **defiant, deeply personal art form**: a refusal of the given form.
> The nature of text, here, is rewritten as — a visual verification of the equation "yes equals no".

A single-page web app that renders any Chinese / English / Japanese / Russian / Spanish text into ODDEMON-style typography in real time. Saturated gradients, neon bloom, channel misalignment, liquefy warp, melt smear, slice tearing, grain, drifting glyph debris, sacred-geometry structures — all computed per pixel by Canvas 2D. **No AI model, no cloud inference**, works offline.

**中文文档：[README.md](README.md)**

---

## ⚠️ Photosensitivity warning — read this before you launch

**This page contains flashing, full-frame inversion and high-saturation visual stimuli.**

- Use caution if you have photosensitive epilepsy, migraine, are pregnant, or are a minor.
- If you feel dizzy, experience visual persistence, nausea or eye strain — **close the tab immediately**.
- Use it in a well-lit room, not fullscreen in the dark, and limit session length.

### Where the flashing actually comes from

| Effect | Parameter | Behaviour |
| --- | --- | --- |
| **Full-frame inversion** | `Glitch burst` | Each frame has a `burst × 3.5%` chance to open a glitch window lasting 0.06–0.22 s; inside it, every frame has a 35% chance to RGB-invert the **entire frame** and add +26 px of channel shift. |
| **Rolling scanlines** | `Scanlines` / `Scan density` | Phase speed ≈ 0.87 Hz; high density produces moiré and apparent jitter. |
| **Drifting glyphs** | `Drifting glyphs` | Up to 90 particles drawn twice per frame, each swapping character with 7% probability per frame. |
| **One-shot flash** | — | A white overlay at α ≤ 0.25 (reduced from 0.5) when you hit Randomize / a preset / Export. Single event, not a strobe. |

### ☾ Low-intensity mode (new)

The **☾ Low-intensity** toolbar button (hotkey `L`, or the checkbox under RUN) applies **hard caps** to a set of high-stimulation parameters — the renderer takes `min(current value, cap)`:

| Parameter | Cap | Parameter | Cap |
| --- | --- | --- | --- |
| Glow | 34 | Glitch burst | **0 (inversion fully disabled)** |
| Bloom | 0.22 | Drifting glyphs | 0.12 |
| RGB shift | 5 | Echo trail | 0.18 |
| Liquefy warp | 7 | Chroma pulse | 0.15 |
| Slice tear | 0.12 | Melt smear | 0.12 |
| Scanlines | 0.12 | Noise | 0.10 |

While active it also **disables full-frame inversion**, **disables the one-shot flash**, dims the geometry line-work by 30% and keeps the CRT overlay low. The structural language of ODDEMON survives — hue, geometry, direction of displacement — it just stops shining into your face.

The built-in preset **“Low-intensity · readable”** gets you there in one click.

### ⏸ About Pause (honest disclosure)

**Pause freezes the timeline `t`, it does not freeze the picture.** Slice tearing, noise, glyph corruption and glitch bursts read `Math.random()` directly and keep changing every frame. For a truly still image, push those parameters to 0 or use Export PNG. Known limitation, intentionally left as-is for now.

---

## Quick start

| Requirement | Version |
| --- | --- |
| Python | 3.10+ |
| Gradio | **6.x** (tested on 6.27.0 / 6.29.0; note that `css` / `head` belong to `launch()`, not `Blocks()`, in 6.x) |
| Node.js | 18+, **only needed to run the smoke test** |

**One-click launcher** (recommended):

```bash
# Windows: double-click start.bat
# macOS / Linux:
chmod +x start.sh && ./start.sh
```

The launcher checks whether your interpreter **already has gradio**. If it does, `app.py` runs with it directly — no virtualenv, no download, nothing reinstalled. A `.venv` is only built when gradio is missing.

**Which Python is used** (first match wins):

| Order | Source |
| --- | --- |
| 1 | `PYTHON_EXE` environment variable |
| 2 | `python.txt` next to the launcher — one line, the full path to `python.exe` |
| 3 | `python` / `python3` on PATH |
| 4 | the Windows `py` launcher |

`python.txt` is a per-machine override and is gitignored.

**Manual**:

```bash
pip install -r requirements.txt   # same as: pip install "gradio>=6,<7"
python app.py                     # http://127.0.0.1:7860
```

```bash
PORT=8080 python app.py            # Linux / macOS
$env:PORT = "8080"; python app.py  # Windows PowerShell
```

If a port is taken the app probes the next 39 — **port drift is by design, not a bug**. The server binds to `127.0.0.1` only. `outputs/` is created on first launch. Python side uses nothing beyond the standard library besides Gradio.

---

## Interface tour

1. **Stage** — live canvas on the left, parameter panel on the right.
2. **Toolbar** — `⏸ Pause (imperfect)` / `⤓ Export PNG` / `✦ Randomize` / `☾ Low-intensity` / `⤢ Focus` / `↺ Reset` / `⛶ Fullscreen`, with live `fps · resolution` on the right.
3. **Preset strip** — 14 chips, hover for a one-line note.
4. **Server side (Python)** — oracle text, preset injection, low-intensity toggle, server-side PNG export, parameter import/export, batch mutation.

### Four ways to enlarge the artwork area (new)

| Method | How | Notes |
| --- | --- | --- |
| **Stage width** | RUN → Stage width, 40–100% | Resizes the stage live; the panel shrinks to match |
| **⤢ Focus mode** | Toolbar button, or RUN → Focus mode | Hides the intro text, the server block and the whole parameter panel; stage takes the full row |
| **Aspect ratio** | RUN → Aspect: 16:9 / 4:3 / 1:1 / 3:4 / 9:16 | Portrait suits posters and phone wallpapers; the canvas is capped at 82% of the viewport height so the page never becomes infinitely long |
| **⛶ Fullscreen** | Toolbar | Browser-level fullscreen |

### Auto-fit text (new)

TEXT → Auto-fit is on by default: the text block is measured every frame and the font size shrinks if it would exceed 92% of the canvas width or 86% of its height, **so long sentences are no longer clipped**. Turn it off for hard typesetting.

### Hotkeys

| Key | Action |
| --- | --- |
| `Space` | Play / pause the timeline (≠ a still frame, see above) |
| `R` | Randomize |
| `S` | Export PNG (browser download) |
| `L` | Toggle low-intensity mode |
| Double-click stage | Same as `R` |

Hotkeys are suppressed while an input has focus.

### Interface language

Three ways to switch, all instant, no reload:

1. the **🌐 toolbar button** — cycles through the five languages;
2. **RUN → UI language** dropdown;
3. the **URL parameter** `#lang=ru` (composable with a preset: `#p=低烈度·可读&lang=en`).

Coverage is the **whole page**, not just the panel: 58 control labels, 6 group names, toolbar buttons, the page header and its intro, the hotkey line, and every button/label in the server block. With no `lang` in the URL the app follows the browser language (falling back to Chinese). Group fold/unfold state survives a language switch. Preset names and notes are data copy and are not translated.

---

## Parameter reference

**6 groups, 58 controls**, collapsible, applied live.

### TEXT
Text · Font (7 families with local fallback chains, no webfonts) · Size 30–280 px · Weight 100–900 · Tracking −30–80 · Line height 0.6–2.2 · Glyph wave 0–40 · Jitter 0–30 · Corruption 0–1 · **Auto-fit (on)** · Align · Italic.

### FIELD
Background: gradient mesh / perspective grid / cloud bands / rainbow bands / void / **sacred geometry** · Hue 0–360° · Hue spread 0–360° · Saturation · Base lightness · Flow speed · Blob count 2–16 · Dust · **Sacred geometry 0–1** · **Structure** · **Structure spin 0–3**.

### Sacred-geometry structures (new)

A line-work layer composited with `lighter`, drawn with a **double stroke** (a 4.5×-wide faint halo plus a thin core line), glowing radial-gradient nodes on key vertices and a breathing scale. Opacity follows the strength parameter; in low-intensity mode the halo drops to 35% and the line-work dims a further 30%:

- **Triangle-star sigil (default)** — reproduces the composition of *THE SEIZED TESTAMENT* from the reference material: **six-fold radial symmetry**, three rings of six long-spiked five-pointed stars nested inward (adjacent rings counter-rotating), spokes and chords binding the outer ring into one body, three nested inverted triangles beneath, and **a contrast-coloured icosahedron wireframe dead centre**. The palette follows the source's two-colour system: structure lines take `hue + 185°`, the central solid takes `hue + 65°` — set the base hue near 355° and you get the original's crimson ground, cyan lines and yellow core (preset **“三角星·被夺走的约书”** reproduces it in one click).
- **Platonic solids** — one large icosahedron spinning at centre, ringed by small wireframes of all five regular polyhedra. Vertices and edges are derived programmatically at init via a minimum-distance threshold — **no hand-written edge tables**.
- **Metatron's cube** — 13 nodes, fully connected (78 lines), plus two rings of six circles.
- **Flower of life** — equal-radius circles on a hexagonal lattice inside an enclosing circle.
- **Mandala rings** — concentric regular polygons from 3 to 12 sides, alternating layers counter-rotating, plus 24 radial spokes.
- **Concentric lattice** — 7 polygons growing outward, neighbours counter-rotating, with dots at the 12 × 7 intersections.

### NEON
Fill: flowing gradient / chrome / prism / solid / outline · Glow 0–240 · Stroke width 0–14 · Stroke hue ±180° · Mirror reflection + fade.

### GLITCH
RGB shift 0–48 px · Chroma pulse · Liquefy warp 0–70 px · Warp frequency · Slice tear / density · Melt smear · Scanlines / density · Noise & grain · Skew ±30° · Glitch burst (⚠ full-frame inversion) · Drifting glyphs / speed.

### POST
Echo trail · Trail zoom −3–3 · Bloom · CRT barrel −0.3–0.3 · Fade · Vignette · Contrast 0.4–2.2.

### RUN
**Low-intensity mode** · **Aspect / Stage width / Focus mode** · Resolution 0.5×–1.4× · Target FPS 10–60 (default **30**; the timestep is `1/targetFps`, so this also sets animation speed) · VHS timecode overlay · **UI language**.

---

## Presets

Presets live in `assets/presets.json` — **edit that file to add or remove them**, no code changes needed. Each entry has `name` / `note` / `params` (a partial override).

Melted Confession · The Fifth Waking · Doomsday Notice · Abyss · Self-Verification · YES EQUALS NO · The Age of Super-Fear · glowith/ered Apparition · The Judgement That Arrives As Praise · -190754078740 · RIDICULIOUS · **Platonic Skeleton** · **Triangle-star Sigil (THE SEIZED TESTAMENT)** · **Metatron's Cube** · **Flower of Life** · **Low-intensity · readable** — 15 in total.

Clicking a chip writes the preset name into the URL hash (`#p=…`), so a refresh re-applies it — currently the only sharing mechanism. Preset names are data copy and do not change with the UI language.

---

## Server side (Python)

| Button | Behaviour |
| --- | --- |
| ✦ Oracle text | Assembles 1–5 lines from the built-in corpus and pushes them to the canvas |
| Preset dropdown | Injects a full parameter set from `presets.json` |
| ☾ Low-intensity toggle | Sends `act=low` to the frontend, same as the toolbar button |
| ⤓ Export PNG | Decodes the canvas dataURL and writes `outputs/oddemon_<timestamp>_<text>.png` |
| ⇪ Export params | Writes `outputs/oddemon-params_<timestamp>.json` |
| ⇪ Batch mutation | N variants of the current params (numeric keys ±35%) into `outputs/oddemon-variants_<timestamp>.json` |
| Import params | Applies an uploaded `.json` immediately |

**Known issue**: the first click of Export PNG may return “no canvas data” — wait about a second and click again; this is an inherent race in the bridge. Batch mutation outputs JSON only; import them one by one to preview.

---

## Render pipeline

```
background (mesh / grid / clouds / rainbow / void / sacred geometry)
  → sacred-geometry structures (lighter line-work, over any background)
  → drifting glyphs (far layer)
  → text layer (own canvas, auto-fit to the safe area)
  → glow (1/3 and 1/8 downsampled, lighter composite)
  → mirror reflection
  → drifting glyphs (near layer)
  → slice tearing
  → per-pixel post  ← single getImageData / putImageData
       liquefy → barrel → melt → RGB channel shift
       → scanlines → noise → fade → contrast → vignette → inversion (disabled in low-intensity)
  → bloom → HUD timecode → echo trail
```

Notable decisions:

- Liquefy is a hand-written `ImageData` displacement sampler, **not** `ctx.filter` + SVG `feTurbulence` (incomplete cross-browser support).
- Displacement fields are precomputed per row/column into `Float32Array`s; the inner pixel loop only does lookups.
- **Every high-stimulation parameter is read through `eff()`**, which clamps to the low-intensity caps — no scattered conditionals.
- Polyhedra vertices/edges are derived at init (minimum-distance method); adding a solid means adding one vertex list.
- Vignette LUT is computed once in `alloc()`; the noise table is a 16384-entry `Int16Array` built at load.
- **Watchdog**: a `setInterval` every 220 ms drives a frame manually if rAF has not fired for 380 ms (headless captures, throttled background tabs).
- The frontend mounts as a **sibling node** of the `gr.HTML` component, so a Gradio re-render cannot wipe it.
- **Panel colours are self-contained** and explicitly override Gradio's default label/button styles — this is the root-cause fix for “the control labels are unreadable”.

---

## Layout

```
oddemon-typo/
├── app.py          Gradio server: oracle corpus / presets / export / params I/O
├── assets/
│   ├── engine.js   client render engine (effects + i18n + layout)
│   ├── ui.css      UI styles (.od-* scope, self-contained high-contrast palette)
│   └── presets.json  14 presets
├── outputs/        generated artefacts
├── test/smoke.mjs  headless smoke test
├── README.md       Chinese docs
└── README_EN.md    this file
```

CSS and JS are read by `app.py` at startup and injected via `demo.launch(head=...)` — **restart `python app.py` after editing anything in `assets/`**.

---

## Tests

```bash
node test/smoke.mjs
```

jsdom + a mocked 2D context run the whole pipeline. The goal is **not** pixel validation but catching runtime errors. Currently covers: mount, canvas, 14 presets, 29 extreme parameter sets (all geometry types, all aspects, low-intensity with everything maxed), **all 5 UI languages** (checks for missing i18n keys), aspect switching (9:16 → 540×960), all three bridge commands, and the write-back of PNG dataURL + params JSON. Exit code 0 = all green.

---

## Known limitations

1. **Pause is not a still frame** (see above) — intentionally deferred.
2. **Randomness is not reproducible** — everything uses `Math.random()`; no seeded PRNG. Params JSON reproduces the configuration, not the per-frame randomness.
3. **No devicePixelRatio handling** — the canvas is `base size × res` and CSS-scaled; previews are soft on retina displays.
4. **No preview/export quality split** — export resolution equals the current rendering precision.
5. **URL sharing only carries a preset name**, not custom parameters.
6. **Batch mutation outputs JSON only**, not images.
7. **`window.__OD_CORPUS__` is injected but unused on the frontend**; text randomisation is server-side.
8. **Low-intensity is a client-side cap**, not a measured flash-frequency clamp; there is no `prefers-reduced-motion` auto-detection — enabling it is the user's decision.
9. **Preset names/notes are not translated** (data copy).
10. **Focus mode hides the server block** — exit it before using server-side export.

### Verification status

- ✅ Parameter ranges, defaults, pipeline, layout, hotkeys, server behaviour, presets — verified line by line against the code.
- ✅ Low-intensity caps, the five geometry structures, aspect switching, language switching — verified automatically by `test/smoke.mjs`.
- ✅ The repo has been run for real on Gradio 6.27.0 + Python 3.13 and inspected via headless-Chrome screenshots.
- ⚠️ Flash-frequency figures remain a qualitative judgement, not a measured luminance profile.

---

## Browser support

| Browser | Expected | Basis |
| --- | --- | --- |
| Chrome / Edge 90+ | ✅ good | Canvas 2D / ImageData / closest() / aspect-ratio / requestFullscreen |
| Firefox 90+ | ✅ good | same |
| Safari 15+ | ⚠️ usable | `willReadFrequently` may be ignored; per-pixel post is slower |
| IE / legacy Edge | ❌ no | relies on `Object.assign`, `closest`, CSS custom properties |

- Fonts use **system fallback chains** only — no CDN, no webfonts, works offline.
- Russian and Spanish UI copy relies on system Cyrillic/Latin fonts present on any modern OS.
- For Chinese text, install `Microsoft YaHei` / `PingFang SC` / `Noto Sans SC`; for the serif families, `SimSun` / `Songti SC`. On Linux, install the Noto CJK family.
