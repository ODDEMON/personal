/* =============================================================================
 *  ODDEMON  TYPOGRAPHY ENGINE
 *  「文字 → 艺术字」实时生成器 · 客户端渲染核心
 *  ---------------------------------------------------------------------------
 *  管线： 背景层（含神圣几何结构体）→ 文字层 → 泛光 → 漂浮乱码 → 切片撕裂
 *        → 像素级后处理（通道错位 / 液化 / 融化 / 桶形 / 扫描线 / 噪点 / 做旧 / 暗角）
 *        → Bloom → HUD → 回声拖影
 *  多语言： zh / en / ru / es / ja
 * ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ 常量 */
  var ASPECTS = {
    "16:9": [960, 540],
    "4:3": [960, 720],
    "1:1": [800, 800],
    "3:4": [720, 960],
    "9:16": [540, 960],
  };

  var GLYPH_POOL =
    "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" +
    "▓▒░█▄▀◆◇○●×÷±≠∞≡⌁⟁⟟⧉" + "、、、·—／＼｜";

  var FONTS = {
    impact: '"Impact","Haettenschweiler","Franklin Gothic Bold","Arial Black","Microsoft YaHei",sans-serif',
    black: '"Arial Black","Helvetica Neue","Impact","Microsoft YaHei",sans-serif',
    gothic: '"MS Gothic","MS PGothic","Osaka-mono","Yu Gothic","Microsoft YaHei",monospace',
    mono: '"Consolas","Menlo","Courier New",monospace',
    serif: '"Georgia","Times New Roman","Songti SC",serif',
    cjk: '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif',
    song: '"SimSun","Songti SC","Noto Serif SC","STSong",serif',
  };

  var NOISE_N = 1 << 14, NOISE_M = NOISE_N - 1;
  var NOISE = new Int16Array(NOISE_N);
  for (var i0 = 0; i0 < NOISE_N; i0++) NOISE[i0] = ((Math.random() * 2 - 1) * 127) | 0;

  /* ------------------------------------------------------------- 参数默认 */
  var DEFAULTS = {
    text: "Please Enter Text...",
    fontKey: "impact",
    fontSize: 132,
    weight: 900,
    tracking: 6,
    lineHeight: 1.02,
    align: "center",
    italic: false,
    wave: 4,
    jitter: 3,
    corrupt: 0.18,
    autoFit: true,

    bgMode: "mesh",
    hue: 292,
    spread: 130,
    sat: 1.0,
    lumi: 0.55,
    bgSpeed: 0.8,
    blobs: 7,
    dust: 0.3,
    geo: 0.35,
    geoType: "tristar",
    geoSpin: 0.6,

    fillMode: "gradient",
    glow: 55,
    strokeW: 1.5,
    strokeHue: 40,
    mirror: true,
    mirrorA: 0.24,

    rgbShift: 7,
    chromaPulse: 0.4,
    warp: 11,
    warpFreq: 0.013,
    slice: 0.3,
    sliceN: 14,
    melt: 0.2,
    scan: 0.22,
    scanFreq: 3,
    noise: 0.16,
    skew: 0,
    burst: 0.04,
    glyphs: 0.35,
    glyphSpeed: 1.0,

    echo: 0.25,
    zoomTrail: 0.4,
    bloom: 0.32,
    barrel: 0.07,
    fade: 0.14,
    vignette: 0.45,
    contrast: 1.12,

    lowPower: false,
    playing: true,
    res: 1,
    targetFps: 30,
    hud: false,
    aspect: "16:9",
    stageW: 68,
    zen: false,
    uiLang: "zh",
  };

  /* 低烈度模式：对每一项设一个上限，渲染时取 min(当前值, 上限) */
  var LOWCAP = {
    glow: 34, bloom: 0.22, rgbShift: 5, chromaPulse: 0.15, warp: 7, warpFreq: 0.012,
    slice: 0.12, sliceN: 8, melt: 0.12, scan: 0.12, scanFreq: 3, noise: 0.1,
    jitter: 2, burst: 0, glyphs: 0.12, echo: 0.18, zoomTrail: 0.2, contrast: 1.08,
    fade: 0.3, vignette: 0.4,
  };
  function eff(k) {
    var v = state[k];
    if (state.lowPower && LOWCAP[k] !== undefined && typeof v === "number") {
      return Math.min(v, LOWCAP[k]);
    }
    return v;
  }

  var state = Object.assign({}, DEFAULTS);

  /* ------------------------------------------------------------------ 工具 */
  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    return "hsla(" + h.toFixed(1) + "," + s.toFixed(1) + "%," + l.toFixed(1) + "%," + (a === undefined ? 1 : a) + ")";
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function hash2(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }
  function rndGlyph() { return GLYPH_POOL.charAt((Math.random() * GLYPH_POOL.length) | 0); }
  function mk(w, h, freq) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return { c: c, x: c.getContext("2d", freq ? { willReadFrequently: true } : undefined) };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* =====================================================================
   *  多语言
   * ===================================================================== */
  var I18N = {
    zh: {
      g_text: "文本 · TEXT", g_field: "基调 · FIELD", g_neon: "霓虹 · NEON",
      g_glitch: "故障 · GLITCH", g_post: "后处理 · POST", g_run: "运行 · RUN",
      l_text: "文字内容", l_fontKey: "字体", l_fontSize: "字号", l_weight: "字重",
      l_tracking: "字距", l_lineHeight: "行高", l_wave: "字形波动", l_jitter: "字位抖动",
      l_corrupt: "乱码替换率", l_align: "对齐", l_italic: "斜体", l_autoFit: "文字自动缩放",
      l_bgMode: "底色模式", l_hue: "主色相", l_spread: "色彩跨度", l_sat: "饱和度",
      l_lumi: "底光明度", l_bgSpeed: "流动速度", l_blobs: "雾团数量", l_dust: "尘埃粒子",
      l_geo: "神圣几何强度", l_geoType: "几何结构", l_geoSpin: "几何旋转",
      l_fillMode: "填充", l_glow: "泛光强度", l_strokeW: "描边宽度", l_strokeHue: "描边色偏",
      l_mirror: "镜像倒影", l_mirrorA: "倒影浓度",
      l_rgbShift: "通道错位", l_chromaPulse: "错位脉冲", l_warp: "液化扭曲",
      l_warpFreq: "扭曲频率", l_slice: "切片撕裂", l_sliceN: "切片密度", l_melt: "融化拖曳",
      l_scan: "扫描线", l_scanFreq: "扫描密度", l_noise: "噪点做旧", l_skew: "几何失衡",
      l_burst: "故障爆发", l_glyphs: "漂浮乱码", l_glyphSpeed: "乱码速度",
      l_echo: "回声拖影", l_zoomTrail: "拖影缩放", l_bloom: "Bloom 溢光", l_barrel: "CRT 桶形",
      l_fade: "褪色做旧", l_vignette: "暗角", l_contrast: "对比度",
      l_res: "渲染精度", l_targetFps: "目标帧率", l_hud: "VHS 时间码叠加",
      l_uiLang: "界面语言", l_aspect: "画幅比例", l_stageW: "画面占比", l_zen: "沉浸模式",
      l_lowPower: "低烈度模式（压住强光与频闪）",
      o_impact: "IMPACT 冲击", o_black: "ARIAL BLACK 厚重", o_gothic: "MS ゴシック 黑体",
      o_mono: "等宽 MONO", o_serif: "衬线 SERIF", o_cjk: "中文黑体", o_song: "中文宋体",
      o_mesh: "渐变雾团", o_grid: "透视网格", o_cloud: "云层", o_rainbow: "虹彩带",
      o_void: "虚空", o_geo: "神圣几何",
      o_gradient: "流动渐变", o_chrome: "铬合金", o_prism: "棱镜分色", o_solid: "纯色", o_outline: "描边",
      o_center: "居中", o_left: "左", o_right: "右",
      o_tristar: "三角星组合", o_flower: "生命之花", o_metatron: "梅塔特隆立方", o_platonic: "正多面体线框",
      o_mandala: "曼陀罗环", o_lattice: "同心多边形",
      o_low: "低 0.5×", o_mid: "中 0.75×", o_high: "高 1.0×", o_ultra: "超 1.4×",
      o_ar169: "16:9 横幅", o_ar43: "4:3 传统", o_ar11: "1:1 方形", o_ar34: "3:4 竖幅", o_ar916: "9:16 竖屏",
      b_play: "▶ 播放", b_pause: "⏸ 暂停（已知不完善）", b_shot: "⤓ 导出 PNG",
      b_rand: "✦ 随机扰动", b_reset: "↺ 重置", b_full: "⛶ 全屏",
      b_low: "☾ 低烈度", b_zen: "⤢ 沉浸",
      m_live: "ODDEMON · LIVE", m_low_on: "低烈度已开启",
    },
    en: {
      g_text: "TEXT", g_field: "FIELD", g_neon: "NEON",
      g_glitch: "GLITCH", g_post: "POST", g_run: "RUN",
      l_text: "Text", l_fontKey: "Font", l_fontSize: "Size", l_weight: "Weight",
      l_tracking: "Tracking", l_lineHeight: "Line height", l_wave: "Glyph wave", l_jitter: "Jitter",
      l_corrupt: "Corruption", l_align: "Align", l_italic: "Italic", l_autoFit: "Auto-fit text",
      l_bgMode: "Background", l_hue: "Hue", l_spread: "Hue spread", l_sat: "Saturation",
      l_lumi: "Base lightness", l_bgSpeed: "Flow speed", l_blobs: "Blob count", l_dust: "Dust",
      l_geo: "Sacred geometry", l_geoType: "Structure", l_geoSpin: "Structure spin",
      l_fillMode: "Fill", l_glow: "Glow", l_strokeW: "Stroke width", l_strokeHue: "Stroke hue",
      l_mirror: "Mirror reflection", l_mirrorA: "Reflection fade",
      l_rgbShift: "RGB shift", l_chromaPulse: "Chroma pulse", l_warp: "Liquefy warp",
      l_warpFreq: "Warp frequency", l_slice: "Slice tear", l_sliceN: "Slice density", l_melt: "Melt smear",
      l_scan: "Scanlines", l_scanFreq: "Scan density", l_noise: "Noise & grain", l_skew: "Skew",
      l_burst: "Glitch burst", l_glyphs: "Drifting glyphs", l_glyphSpeed: "Glyph speed",
      l_echo: "Echo trail", l_zoomTrail: "Trail zoom", l_bloom: "Bloom", l_barrel: "CRT barrel",
      l_fade: "Fade", l_vignette: "Vignette", l_contrast: "Contrast",
      l_res: "Resolution", l_targetFps: "Target FPS", l_hud: "VHS timecode",
      l_uiLang: "UI language", l_aspect: "Aspect ratio", l_stageW: "Stage width", l_zen: "Focus mode",
      l_lowPower: "Low-intensity mode (tames flash & strobe)",
      o_impact: "IMPACT", o_black: "ARIAL BLACK", o_gothic: "MS GOTHIC",
      o_mono: "MONOSPACE", o_serif: "SERIF", o_cjk: "CJK SANS", o_song: "CJK SERIF",
      o_mesh: "Gradient mesh", o_grid: "Perspective grid", o_cloud: "Cloud bands", o_rainbow: "Rainbow bands",
      o_void: "Void", o_geo: "Sacred geometry",
      o_gradient: "Flowing gradient", o_chrome: "Chrome", o_prism: "Prism", o_solid: "Solid", o_outline: "Outline",
      o_center: "Center", o_left: "Left", o_right: "Right",
      o_tristar: "Triangle-star sigil", o_flower: "Flower of life", o_metatron: "Metatron's cube", o_platonic: "Platonic solids",
      o_mandala: "Mandala rings", o_lattice: "Concentric lattice",
      o_low: "Low 0.5×", o_mid: "Mid 0.75×", o_high: "High 1.0×", o_ultra: "Ultra 1.4×",
      o_ar169: "16:9 landscape", o_ar43: "4:3 classic", o_ar11: "1:1 square", o_ar34: "3:4 portrait", o_ar916: "9:16 vertical",
      b_play: "▶ Play", b_pause: "⏸ Pause (imperfect)", b_shot: "⤓ Export PNG",
      b_rand: "✦ Randomize", b_reset: "↺ Reset", b_full: "⛶ Fullscreen",
      b_low: "☾ Low-intensity", b_zen: "⤢ Focus",
      m_live: "ODDEMON · LIVE", m_low_on: "Low-intensity is ON",
    },
    ru: {
      g_text: "ТЕКСТ", g_field: "ФОН", g_neon: "НЕОН",
      g_glitch: "ГЛИТЧ", g_post: "ПОСТ-ОБРАБОТКА", g_run: "ЗАПУСК",
      l_text: "Текст", l_fontKey: "Шрифт", l_fontSize: "Размер", l_weight: "Насыщенность",
      l_tracking: "Трекинг", l_lineHeight: "Интерлиньяж", l_wave: "Волнение букв", l_jitter: "Дрожание",
      l_corrupt: "Замена символов", l_align: "Выравнивание", l_italic: "Курсив", l_autoFit: "Автоподбор размера",
      l_bgMode: "Фон", l_hue: "Тон", l_spread: "Разброс тона", l_sat: "Насыщенность",
      l_lumi: "Светлота фона", l_bgSpeed: "Скорость потока", l_blobs: "Число пятен", l_dust: "Пыль",
      l_geo: "Сакральная геометрия", l_geoType: "Структура", l_geoSpin: "Вращение структуры",
      l_fillMode: "Заливка", l_glow: "Свечение", l_strokeW: "Толщина обводки", l_strokeHue: "Тон обводки",
      l_mirror: "Отражение", l_mirrorA: "Плотность отражения",
      l_rgbShift: "Сдвиг каналов", l_chromaPulse: "Пульсация", l_warp: "Сжижение",
      l_warpFreq: "Частота", l_slice: "Разрезы", l_sliceN: "Плотность разрезов", l_melt: "Плавление",
      l_scan: "Скан-линии", l_scanFreq: "Плотность линий", l_noise: "Шум", l_skew: "Перекос",
      l_burst: "Всплеск сбоя", l_glyphs: "Плавающие знаки", l_glyphSpeed: "Скорость знаков",
      l_echo: "Эхо-шлейф", l_zoomTrail: "Масштаб шлейфа", l_bloom: "Bloom", l_barrel: "Искажение ЭЛТ",
      l_fade: "Выцветание", l_vignette: "Виньетка", l_contrast: "Контраст",
      l_res: "Разрешение", l_targetFps: "Целевой FPS", l_hud: "Тайм-код VHS",
      l_uiLang: "Язык интерфейса", l_aspect: "Пропорции", l_stageW: "Ширина сцены", l_zen: "Режим фокуса",
      l_lowPower: "Щадящий режим (гасит вспышки)",
      o_impact: "IMPACT", o_black: "ARIAL BLACK", o_gothic: "MS GOTHIC",
      o_mono: "МОНО", o_serif: "СЕРИФНЫЙ", o_cjk: "КИТАЙСКИЙ ГРОТЕСК", o_song: "КИТАЙСКИЙ СЕРИФ",
      o_mesh: "Градиентная дымка", o_grid: "Перспективная сетка", o_cloud: "Облака", o_rainbow: "Радуга",
      o_void: "Пустота", o_geo: "Сакральная геометрия",
      o_gradient: "Градиент", o_chrome: "Хром", o_prism: "Призма", o_solid: "Сплошной", o_outline: "Контур",
      o_center: "По центру", o_left: "Влево", o_right: "Вправо",
      o_tristar: "Звезда-треугольник", o_flower: "Цветок жизни", o_metatron: "Куб Метатрона", o_platonic: "Платоновы тела",
      o_mandala: "Мандала", o_lattice: "Концентрическая сетка",
      o_low: "Низк. 0.5×", o_mid: "Средн. 0.75×", o_high: "Высок. 1.0×", o_ultra: "Ультра 1.4×",
      o_ar169: "16:9 альбомная", o_ar43: "4:3 классика", o_ar11: "1:1 квадрат", o_ar34: "3:4 вертикальная", o_ar916: "9:16 вертикаль",
      b_play: "▶ Пуск", b_pause: "⏸ Пауза (несовершенно)", b_shot: "⤓ Сохранить PNG",
      b_rand: "✦ Случайно", b_reset: "↺ Сброс", b_full: "⛶ Во весь экран",
      b_low: "☾ Щадящий", b_zen: "⤢ Фокус",
      m_live: "ODDEMON · LIVE", m_low_on: "Щадящий режим включён",
    },
    es: {
      g_text: "TEXTO", g_field: "FONDO", g_neon: "NEÓN",
      g_glitch: "GLITCH", g_post: "POST", g_run: "EJECUCIÓN",
      l_text: "Texto", l_fontKey: "Fuente", l_fontSize: "Tamaño", l_weight: "Grosor",
      l_tracking: "Espaciado", l_lineHeight: "Interlínea", l_wave: "Onda", l_jitter: "Temblor",
      l_corrupt: "Corrupción", l_align: "Alineación", l_italic: "Cursiva", l_autoFit: "Ajuste automático",
      l_bgMode: "Fondo", l_hue: "Tono", l_spread: "Dispersión de tono", l_sat: "Saturación",
      l_lumi: "Luminosidad base", l_bgSpeed: "Velocidad de flujo", l_blobs: "Nº de manchas", l_dust: "Polvo",
      l_geo: "Geometría sagrada", l_geoType: "Estructura", l_geoSpin: "Rotación",
      l_fillMode: "Relleno", l_glow: "Resplandor", l_strokeW: "Grosor de trazo", l_strokeHue: "Tono de trazo",
      l_mirror: "Reflejo", l_mirrorA: "Intensidad del reflejo",
      l_rgbShift: "Desfase RGB", l_chromaPulse: "Pulso", l_warp: "Licuar",
      l_warpFreq: "Frecuencia", l_slice: "Corte", l_sliceN: "Densidad de corte", l_melt: "Fusión",
      l_scan: "Líneas de barrido", l_scanFreq: "Densidad de barrido", l_noise: "Ruido", l_skew: "Inclinación",
      l_burst: "Ráfaga de glitch", l_glyphs: "Glifos flotantes", l_glyphSpeed: "Velocidad de glifos",
      l_echo: "Estela", l_zoomTrail: "Zoom de estela", l_bloom: "Bloom", l_barrel: "Barril CRT",
      l_fade: "Desvanecido", l_vignette: "Viñeta", l_contrast: "Contraste",
      l_res: "Resolución", l_targetFps: "FPS objetivo", l_hud: "Código de tiempo VHS",
      l_uiLang: "Idioma", l_aspect: "Proporción", l_stageW: "Ancho del lienzo", l_zen: "Modo enfoque",
      l_lowPower: "Modo suave (atenúa destellos)",
      o_impact: "IMPACT", o_black: "ARIAL BLACK", o_gothic: "MS GOTHIC",
      o_mono: "MONO", o_serif: "SERIF", o_cjk: "SANS CJK", o_song: "SERIF CJK",
      o_mesh: "Malla degradada", o_grid: "Rejilla en perspectiva", o_cloud: "Bandas de nubes", o_rainbow: "Bandas de arcoíris",
      o_void: "Vacío", o_geo: "Geometría sagrada",
      o_gradient: "Degradado fluido", o_chrome: "Cromo", o_prism: "Prisma", o_solid: "Sólido", o_outline: "Contorno",
      o_center: "Centro", o_left: "Izquierda", o_right: "Derecha",
      o_tristar: "Sello de estrellas", o_flower: "Flor de la vida", o_metatron: "Cubo de Metatrón", o_platonic: "Sólidos platónicos",
      o_mandala: "Mandalas", o_lattice: "Retícula concéntrica",
      o_low: "Baja 0.5×", o_mid: "Media 0.75×", o_high: "Alta 1.0×", o_ultra: "Ultra 1.4×",
      o_ar169: "16:9 horizontal", o_ar43: "4:3 clásica", o_ar11: "1:1 cuadrada", o_ar34: "3:4 vertical", o_ar916: "9:16 vertical",
      b_play: "▶ Reproducir", b_pause: "⏸ Pausa (imperfecta)", b_shot: "⤓ Exportar PNG",
      b_rand: "✦ Aleatorio", b_reset: "↺ Reiniciar", b_full: "⛶ Pantalla completa",
      b_low: "☾ Modo suave", b_zen: "⤢ Enfoque",
      m_live: "ODDEMON · LIVE", m_low_on: "Modo suave activado",
    },
    ja: {
      g_text: "テキスト", g_field: "背景", g_neon: "ネオン",
      g_glitch: "グリッチ", g_post: "ポスト処理", g_run: "実行",
      l_text: "テキスト", l_fontKey: "フォント", l_fontSize: "サイズ", l_weight: "ウェイト",
      l_tracking: "字間", l_lineHeight: "行間", l_wave: "揺れ", l_jitter: "ジッター",
      l_corrupt: "文字化け率", l_align: "整列", l_italic: "斜体", l_autoFit: "自動フィット",
      l_bgMode: "背景", l_hue: "色相", l_spread: "色幅", l_sat: "彩度",
      l_lumi: "明るさ", l_bgSpeed: "流速", l_blobs: "団数", l_dust: "塵",
      l_geo: "神聖幾何の強さ", l_geoType: "構造", l_geoSpin: "回転",
      l_fillMode: "塗り", l_glow: "グロー", l_strokeW: "枠線の太さ", l_strokeHue: "枠の色相",
      l_mirror: "鏡像", l_mirrorA: "反射の濃さ",
      l_rgbShift: "RGBズレ", l_chromaPulse: "パルス", l_warp: "液化",
      l_warpFreq: "周波数", l_slice: "スライス", l_sliceN: "スライス密度", l_melt: "融解",
      l_scan: "走査線", l_scanFreq: "走査密度", l_noise: "ノイズ", l_skew: "傾き",
      l_burst: "バースト", l_glyphs: "漂浮文字", l_glyphSpeed: "漂浮速度",
      l_echo: "残像", l_zoomTrail: "残像ズーム", l_bloom: "ブルーム", l_barrel: "CRT歪み",
      l_fade: "褪色", l_vignette: "周辺減光", l_contrast: "コントラスト",
      l_res: "解像度", l_targetFps: "目標FPS", l_hud: "VHSタイムコード",
      l_uiLang: "表示言語", l_aspect: "アスペクト比", l_stageW: "画面の幅", l_zen: "集中モード",
      l_lowPower: "弱モード（光量と点滅を抑える）",
      o_impact: "IMPACT", o_black: "ARIAL BLACK", o_gothic: "MSゴシック",
      o_mono: "等幅", o_serif: "明朝", o_cjk: "中国語ゴシック", o_song: "中国語明朝",
      o_mesh: "グラデーション", o_grid: "グリッド", o_cloud: "雲", o_rainbow: "虹帯",
      o_void: "虚空", o_geo: "神聖幾何",
      o_gradient: "グラデーション", o_chrome: "クローム", o_prism: "プリズム", o_solid: "ソリッド", o_outline: "アウトライン",
      o_center: "中央", o_left: "左", o_right: "右",
      o_tristar: "三角星組み", o_flower: "生命の花", o_metatron: "メタトロン", o_platonic: "正多面体",
      o_mandala: "曼荼羅", o_lattice: "同心多角形",
      o_low: "低 0.5×", o_mid: "中 0.75×", o_high: "高 1.0×", o_ultra: "超高 1.4×",
      o_ar169: "16:9 横", o_ar43: "4:3 標準", o_ar11: "1:1 正方形", o_ar34: "3:4 縦", o_ar916: "9:16 縦",
      b_play: "▶ 再生", b_pause: "⏸ 一時停止（不完全）", b_shot: "⤓ PNG 出力",
      b_rand: "✦ ランダム", b_reset: "↺ リセット", b_full: "⛶ 全画面",
      b_low: "☾ 弱モード", b_zen: "⤢ 集中",
      m_live: "ODDEMON · LIVE", m_low_on: "弱モードが有効",
    },
  };
  function T(k) {
    var d = I18N[state.uiLang] || I18N.zh;
    return d[k] !== undefined ? d[k] : (I18N.zh[k] !== undefined ? I18N.zh[k] : k);
  }
  var LANGS = [["zh", "中文"], ["en", "English"], ["ru", "Русский"], ["es", "Español"], ["ja", "日本語"]];

  /* -------------------------------------------------------------- DOM 构建 */
  var ROOT = null, canvas = null, octx = null;
  var W = 960, H = 540;
  var L = {};
  var rowA, rowB, rowSc, meltArr, scanArr, colA, colSc, vig, outData;
  var glyphs = [];
  var t = 0, lastFrame = 0, fps = 0, fpsT = 0, fpsN = 0, burstUntil = -1, flash = 0;
  var controls = {};

  function kick(v) { if (!state.lowPower) flash = Math.min(0.25, v); }

  function buildDOM() {
    ROOT = document.createElement("div");
    ROOT.id = "od-root";
    ROOT.innerHTML =
      '<div class="od-stagewrap">' +
      '  <div class="od-stage" id="od-stage">' +
      '    <canvas id="od-canvas"></canvas>' +
      '    <div class="od-crt"></div>' +
      '    <div class="od-stagelabel"><span class="od-dot"></span><span id="od-livelabel"></span></div>' +
      "  </div>" +
      '  <div class="od-stagebar">' +
      '    <button class="od-btn od-primary" data-act="play"></button>' +
      '    <button class="od-btn" data-act="shot"></button>' +
      '    <button class="od-btn" data-act="rand"></button>' +
      '    <button class="od-btn" data-act="lang"></button>' +
      '    <button class="od-btn" data-act="low"></button>' +
      '    <button class="od-btn" data-act="zen"></button>' +
      '    <button class="od-btn" data-act="reset"></button>' +
      '    <button class="od-btn" data-act="full"></button>' +
      '    <span class="od-fps" id="od-fps">-- fps</span>' +
      "  </div>" +
      '  <div class="od-presets" id="od-presets"></div>' +
      "</div>" +
      '<div class="od-panel" id="od-panel"></div>';
    return ROOT;
  }

  function btnLabel() { return state.playing ? T("b_pause") : T("b_play"); }

  function syncBar() {
    var map = {
      play: btnLabel(),
      shot: T("b_shot"), rand: T("b_rand"), low: T("b_low"),
      zen: T("b_zen"), reset: T("b_reset"), full: T("b_full"),
      lang: "\uD83C\uDF10 " + langName(state.uiLang),
    };
    Object.keys(map).forEach(function (a) {
      var b = ROOT.querySelector('[data-act="' + a + '"]');
      if (b) {
        b.textContent = map[a];
        b.classList.toggle("od-on", (a === "low" && state.lowPower) || (a === "zen" && state.zen));
      }
    });
    var ll = ROOT.querySelector("#od-livelabel");
    if (ll) ll.textContent = T("m_live") + (state.lowPower ? " · " + T("m_low_on") : "");
  }

  /* ------------------------------------------------------------- 控件 schema */
  var SCHEMA = [
    {
      g: "g_text", open: true, items: [
        { k: "text", t: "textarea", l: "l_text" },
        { k: "fontKey", t: "select", l: "l_fontKey", o: ["impact", "black", "gothic", "mono", "serif", "cjk", "song"] },
        { k: "fontSize", t: "range", l: "l_fontSize", min: 30, max: 280, step: 1 },
        { k: "weight", t: "range", l: "l_weight", min: 100, max: 900, step: 100 },
        { k: "tracking", t: "range", l: "l_tracking", min: -30, max: 80, step: 1 },
        { k: "lineHeight", t: "range", l: "l_lineHeight", min: 0.6, max: 2.2, step: 0.01 },
        { k: "wave", t: "range", l: "l_wave", min: 0, max: 40, step: 1 },
        { k: "jitter", t: "range", l: "l_jitter", min: 0, max: 30, step: 1 },
        { k: "corrupt", t: "range", l: "l_corrupt", min: 0, max: 1, step: 0.01 },
        { k: "autoFit", t: "check", l: "l_autoFit" },
        { k: "align", t: "select", l: "l_align", o: ["center", "left", "right"] },
        { k: "italic", t: "check", l: "l_italic" },
      ]
    },
    {
      g: "g_field", open: true, items: [
        { k: "bgMode", t: "select", l: "l_bgMode", o: ["mesh", "grid", "cloud", "rainbow", "void", "geo"] },
        { k: "hue", t: "range", l: "l_hue", min: 0, max: 360, step: 1 },
        { k: "spread", t: "range", l: "l_spread", min: 0, max: 360, step: 1 },
        { k: "sat", t: "range", l: "l_sat", min: 0, max: 1, step: 0.01 },
        { k: "lumi", t: "range", l: "l_lumi", min: 0, max: 1, step: 0.01 },
        { k: "bgSpeed", t: "range", l: "l_bgSpeed", min: 0, max: 3, step: 0.01 },
        { k: "blobs", t: "range", l: "l_blobs", min: 2, max: 16, step: 1 },
        { k: "dust", t: "range", l: "l_dust", min: 0, max: 1, step: 0.01 },
        { k: "geo", t: "range", l: "l_geo", min: 0, max: 1, step: 0.01 },
        { k: "geoType", t: "select", l: "l_geoType", o: ["tristar", "platonic", "metatron", "flower", "mandala", "lattice"] },
        { k: "geoSpin", t: "range", l: "l_geoSpin", min: 0, max: 3, step: 0.01 },
      ]
    },
    {
      g: "g_neon", open: false, items: [
        { k: "fillMode", t: "select", l: "l_fillMode", o: ["gradient", "chrome", "prism", "solid", "outline"] },
        { k: "glow", t: "range", l: "l_glow", min: 0, max: 240, step: 1 },
        { k: "strokeW", t: "range", l: "l_strokeW", min: 0, max: 14, step: 0.5 },
        { k: "strokeHue", t: "range", l: "l_strokeHue", min: -180, max: 180, step: 1 },
        { k: "mirror", t: "check", l: "l_mirror" },
        { k: "mirrorA", t: "range", l: "l_mirrorA", min: 0, max: 1, step: 0.01 },
      ]
    },
    {
      g: "g_glitch", open: true, items: [
        { k: "rgbShift", t: "range", l: "l_rgbShift", min: 0, max: 48, step: 1 },
        { k: "chromaPulse", t: "range", l: "l_chromaPulse", min: 0, max: 1, step: 0.01 },
        { k: "warp", t: "range", l: "l_warp", min: 0, max: 70, step: 1 },
        { k: "warpFreq", t: "range", l: "l_warpFreq", min: 0.002, max: 0.06, step: 0.001 },
        { k: "slice", t: "range", l: "l_slice", min: 0, max: 1, step: 0.01 },
        { k: "sliceN", t: "range", l: "l_sliceN", min: 0, max: 70, step: 1 },
        { k: "melt", t: "range", l: "l_melt", min: 0, max: 1, step: 0.01 },
        { k: "scan", t: "range", l: "l_scan", min: 0, max: 1, step: 0.01 },
        { k: "scanFreq", t: "range", l: "l_scanFreq", min: 1, max: 14, step: 1 },
        { k: "noise", t: "range", l: "l_noise", min: 0, max: 1, step: 0.01 },
        { k: "skew", t: "range", l: "l_skew", min: -30, max: 30, step: 1 },
        { k: "burst", t: "range", l: "l_burst", min: 0, max: 1, step: 0.01 },
        { k: "glyphs", t: "range", l: "l_glyphs", min: 0, max: 1, step: 0.01 },
        { k: "glyphSpeed", t: "range", l: "l_glyphSpeed", min: 0, max: 3, step: 0.01 },
      ]
    },
    {
      g: "g_post", open: false, items: [
        { k: "echo", t: "range", l: "l_echo", min: 0, max: 0.95, step: 0.01 },
        { k: "zoomTrail", t: "range", l: "l_zoomTrail", min: -3, max: 3, step: 0.05 },
        { k: "bloom", t: "range", l: "l_bloom", min: 0, max: 1.6, step: 0.01 },
        { k: "barrel", t: "range", l: "l_barrel", min: -0.3, max: 0.3, step: 0.01 },
        { k: "fade", t: "range", l: "l_fade", min: 0, max: 1, step: 0.01 },
        { k: "vignette", t: "range", l: "l_vignette", min: 0, max: 1, step: 0.01 },
        { k: "contrast", t: "range", l: "l_contrast", min: 0.4, max: 2.2, step: 0.01 },
      ]
    },
    {
      g: "g_run", open: false, items: [
        { k: "lowPower", t: "check", l: "l_lowPower" },
        { k: "aspect", t: "select", l: "l_aspect", o: ["16:9", "4:3", "1:1", "3:4", "9:16"] },
        { k: "stageW", t: "range", l: "l_stageW", min: 40, max: 100, step: 1 },
        { k: "zen", t: "check", l: "l_zen" },
        { k: "res", t: "select", l: "l_res", o: ["0.5", "0.75", "1", "1.4"], numeric: true },
        { k: "targetFps", t: "range", l: "l_targetFps", min: 10, max: 60, step: 5 },
        { k: "hud", t: "check", l: "l_hud" },
        { k: "uiLang", t: "select", l: "l_uiLang", o: ["zh", "en", "ru", "es", "ja"] },
      ]
    },
  ];

  function optLabel(key, val) {
    if (key === "uiLang") {
      for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === val) return LANGS[i][1];
      return val;
    }
    if (key === "res") return T("o_" + (val === "0.5" ? "low" : val === "0.75" ? "mid" : val === "1" ? "high" : "ultra"));
    if (key === "aspect") {
      var m = { "16:9": "o_ar169", "4:3": "o_ar43", "1:1": "o_ar11", "3:4": "o_ar34", "9:16": "o_ar916" };
      return T(m[val] || "o_ar169");
    }
    return T("o_" + val);
  }

  var groupOpen = {};   /* 语言切换时保留各分组的展开状态 */

  function buildPanel() {
    var panel = ROOT.querySelector("#od-panel");
    panel.innerHTML = "";
    SCHEMA.forEach(function (grp) {
      if (groupOpen[grp.g] === undefined) groupOpen[grp.g] = !!grp.open;
      var sec = document.createElement("section");
      sec.className = "od-sec" + (groupOpen[grp.g] ? " open" : "");
      var h = document.createElement("button");
      h.className = "od-sech";
      h.type = "button";
      h.innerHTML = "<span>" + T(grp.g) + "</span><i></i>";
      h.onclick = function () { groupOpen[grp.g] = !groupOpen[grp.g]; sec.classList.toggle("open"); };
      sec.appendChild(h);
      var body = document.createElement("div");
      body.className = "od-secb";
      grp.items.forEach(function (it) { body.appendChild(buildControl(it)); });
      sec.appendChild(body);
      panel.appendChild(sec);
    });
    syncUI();
    applyChromeI18n();
  }

  function buildControl(it) {
    var wrap = document.createElement("div");
    wrap.className = "od-ctl od-ctl-" + it.t;
    var lab = document.createElement("label");
    lab.className = "od-lab";
    lab.innerHTML = "<span>" + T(it.l) + "</span>";
    wrap.appendChild(lab);
    var el, val;

    if (it.t === "range") {
      el = document.createElement("input");
      el.type = "range";
      el.min = it.min; el.max = it.max; el.step = it.step;
      val = document.createElement("em");
      val.className = "od-val";
      lab.appendChild(val);
      el.addEventListener("input", function () {
        state[it.k] = parseFloat(el.value);
        val.textContent = fmt(state[it.k], it.step);
        if (it.k === "stageW") applyLayout();
      });
      controls[it.k] = { el: el, val: val, step: it.step, type: "range" };
      wrap.appendChild(el);
    } else if (it.t === "select") {
      el = document.createElement("select");
      it.o.forEach(function (v) {
        var op = document.createElement("option");
        op.value = v; op.textContent = optLabel(it.k, v);
        el.appendChild(op);
      });
      el.addEventListener("change", function () {
        state[it.k] = it.numeric ? parseFloat(el.value) : el.value;
        if (it.k === "uiLang") { buildPanel(); syncBar(); applyLayout(); writeHash({ lang: state.uiLang }); return; }
        if (it.k === "aspect") { alloc(); applyLayout(); return; }
      });
      controls[it.k] = { el: el, type: "select" };
      wrap.appendChild(el);
    } else if (it.t === "check") {
      el = document.createElement("input");
      el.type = "checkbox";
      el.className = "od-check";
      el.addEventListener("change", function () {
        state[it.k] = el.checked;
        if (it.k === "lowPower") { syncBar(); kick(0); }
        if (it.k === "zen") applyLayout();
      });
      controls[it.k] = { el: el, type: "check" };
      wrap.appendChild(el);
    } else if (it.t === "textarea") {
      el = document.createElement("textarea");
      el.rows = 3;
      el.className = "od-area";
      el.addEventListener("input", function () { state[it.k] = el.value; });
      controls[it.k] = { el: el, type: "textarea" };
      wrap.appendChild(el);
    }
    return wrap;
  }

  function fmt(v, step) {
    if (step >= 1) return String(Math.round(v));
    if (step >= 0.1) return v.toFixed(1);
    return v.toFixed(2);
  }

  function syncUI() {
    Object.keys(controls).forEach(function (k) {
      var c = controls[k], v = state[k];
      if (!c.el || !c.el.parentNode) return;
      if (c.type === "range") { c.el.value = v; c.val.textContent = fmt(v, c.step); }
      else if (c.type === "select") { c.el.value = String(v); }
      else if (c.type === "check") { c.el.checked = !!v; }
      else if (c.type === "textarea") { c.el.value = v; }
    });
    syncBar();
  }

  /* ---------------------------------------------------------------- 画布 */
  function alloc() {
    var dims = ASPECTS[state.aspect] || ASPECTS["16:9"];
    W = Math.round(dims[0] * state.res);
    H = Math.round(dims[1] * state.res);
    canvas.width = W; canvas.height = H;
    octx = canvas.getContext("2d");
    canvas.style.aspectRatio = W + " / " + H;
    document.documentElement.style.setProperty("--od-ar", (W / H).toFixed(4));

    L.base = mk(W, H, true);
    L.text = mk(W, H);
    L.g1 = mk(Math.max(1, W / 3), Math.max(1, H / 3));
    L.g2 = mk(Math.max(1, W / 8), Math.max(1, H / 8));
    L.bg = mk(Math.max(1, W / 4), Math.max(1, H / 4));
    L.bloom = mk(Math.max(1, W / 4), Math.max(1, H / 4));
    L.echo = mk(W, H);

    rowA = new Float32Array(H); rowB = new Float32Array(H);
    rowSc = new Float32Array(H); meltArr = new Float32Array(H); scanArr = new Float32Array(H);
    colA = new Float32Array(W); colSc = new Float32Array(W);
    vig = new Float32Array(W * H);
    outData = octx.createImageData(W, H);
    var od = outData.data;
    for (var p = 3; p < od.length; p += 4) od[p] = 255;

    var cx = W / 2, cy = H / 2;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var dx = (x - cx) / cx, dy = (y - cy) / cy;
        vig[y * W + x] = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      }
    }
    initGlyphs();
    initBlobs();
  }

  function applyLayout() {
    if (!ROOT) return;
    ROOT.style.setProperty("--od-stage-w", state.stageW + "%");
    ROOT.classList.toggle("od-zen", !!state.zen);
    document.body.classList.toggle("od-zen", !!state.zen);
    syncUI();
  }

  var blobs = [];
  function initBlobs() {
    blobs = [];
    for (var i = 0; i < 16; i++) {
      blobs.push({ ph: rnd(0, 6.28), sp: rnd(0.15, 0.7), rad: rnd(0.25, 0.75), hx: rnd(-0.5, 0.5), hy: rnd(-0.5, 0.5), ho: rnd(-1, 1) });
    }
  }
  function initGlyphs() {
    glyphs = [];
    for (var i = 0; i < 90; i++) {
      glyphs.push({
        x: rnd(0, W), y: rnd(0, H),
        size: rnd(10, 46) * state.res,
        vx: rnd(-0.9, 0.9), vy: rnd(-1.6, 1.6),
        hue: rnd(-90, 90), a: rnd(0.15, 0.9), ch: rndGlyph(), bl: Math.random() < 0.18,
      });
    }
  }

  /* ================================================================
   *  神圣几何 / 正多面体
   * ================================================================ */
  var GEO = {};
  function initGeo() {
    var P = (1 + Math.sqrt(5)) / 2;
    function norm(v) {
      var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    function edges(v) {
      var min = 1e9, e = [], i, j, d;
      for (i = 0; i < v.length; i++) {
        for (j = i + 1; j < v.length; j++) {
          d = Math.sqrt(Math.pow(v[i][0] - v[j][0], 2) + Math.pow(v[i][1] - v[j][1], 2) + Math.pow(v[i][2] - v[j][2], 2));
          if (d < min - 1e-9) min = d;
        }
      }
      for (i = 0; i < v.length; i++) {
        for (j = i + 1; j < v.length; j++) {
          d = Math.sqrt(Math.pow(v[i][0] - v[j][0], 2) + Math.pow(v[i][1] - v[j][1], 2) + Math.pow(v[i][2] - v[j][2], 2));
          if (d < min * 1.12) e.push([i, j]);
        }
      }
      return e;
    }
    function solid(raw) {
      var v = raw.map(norm);
      return { v: v, e: edges(v) };
    }
    var cube = [];
    [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) { cube.push([a, b, c]); }); }); });
    var dod = cube.slice();
    [[0, -1 / P, P], [0, -1 / P, -P], [0, 1 / P, P], [0, 1 / P, -P],
     [-1 / P, P, 0], [-1 / P, -P, 0], [1 / P, P, 0], [1 / P, -P, 0],
     [-P, 0, 1 / P], [-P, 0, -1 / P], [P, 0, 1 / P], [P, 0, -1 / P]].forEach(function (v) { dod.push(v); });

    GEO.tetra = solid([[-1, 1, -1], [1, 1, 1], [1, -1, -1], [-1, -1, 1]]);
    GEO.cube = solid(cube);
    GEO.octa = solid([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
    GEO.icosa = solid([
      [0, 1, P], [0, 1, -P], [0, -1, P], [0, -1, -P],
      [1, P, 0], [1, -P, 0], [-1, P, 0], [-1, -P, 0],
      [P, 0, 1], [P, 0, -1], [-P, 0, 1], [-P, 0, -1]]);
    GEO.dodeca = solid(dod);
    GEO.list = [GEO.tetra, GEO.cube, GEO.octa, GEO.icosa, GEO.dodeca];
  }

  function proj(v, ax, ay, R, cx, cy) {
    var x = v[0], y = v[1], z = v[2];
    var y1 = y * Math.cos(ax) - z * Math.sin(ax);
    var z1 = y * Math.sin(ax) + z * Math.cos(ax);
    var x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
    var z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
    var f = 2.4 / (2.4 + z2);
    return [cx + x2 * R * f, cy + y1 * R * f];
  }

  /* ---- 发光描边 / 辉光节点：全部几何结构共用 ---- */
  function strokeGlow(ctx, drawFn, color, width, alpha, glowMul) {
    glowMul = glowMul === undefined ? 1 : glowMul;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (glowMul > 0.01) {
      ctx.globalAlpha = alpha * 0.20 * glowMul;
      ctx.lineWidth = width * 4.5;
      ctx.beginPath(); drawFn(ctx); ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath(); drawFn(ctx); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function glowDot(ctx, x, y, r, hue, a) {
    if (a <= 0.01) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hsl(hue, 90, 96, a));
    g.addColorStop(0.4, hsl(hue, 85, 70, a * 0.5));
    g.addColorStop(1, hsl(hue, 85, 60, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
  }
  function starPath(ctx, cx, cy, spikes, rOut, rIn, rot) {
    for (var i = 0; i < spikes * 2; i++) {
      var r = (i % 2 === 0) ? rOut : rIn;
      var a = rot + (i / (spikes * 2)) * Math.PI * 2;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function polyPath(ctx, cx, cy, n, r, rot) {
    for (var i = 0; i <= n; i++) {
      var a = rot + (i / n) * Math.PI * 2;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function drawWire(ctx, solid, cx, cy, R, ax, ay, alpha, hue, wMul) {
    var S = state.res, pts = [], i;
    for (i = 0; i < solid.v.length; i++) pts.push(proj(solid.v[i], ax, ay, R, cx, cy));
    strokeGlow(ctx, function (c) {
      for (i = 0; i < solid.e.length; i++) {
        var p1 = pts[solid.e[i][0]], p2 = pts[solid.e[i][1]];
        c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]);
      }
    }, hsl(hue, 85 * state.sat, 64, 1), Math.max(0.9, 1.2 * S) * (wMul || 1), alpha, state.lowPower ? 0.35 : 1);
    for (i = 0; i < pts.length; i++) {
      glowDot(ctx, pts[i][0], pts[i][1], Math.max(2, 4.5 * S), hue, alpha * 0.75);
    }
  }

  /* 三角星组合 —— 参考「THE SEIZED TESTAMENT」：
     六重径向对称的多刺星芒三层嵌套 + 三层倒三角 + 中央对比色正二十面体 */
  function drawTriStar(ctx, t, a) {
    var S = state.res;
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    var spin = state.geoSpin * t * 0.35;
    var hueA = state.hue + 185 + t * 4;   /* 主结构线 */
    var hueB = state.hue + 65 + t * 4;    /* 中央多面体：对比色 */
    var breathe = 1 + 0.02 * Math.sin(t * 0.9);
    var lw = Math.max(0.9, 1.15 * S);
    var gm = state.lowPower ? 0.35 : 1;

    var rings = [
      { n: 6, rad: 0.68, rOut: 0.30, rIn: 0.36, dir: 1 },
      { n: 6, rad: 0.42, rOut: 0.17, rIn: 0.34, dir: -1 },
      { n: 6, rad: 0.21, rOut: 0.10, rIn: 0.30, dir: 1 },
    ];
    for (var ri = 0; ri < rings.length; ri++) {
      (function (rg, ridx) {
        strokeGlow(ctx, function (c) {
          for (var i = 0; i < rg.n; i++) {
            var ang = spin * rg.dir * (0.5 + ridx * 0.25) + (i / rg.n) * Math.PI * 2;
            var px = cx + Math.cos(ang) * R * rg.rad * breathe;
            var py = cy + Math.sin(ang) * R * rg.rad * breathe;
            starPath(c, px, py, 5, R * rg.rOut * breathe, R * rg.rOut * rg.rIn * breathe,
                     ang + Math.PI / 2 + spin * rg.dir * 0.6);
          }
        }, hsl(hueA, 85 * state.sat, 62, 1), lw, a * (1 - ridx * 0.10), gm);
      })(rings[ri], ri);
    }

    /* 辐条 + 外星之间的弦 */
    strokeGlow(ctx, function (c) {
      for (var i = 0; i < 6; i++) {
        var a1 = spin * 0.5 + (i / 6) * Math.PI * 2;
        var a2 = spin * 0.5 + ((i + 1) / 6) * Math.PI * 2;
        var x1 = cx + Math.cos(a1) * R * 0.68 * breathe, y1 = cy + Math.sin(a1) * R * 0.68 * breathe;
        var x2 = cx + Math.cos(a2) * R * 0.68 * breathe, y2 = cy + Math.sin(a2) * R * 0.68 * breathe;
        c.moveTo(cx, cy); c.lineTo(x1, y1);
        c.moveTo(x1, y1); c.lineTo(x2, y2);
      }
    }, hsl(hueA, 70 * state.sat, 58, 1), lw * 0.8, a * 0.45, gm);

    /* 三层倒三角 */
    strokeGlow(ctx, function (c) {
      for (var k = 0; k < 3; k++) {
        polyPath(c, cx, cy, 3, R * (0.42 - k * 0.09) * breathe,
                 -Math.PI / 2 + spin * 0.2 + (k % 2) * Math.PI);
      }
    }, hsl(hueA, 90 * state.sat, 60, 1), lw, a * 0.95, gm);

    /* 中央正二十面体（对比色） */
    drawWire(ctx, GEO.icosa, cx, cy, R * 0.17 * breathe, spin * 0.8, spin * 1.05, a, hueB, 1.15);

    /* 外圈星中心辉光 */
    for (var i = 0; i < 6; i++) {
      var an = spin * 0.5 + (i / 6) * Math.PI * 2;
      glowDot(ctx, cx + Math.cos(an) * R * 0.68 * breathe, cy + Math.sin(an) * R * 0.68 * breathe,
              R * 0.055, hueA, a * 0.5);
    }
  }

  function drawGeo(ctx, t) {
    var a = eff("geo");
    if (a <= 0.005) return;
    var S = state.res;
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
    var hue = state.hue + 185 + t * 5;
    var hueB = state.hue + 65 + t * 5;
    var al = (0.30 + 0.55 * a) * (state.lowPower ? 0.7 : 1);
    var spin = state.geoSpin * t;
    var lw = Math.max(0.9, 1.15 * S);
    var gm = state.lowPower ? 0.35 : 1;
    var i, j, k, r, n;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hsl(hue, 70 * state.sat, 72, 1);
    ctx.fillStyle = hsl(hue, 70 * state.sat, 72, 1);

    if (state.geoType === "tristar") {
      drawTriStar(ctx, t, a);
    } else if (state.geoType === "flower") {
      var fr = R * 0.30;
      strokeGlow(ctx, function (c) {
        for (var ix = -2; ix <= 2; ix++) {
          for (var jx = -2; jx <= 2; jx++) {
            var ox = cx + ix * fr * Math.sqrt(3), oy = cy + jx * fr * 1.5 + (ix % 2 ? fr * 0.75 : 0);
            if (Math.hypot(ox - cx, oy - cy) > R * 1.4) continue;
            c.moveTo(ox + fr, oy); c.arc(ox, oy, fr, 0, 6.3);
          }
        }
        c.moveTo(cx + R * 1.4, cy); c.arc(cx, cy, R * 1.4, 0, 6.3);
      }, hsl(hue, 80 * state.sat, 66, 1), lw, al, gm);
      for (i = 0; i < 6; i++) {
        var fa = (i / 6) * Math.PI * 2;
        glowDot(ctx, cx + Math.cos(fa) * fr, cy + Math.sin(fa) * fr, R * 0.05, hue, al * 0.6);
      }
      glowDot(ctx, cx, cy, R * 0.07, hue + 40, al * 0.8);
    } else if (state.geoType === "metatron") {
      var nodes = [[cx, cy]];
      for (k = 1; k <= 2; k++) {
        for (i = 0; i < 6; i++) {
          var ang = (i / 6) * Math.PI * 2 + spin * 0.25;
          nodes.push([cx + Math.cos(ang) * R * 0.33 * k, cy + Math.sin(ang) * R * 0.33 * k]);
        }
      }
      strokeGlow(ctx, function (c) {
        for (i = 0; i < nodes.length; i++) {
          for (j = i + 1; j < nodes.length; j++) {
            c.moveTo(nodes[i][0], nodes[i][1]); c.lineTo(nodes[j][0], nodes[j][1]);
          }
        }
      }, hsl(hue, 75 * state.sat, 64, 1), lw * 0.85, al * 0.8, gm);
      strokeGlow(ctx, function (c) {
        for (i = 0; i < nodes.length; i++) {
          c.moveTo(nodes[i][0] + R * 0.11, nodes[i][1]);
          c.arc(nodes[i][0], nodes[i][1], R * 0.11, 0, 6.3);
        }
      }, hsl(hue, 80 * state.sat, 68, 1), lw, al, gm);
      for (i = 0; i < nodes.length; i++) glowDot(ctx, nodes[i][0], nodes[i][1], R * 0.045, hue + 40, al * 0.85);
    } else if (state.geoType === "platonic") {
      /* 居中一个大正多面体，外圈环绕五个小的 */
      drawWire(ctx, GEO.icosa, cx, cy, R * 0.36 * (1 + 0.02 * Math.sin(t * 0.9)),
               spin * 0.5, spin * 0.66, al, hueB, 1.3);
      var spots = [[0.16, 0.2], [0.84, 0.2], [0.5, 0.12], [0.2, 0.82], [0.8, 0.82]];
      for (i = 0; i < GEO.list.length; i++) {
        var sp = spots[i];
        drawWire(ctx, GEO.list[i], W * sp[0], H * sp[1], R * 0.17,
                 spin * (0.4 + i * 0.13), spin * (0.53 + i * 0.09), al * 0.75, hue, 0.9);
      }
    } else if (state.geoType === "mandala") {
      strokeGlow(ctx, function (c) {
        for (n = 3; n <= 12; n++) {
          r = R * (0.18 + 0.075 * (n - 3));
          polyPath(c, cx, cy, n, r, spin * (n % 2 ? 0.12 : -0.12));
        }
        for (i = 0; i < 24; i++) {
          var a2 = (i / 24) * Math.PI * 2;
          c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R);
        }
      }, hsl(hue, 75 * state.sat, 64, 1), lw * 0.85, al * 0.8, gm);
      for (i = 0; i < 12; i++) {
        var a3 = (i / 12) * Math.PI * 2;
        glowDot(ctx, cx + Math.cos(a3) * R, cy + Math.sin(a3) * R, R * 0.035, hue + 40, al * 0.7);
      }
    } else { /* lattice */
      strokeGlow(ctx, function (c) {
        for (k = 0; k < 7; k++) {
          n = 3 + (k % 5);
          r = R * (0.22 + k * 0.13);
          polyPath(c, cx, cy, n, r, spin * 0.3 * (k % 2 ? 1 : -1) + k * 0.2);
        }
      }, hsl(hue, 75 * state.sat, 64, 1), lw * 0.9, al * 0.85, gm);
      for (i = 0; i < 12; i++) {
        for (j = 0; j < 7; j++) {
          var a4 = (i / 12) * Math.PI * 2;
          var rr2 = R * (0.22 + j * 0.13);
          glowDot(ctx, cx + Math.cos(a4) * rr2, cy + Math.sin(a4) * rr2, 3.2 * S, hue, al * 0.35);
        }
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ 背景绘制 */
  function drawBG(ctx, t) {
    var S = state.res;
    var h = state.hue + Math.sin(t * 0.15) * 12;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hsl(h - 20, 70 * state.sat, 6 + 10 * state.lumi));
    g.addColorStop(0.55, hsl(h + state.spread * 0.25, 75 * state.sat, 10 + 16 * state.lumi));
    g.addColorStop(1, hsl(h + state.spread * 0.5, 60 * state.sat, 4 + 8 * state.lumi));
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (state.bgMode === "grid") drawGrid(ctx, t, h);
    if (state.bgMode === "rainbow") drawRainbow(ctx, t, h);

    /* 雾团 / 云层（低分辨率绘制后上采样 = 天然柔焦） */
    var bg = L.bg, bw = bg.c.width, bh = bg.c.height;
    bg.x.globalCompositeOperation = "source-over";
    bg.x.clearRect(0, 0, bw, bh);
    var hazeAlpha = state.bgMode === "void" ? 0.35 : (state.bgMode === "geo" ? 0.45 : 0.9);
    if (state.bgMode !== "void" && state.bgMode !== "geo") {
      bg.x.globalCompositeOperation = "lighter";
      var n = Math.round(state.blobs);
      for (var i = 0; i < n; i++) {
        var b = blobs[i % blobs.length];
        var sp = state.bgSpeed * b.sp;
        var bx = (0.5 + 0.42 * Math.sin(t * sp + b.ph) + b.hx * 0.2) * bw;
        var by = (0.5 + 0.40 * Math.cos(t * sp * 0.83 + b.ph * 1.7) + b.hy * 0.2) * bh;
        var rr = b.rad * bw * (state.bgMode === "cloud" ? 0.85 : 0.55);
        var hue = h + b.ho * state.spread * 0.5 + t * 6;
        var rg = bg.x.createRadialGradient(bx, by, 0, bx, by, rr);
        rg.addColorStop(0, hsl(hue, 95 * state.sat, 40 + 22 * state.lumi, 0.85));
        rg.addColorStop(0.5, hsl(hue + 30, 90 * state.sat, 26 + 14 * state.lumi, 0.32));
        rg.addColorStop(1, hsl(hue + 60, 80 * state.sat, 10, 0));
        bg.x.fillStyle = rg;
        bg.x.fillRect(bx - rr, by - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = hazeAlpha;
    ctx.drawImage(bg.c, 0, 0, W, H);
    ctx.globalAlpha = 1;

    drawGeo(ctx, t);

    if (state.dust > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      var dn = Math.round(220 * state.dust);
      for (var k = 0; k < dn; k++) {
        var px = ((hash2(k, 1) * W + t * 14 * (0.3 + hash2(k, 2))) % W + W) % W;
        var py = ((hash2(k, 3) * H + Math.sin(t * 0.5 + k) * 12) % H + H) % H;
        var s = (0.6 + hash2(k, 4) * 1.8) * S;
        ctx.fillStyle = hsl(h + 40, 60, 80, 0.10 + 0.35 * hash2(k, 5) * state.dust);
        ctx.fillRect(px, py, s, s);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawGrid(ctx, t, h) {
    var hy = H * 0.56, S = state.res;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, 1.2 * S);
    ctx.strokeStyle = hsl(h + state.spread * 0.4, 100, 55, 0.5);
    ctx.beginPath();
    for (var i = -14; i <= 14; i++) {
      var x0 = W / 2 + i * (W / 14);
      ctx.moveTo(W / 2 + i * 6, hy);
      ctx.lineTo(x0 * 3 - W, H);
    }
    ctx.stroke();
    var off = (t * 0.35 * state.bgSpeed) % 1;
    ctx.strokeStyle = hsl(h + state.spread * 0.6, 100, 62, 0.42);
    ctx.beginPath();
    for (var j = 0; j < 18; j++) {
      var f = (j + off) / 18;
      var yy = hy + Math.pow(f, 2.4) * (H - hy) * 1.15;
      if (yy > H) continue;
      ctx.moveTo(0, yy); ctx.lineTo(W, yy);
    }
    ctx.stroke();
    ctx.strokeStyle = hsl(h + 60, 100, 78, 0.9);
    ctx.lineWidth = Math.max(1, 2 * S);
    ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawRainbow(ctx, t, h) {
    ctx.globalCompositeOperation = "lighter";
    var bands = 9;
    for (var i = 0; i < bands; i++) {
      var spanH = H * 1.2;
      var y = ((((i / bands) * H + Math.sin(t * 0.4 + i) * 18 + t * 8) % spanH) + spanH) % spanH - H * 0.1;
      var g = ctx.createLinearGradient(0, y, 0, y + H / bands);
      g.addColorStop(0, hsl(h + (i / bands) * state.spread, 90 * state.sat, 30, 0));
      g.addColorStop(0.5, hsl(h + (i / bands) * state.spread, 95 * state.sat, 45 * state.lumi + 15, 0.5));
      g.addColorStop(1, hsl(h + (i / bands) * state.spread, 90 * state.sat, 30, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, H / bands);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ------------------------------------------------------------ 文字绘制 */
  function textFillStyle(ctx, x0, y0, tw, th) {
    var h = state.hue + t * 9;
    if (state.fillMode === "solid") return hsl(h + 170, 100, 78);
    if (state.fillMode === "outline") return "rgba(0,0,0,0)";
    var g;
    if (state.fillMode === "chrome") {
      g = ctx.createLinearGradient(0, y0 - th / 2, 0, y0 + th / 2);
      g.addColorStop(0, hsl(h + 180, 30, 96));
      g.addColorStop(0.35, hsl(h + 200, 90, 62));
      g.addColorStop(0.5, hsl(h + 20, 100, 88));
      g.addColorStop(0.65, hsl(h + 300, 95, 58));
      g.addColorStop(1, hsl(h + 150, 40, 92));
      return g;
    }
    g = ctx.createLinearGradient(x0, y0 - th * 0.6, x0 + tw, y0 + th * 0.6);
    var stops = 5;
    for (var i = 0; i <= stops; i++) {
      g.addColorStop(i / stops, hsl(h + 200 + (i / stops) * state.spread, 100 * state.sat, 52 + 18 * Math.sin(i + t)));
    }
    return g;
  }

  function measureLines(ctx, lines, trk) {
    var ws = [], tw = [], maxw = 0, i, j;
    for (i = 0; i < lines.length; i++) {
      var chars = Array.from(lines[i]);
      var arr = [], sum = 0;
      for (j = 0; j < chars.length; j++) { var w = ctx.measureText(chars[j]).width; arr.push(w); sum += w; }
      sum += trk * Math.max(0, chars.length - 1);
      ws.push(arr); tw.push(sum);
      if (sum > maxw) maxw = sum;
    }
    return { ws: ws, tw: tw, maxw: maxw };
  }

  function drawTextLayer(t) {
    var ctx = L.text.x;
    var S = state.res;
    ctx.clearRect(0, 0, W, H);
    var lines = String(state.text || " ").split("\n");
    var fontStr = function (fs) { return (state.italic ? "italic " : "") + state.weight + " " + fs + "px " + (FONTS[state.fontKey] || FONTS.impact); };

    /* 自动缩放：字号与字距一起缩，迭代收敛，保证长句落进 92% × 86% 的安全区 */
    var fs = state.fontSize * S;
    var trk = state.tracking * S;
    var m = null;
    for (var fit = 0; fit < 4; fit++) {
      ctx.font = fontStr(fs);
      m = measureLines(ctx, lines, trk);
      if (!state.autoFit) break;
      var totalH0 = (lines.length - 1) * fs * state.lineHeight;
      var sc = Math.min(1,
        (W * 0.92) / Math.max(1, m.maxw),
        (H * 0.86) / Math.max(1, totalH0 + fs));
      if (sc >= 0.999) break;
      fs *= sc; trk *= sc;
    }

    var lh = fs * state.lineHeight;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineJoin = "round";

    var totalH = (lines.length - 1) * lh;
    var y0 = H / 2 - totalH / 2;
    var seg = Math.floor(t * 6);
    var seg2 = Math.floor(t * 11);

    for (var li = 0; li < lines.length; li++) {
      var chars = Array.from(lines[li]);
      var tw = m.tw[li];
      var x0 = state.align === "center" ? (W - tw) / 2 : (state.align === "right" ? W - tw - 24 * S : 24 * S);
      var yy = y0 + li * lh;

      ctx.fillStyle = textFillStyle(ctx, x0, yy, tw, fs);
      if (state.strokeW > 0.01) {
        ctx.lineWidth = state.strokeW * S;
        ctx.strokeStyle = state.fillMode === "outline"
          ? hsl(state.hue + 200 + li * state.spread * 0.2, 100, 72)
          : hsl(state.hue + state.strokeHue + li * 30, 100, 62, 0.9);
      }
      var x = x0;
      for (var ci = 0; ci < chars.length; ci++) {
        var ch = chars[ci];
        if (state.corrupt > 0.001 && ch !== " " && hash2(ci * 3.7 + li * 91.3, seg) < state.corrupt * 0.55) ch = rndGlyph();
        var jx = state.jitter ? (hash2(ci * 17.1 + li * 3.3, seg2) - 0.5) * state.jitter * S : 0;
        var jy = state.jitter ? (hash2(ci * 5.9 + li * 41.7, seg2) - 0.5) * state.jitter * S : 0;
        var wy = state.wave ? Math.sin(t * 2.2 + ci * 0.45 + li * 1.3) * state.wave * S : 0;
        if (state.fillMode === "prism") {
          ctx.fillStyle = hsl(state.hue + 180 + (ci / Math.max(1, chars.length)) * state.spread + li * 24, 100 * state.sat, 66);
        }
        if (ch !== " ") {
          if (state.strokeW > 0.01) ctx.strokeText(ch, x + jx, yy + jy + wy);
          ctx.fillText(ch, x + jx, yy + jy + wy);
        }
        x += m.ws[li][ci] + trk;
      }
    }
    return { top: y0 - fs / 2, bot: y0 + totalH + fs / 2 };
  }

  /* -------------------------------------------------------- 漂浮乱码粒子 */
  function drawGlyphs(ctx, t, count, scale, alphaMul) {
    var gAmt = eff("glyphs");
    if (gAmt <= 0.001) return;
    var n = Math.round(glyphs.length * gAmt * count);
    var sp = eff("glyphSpeed");
    ctx.globalCompositeOperation = "lighter";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (var i = 0; i < n; i++) {
      var g = glyphs[i];
      g.x += g.vx * sp; g.y += g.vy * sp;
      if (g.y > H + 30) g.y = -30; if (g.y < -30) g.y = H + 30;
      if (g.x > W + 30) g.x = -30; if (g.x < -30) g.x = W + 30;
      if (Math.random() < 0.07) g.ch = rndGlyph();
      var sz = g.size * scale;
      ctx.font = "700 " + sz + "px " + FONTS.mono;
      if (g.bl) {
        ctx.fillStyle = hsl(state.hue + g.hue + 180, 100, 60, g.a * 0.5 * alphaMul);
        ctx.fillRect(g.x, g.y, sz * rnd(0.6, 1.6), sz * 0.25);
      } else {
        ctx.fillStyle = hsl(state.hue + g.hue + 170, 100, 72, g.a * alphaMul);
        ctx.fillText(g.ch, g.x, g.y);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------------------------------------------------------- 切片撕裂 */
  function sliceGlitch(ctx) {
    var sl = eff("slice"), sn = eff("sliceN");
    if (sl <= 0.001) return;
    var n = Math.round(sn);
    var p = sl * 0.55;
    for (var i = 0; i < n; i++) {
      if (Math.random() > p) continue;
      var y = Math.random() * H;
      var h = (2 + Math.random() * H * 0.07) * sl;
      if (h < 1) h = 1;
      var dx = (Math.random() - 0.5) * W * 0.3 * sl;
      ctx.drawImage(ctx.canvas, 0, y, W, h, dx, y, W, h);
      if (Math.random() < 0.25) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 * sl;
        ctx.drawImage(ctx.canvas, 0, y, W, h, -dx * 0.6, y, W, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  /* ------------------------------------------------ 像素级后处理（核心） */
  function postProcess(t) {
    var S = state.res;
    var img = L.base.x.getImageData(0, 0, W, H);
    var d = img.data, o = outData.data;
    var cx = W / 2, cy = H / 2;
    var wf = state.warpFreq / S;
    var amp = eff("warp") * S;
    var barrel = state.barrel;
    var melt = eff("melt");
    var scan = eff("scan");
    var sf = eff("scanFreq");
    var noiseA = eff("noise") * 70;
    var contrast = eff("contrast");
    var fade = eff("fade");
    var vigA = eff("vignette");
    var burst = (t < burstUntil) ? 1 : 0;
    var sh = Math.round((eff("rgbShift") * (1 + eff("chromaPulse") * Math.sin(t * 3.1)) + burst * 26) * S);
    var invert = burst && !state.lowPower && Math.random() < 0.35;

    for (var y = 0; y < H; y++) {
      var ny = (y - cy) / cy;
      rowA[y] = Math.sin(y * wf + t * 1.3) * amp;
      rowB[y] = Math.cos(y * wf * 0.62 - t * 0.77) * amp * 0.5;
      rowSc[y] = 1 + barrel * ny * ny;
      scanArr[y] = 1 - scan * (0.55 + 0.45 * Math.sin(y * 0.32 * sf + t * 5.5)) * ((y & 1) ? 1 : 0.42);
    }
    var acc = 0;
    for (var y2 = 0; y2 < H; y2++) {
      if (Math.random() < melt * 0.2) acc = Math.min(30, acc + 1 + Math.random() * 4);
      else acc *= 0.7;
      meltArr[y2] = -acc * S;
    }
    for (var x = 0; x < W; x++) {
      var nx = (x - cx) / cx;
      colA[x] = Math.sin(x * wf * 0.85 - t * 0.95) * amp * 0.6;
      colSc[x] = 1 + barrel * nx * nx;
    }

    var ni = (Math.random() * NOISE_N) | 0;
    var q = 0;
    for (var yy = 0; yy < H; yy++) {
      var ra = rowA[yy], rb = rowB[yy], rs = rowSc[yy], ml = meltArr[yy], sc = scanArr[yy];
      var sy = yy + rb + ml;
      if (sy < 0) sy = 0; else if (sy >= H) sy = H - 1;
      var iy = sy | 0;
      var base = iy * W;
      var vrow = yy * W;
      for (var xx = 0; xx < W; xx++) {
        var sx = cx + (xx - cx) * rs + ra + colA[xx];
        if (sx < 0) sx = 0; else if (sx >= W) sx = W - 1;
        var ix = sx | 0;
        var p = (base + ix) << 2;

        var xr = ix + sh; if (xr < 0) xr = 0; else if (xr >= W) xr = W - 1;
        var xb = ix - sh; if (xb < 0) xb = 0; else if (xb >= W) xb = W - 1;

        var r = d[((base + xr) << 2)];
        var g = d[p + 1];
        var b = d[((base + xb) << 2) + 2];

        var m = sc;
        r *= m; g *= m; b *= m;

        if (noiseA > 0.01) {
          var n1 = NOISE[(ni = (ni + 1) & NOISE_M)];
          var nv = n1 * (noiseA / 127);
          r += nv; g += nv; b += nv;
        }
        if (fade > 0.001) {
          var l = 0.299 * r + 0.587 * g + 0.114 * b;
          var sr = l * 1.12 + 16, sg = l * 1.0 + 10, sb = l * 0.82 + 4;
          r += (sr - r) * fade; g += (sg - g) * fade; b += (sb - b) * fade;
        }
        if (contrast !== 1) {
          r = (r - 128) * contrast + 128;
          g = (g - 128) * contrast + 128;
          b = (b - 128) * contrast + 128;
        }
        if (vigA > 0.001) {
          var vr = vig[vrow + xx];
          var vm = 1 - vigA * vr * vr * 1.25;
          if (vm < 0) vm = 0;
          r *= vm; g *= vm; b *= vm;
        }
        if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }

        o[q] = r < 0 ? 0 : (r > 255 ? 255 : r);
        o[q + 1] = g < 0 ? 0 : (g > 255 ? 255 : g);
        o[q + 2] = b < 0 ? 0 : (b > 255 ? 255 : b);
        q += 4;
      }
    }
    octx.putImageData(outData, 0, 0);
  }

  /* --------------------------------------------------------- bloom / echo */
  function applyBloom() {
    var bl = eff("bloom");
    if (bl <= 0.01) return;
    var b = L.bloom, bw = b.c.width, bh = b.c.height;
    b.x.globalCompositeOperation = "source-over";
    b.x.clearRect(0, 0, bw, bh);
    b.x.drawImage(canvas, 0, 0, bw, bh);
    octx.globalCompositeOperation = "lighter";
    octx.globalAlpha = Math.min(1, bl * 0.5);
    octx.drawImage(b.c, 0, 0, W, H);
    octx.globalAlpha = Math.min(1, bl * 0.3);
    octx.drawImage(b.c, -W * 0.01, -H * 0.01, W * 1.02, H * 1.02);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = "source-over";
  }

  function applyEcho() {
    var ec = eff("echo");
    if (ec <= 0.01) return;
    var e = L.echo;
    octx.globalCompositeOperation = "lighter";
    octx.globalAlpha = ec * 0.9;
    var s = 1 + eff("zoomTrail") * 0.006;
    octx.drawImage(e.c, cx2(s), cy2(s), W * s, H * s);
    octx.globalAlpha = 1;
    octx.globalCompositeOperation = "source-over";

    e.x.globalCompositeOperation = "destination-out";
    e.x.globalAlpha = Math.min(1, 1 - ec);
    e.x.fillStyle = "#000";
    e.x.fillRect(0, 0, W, H);
    e.x.globalCompositeOperation = "source-over";
    e.x.globalAlpha = 1;
    e.x.drawImage(canvas, 0, 0);
  }
  function cx2(s) { return (W - W * s) / 2; }
  function cy2(s) { return (H - H * s) / 2; }

  /* ------------------------------------------------------------- HUD 叠加 */
  function drawHUD(t) {
    if (!state.hud) return;
    var S = state.res;
    octx.save();
    octx.globalCompositeOperation = "lighter";
    octx.font = "700 " + (16 * S) + "px " + FONTS.mono;
    var blink = Math.sin(t * 6) > -0.3;
    octx.fillStyle = "rgba(255,60,90,0.95)";
    if (blink) { octx.beginPath(); octx.arc(34 * S, 32 * S, 7 * S, 0, 6.3); octx.fill(); }
    octx.fillText("REC", 50 * S, 38 * S);
    var tc = fmtTimecode(t);
    octx.fillStyle = "rgba(200,255,240,0.85)";
    octx.textAlign = "right";
    octx.fillText(tc, W - 26 * S, 38 * S);
    octx.fillStyle = "rgba(180,120,255,0.7)";
    octx.textAlign = "left";
    var junk = "";
    for (var i = 0; i < 18; i++) junk += rndGlyph();
    octx.font = "700 " + (13 * S) + "px " + FONTS.mono;
    octx.fillText(junk, 26 * S, H - 26 * S);
    octx.restore();
  }
  function fmtTimecode(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t * 30) % 30);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s + ":" + (f < 10 ? "0" : "") + f;
  }

  /* ------------------------------------------------------------- 主循环 */
  function drawFrame() {
    var bctx = L.base.x;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.globalAlpha = 1;

    if (Math.random() < eff("burst") * 0.035) burstUntil = t + rnd(0.06, 0.22);

    drawBG(bctx, t);

    if (state.skew) {
      var sk = Math.tan(state.skew * Math.PI / 180);
      bctx.setTransform(1, 0, sk, 1, -sk * H / 2, 0);
    }
    drawGlyphs(bctx, t, 0.7, 1, 0.55);

    var box = drawTextLayer(t);

    var g1 = L.g1, g2 = L.g2;
    g1.x.clearRect(0, 0, g1.c.width, g1.c.height);
    g1.x.drawImage(L.text.c, 0, 0, g1.c.width, g1.c.height);
    g2.x.clearRect(0, 0, g2.c.width, g2.c.height);
    g2.x.drawImage(L.text.c, 0, 0, g2.c.width, g2.c.height);

    var gl = eff("glow") / 260;
    bctx.globalCompositeOperation = "lighter";
    if (gl > 0.001) {
      bctx.globalAlpha = Math.min(1, gl * 0.9);
      bctx.drawImage(g1.c, 0, 0, W, H);
      bctx.globalAlpha = Math.min(1, gl * 0.7);
      bctx.drawImage(g2.c, 0, 0, W, H);
    }
    if (state.mirror && state.mirrorA > 0.01) {
      bctx.globalAlpha = state.mirrorA;
      bctx.save();
      bctx.translate(0, box.bot * 2 + state.fontSize * state.res * 0.12);
      bctx.scale(1, -1);
      bctx.drawImage(L.text.c, 0, 0);
      bctx.restore();
    }
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = "source-over";
    bctx.drawImage(L.text.c, 0, 0);

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    drawGlyphs(bctx, t, 0.45, 1.6, 0.35);
    sliceGlitch(bctx);

    postProcess(t);
    applyBloom();
    drawHUD(t);
    applyEcho();

    if (flash > 0) {
      octx.globalCompositeOperation = "lighter";
      octx.fillStyle = "rgba(255,255,255," + Math.min(0.25, flash) + ")";
      octx.fillRect(0, 0, W, H);
      octx.globalCompositeOperation = "source-over";
      flash -= 0.08;
    }
  }

  var lastWall = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    lastWall = ts;
    var interval = 1000 / state.targetFps;
    if (ts - lastFrame < interval) return;
    lastFrame = ts;
    fpsN++;
    if (ts - fpsT > 700) {
      fps = Math.round((fpsN * 1000) / (ts - fpsT));
      fpsN = 0; fpsT = ts;
      var el = ROOT.querySelector("#od-fps");
      if (el) el.textContent = fps + " fps · " + W + "×" + H;
    }
    if (state.playing) t += 1 / state.targetFps;
    drawFrame();
  }

  /* --------------------------------------------------------------- 动作 */
  function exportPNG() { return canvas.toDataURL("image/png"); }
  function downloadPNG() {
    var url = exportPNG();
    var a = document.createElement("a");
    a.href = url;
    a.download = "oddemon_" + Date.now() + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    kick(0.4);
  }

  var RANGE = {};
  var NO_RAND = { res: 1, targetFps: 1, stageW: 1 };
  function buildRanges() {
    SCHEMA.forEach(function (g) {
      g.items.forEach(function (it) {
        if (it.t === "range") RANGE[it.k] = [it.min, it.max];
      });
    });
  }
  function randomize() {
    Object.keys(DEFAULTS).forEach(function (k) {
      if (typeof DEFAULTS[k] !== "number") return;
      if (NO_RAND[k]) return;
      var d = DEFAULTS[k];
      var span = Math.abs(d) * 0.6 + 0.2;
      var v = d + rnd(-span, span);
      if (RANGE[k]) v = clamp(v, RANGE[k][0], RANGE[k][1]);
      if (k === "hue") v = ((v % 360) + 360) % 360;
      if (k === "weight") v = Math.round(v / 100) * 100;
      state[k] = v;
    });
    if (Math.random() < 0.4) state.bgMode = ["mesh", "grid", "cloud", "rainbow", "void", "geo"][(Math.random() * 6) | 0];
    if (Math.random() < 0.35) state.fillMode = ["gradient", "chrome", "prism", "solid", "outline"][(Math.random() * 5) | 0];
    if (Math.random() < 0.3) state.fontKey = Object.keys(FONTS)[(Math.random() * 7) | 0];
    if (Math.random() < 0.35) state.geoType = ["platonic", "metatron", "flower", "mandala", "lattice"][(Math.random() * 5) | 0];
    applyLayout();
    kick(0.4);
  }

  function bindActions() {
    ROOT.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!b) return;
      var a = b.getAttribute("data-act");
      if (a === "play") { state.playing = !state.playing; }
      else if (a === "shot") downloadPNG();
      else if (a === "rand") randomize();
      else if (a === "lang") cycleLang();
      else if (a === "low") { state.lowPower = !state.lowPower; kick(0); }
      else if (a === "zen") { state.zen = !state.zen; applyLayout(); }
      else if (a === "reset") { state = Object.assign({}, DEFAULTS); alloc(); buildPanel(); applyLayout(); }
      else if (a === "full") {
        var s = ROOT.querySelector("#od-stage");
        if (document.fullscreenElement) document.exitFullscreen();
        else if (s.requestFullscreen) s.requestFullscreen();
      }
      syncBar();
    });
    var st = ROOT.querySelector("#od-stage");
    st.addEventListener("dblclick", randomize);
    document.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); state.playing = !state.playing; syncBar(); }
      if (e.key === "r" || e.key === "R") randomize();
      if (e.key === "s" || e.key === "S") downloadPNG();
      if (e.key === "l" || e.key === "L") { state.lowPower = !state.lowPower; kick(0); syncUI(); }
    });
  }

  function buildPresets() {
    var box = ROOT.querySelector("#od-presets");
    box.innerHTML = "";
    var list = window.__OD_PRESETS__ || [];
    list.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "od-chip";
      b.type = "button";
      b.textContent = p.name;
      b.title = p.note || "";
      b.onclick = function () {
        apply(p.params);
        kick(0.3);
        writeHash({ p: p.name });
      };
      box.appendChild(b);
    });
  }

  /* URL hash：#p=预设名 & lang=语言码 */
  function writeHash(patch) {
    try {
      var h = (location.hash || "").replace(/^#/, "");
      var parts = {};
      if (h) h.split("&").forEach(function (kv) {
        var i = kv.indexOf("=");
        if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1);
      });
      Object.keys(patch).forEach(function (k) {
        if (patch[k] === null) delete parts[k];
        else parts[k] = encodeURIComponent(patch[k]);
      });
      var out = Object.keys(parts).map(function (k) { return k + "=" + parts[k]; }).join("&");
      history.replaceState(null, "", out ? "#" + out : "#");
    } catch (e) { /* 忽略 */ }
  }
  function langName(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i][1];
    return code;
  }
  function cycleLang() {
    var idx = 0;
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === state.uiLang) idx = i;
    state.uiLang = LANGS[(idx + 1) % LANGS.length][0];
    buildPanel();
    writeHash({ lang: state.uiLang });
  }
  function applyHash() {
    var needRebuild = false;
    try {
      var h = location.hash || "";
      var ml = h.match(/lang=([^&]+)/);
      if (ml) {
        var lg = decodeURIComponent(ml[1]);
        if (I18N[lg] && lg !== state.uiLang) { state.uiLang = lg; needRebuild = true; }
      } else {
        /* 无显式语言时跟随浏览器；不支持的语言回退中文 */
        var nav = String(navigator.language || "zh").slice(0, 2).toLowerCase();
        if (I18N[nav] && nav !== state.uiLang) { state.uiLang = nav; needRebuild = true; }
      }
      var m = h.match(/p=([^&]+)/);
      if (m) {
        var name = decodeURIComponent(m[1]);
        var ps = window.__OD_PRESETS__ || [];
        for (var i = 0; i < ps.length; i++) {
          if (ps[i].name === name) { apply(ps[i].params); break; }
        }
      }
    } catch (e) { /* hash 不合法就当没看见 */ }
    /* 关键：语言必须在面板构建之后生效，否则界面仍是启动时的语言 */
    if (needRebuild) buildPanel();
  }

  /* ===================================================================
   *  页面固定文案（页头 / Gradio 服务端区）的多语言
   *  每行 = [zh, en, ru, es, ja]，按「任意语言原文匹配 → 替换为当前语言」。
   *  匹配前会把所有空白折叠成单空格，因此全角空格 / 换行 / Markdown 反引号
   *  造成的差异不会导致漏翻。
   * =================================================================== */
  var CHROME_TEXT = [
    ["ODDEMON · 文字 → 艺术字实时生成器",
     "ODDEMON · Text → Generative Typography (Live)",
     "ODDEMON · Текст → Генеративная типографика (Live)",
     "ODDEMON · Texto → Tipografía generativa (en vivo)",
     "ODDEMON ・ テキスト → ジェネラティブ活字（リアルタイム）"],
    ["这不是梦核，不是电波，不是任何一种可以贴在墙上的标签。它是一种个人特色鲜明的反抗精神艺术：拒绝被给定的形式。文字的本质，在这里被改写为——对「是等于否」这一等式的一次可视化验算。",
     "This is not dreamcore, not denpa, not any label you can stick on a wall. It is a defiant, deeply personal art form: a refusal of the given form. The nature of text, here, is rewritten as — a visual verification of the equation \"yes equals no\".",
     "Это не дримкор и не денпа, и не ярлык, который можно наклеить на стену. Это бунтарское искусство с ярко выраженной личной природой: отказ от заданной формы. Природа текста здесь переписана как — визуальная проверка уравнения «да равно нет».",
     "Esto no es dreamcore ni denpa, ni ninguna etiqueta que puedas pegar en la pared. Es un arte de rebeldía profundamente personal: un rechazo de la forma dada. La naturaleza del texto, aquí, se reescribe como — una verificación visual de la ecuación «sí es igual a no».",
     "これはドリームコアでも電波系でも、壁に貼れるどんなレッテルでもない。与えられた形式を拒む、極めて個人的な反抗の芸術だ。文字の本質はここで書き換えられる――「イコール・イズ・ノー」という等式の、視覚的な検算として。"],
    ["说白了：往左上打字，往右下拉滑块，一直拉到你自己有点晕。这就对了。",
     "Plainly: type up top, drag the sliders on the right, keep dragging until you feel a little dizzy. That's it.",
     "Проще говоря: печатай сверху, тяни ползунки справа и тяни, пока самому не станет слегка головокружительно. Вот и всё.",
     "Llano y simple: escribe arriba, arrastra los controles de la derecha y sigue hasta que te marees un poco. Eso es todo.",
     "はっきり言う：上で打って、右のスライダーを引き、自分が少し眩くなるまで引く。それで正しい。"],
    ["空格 播放/暂停 · R 随机扰动 · S 导出 PNG · L 低烈度 · 双击画面 = 重新投胎",
     "Space play/pause · R randomize · S export PNG · L low-intensity · double-click the stage = reincarnate",
     "Пробел пуск/пауза · R случайно · S сохранить PNG · L щадящий · двойной клик по сцене = реинкарнация",
     "Espacio reproducir/pausa · R aleatorio · S exportar PNG · L modo suave · doble clic en el lienzo = reencarnar",
     "スペース 再生/停止 · R ランダム · S PNG出力 · L 弱モード · 画面ダブルクリック = 転生"],
    ["界面语言：中文 / English / Русский / Español / 日本語（在「运行 · RUN」分组里切换）",
     "UI language: 中文 / English / Русский / Español / 日本語 (switch it under RUN)",
     "Язык интерфейса: 中文 / English / Русский / Español / 日本語 (переключение в разделе ЗАПУСК)",
     "Idioma: 中文 / English / Русский / Español / 日本語 (cámbialo en EJECUCIÓN)",
     "表示言語：中文 / English / Русский / Español / 日本語（「実行」グループで切替）"],
    ["服务端 · Python 侧（神谕 / 预设 / 落盘 / 参数）",
     "Server side · Python (oracle / presets / export / params)",
     "Сервер · Python (оракул / пресеты / экспорт / параметры)",
     "Servidor · Python (oráculo / preajustes / exportar / parámetros)",
     "サーバー側 ・ Python（神託 / プリセット / 保存 / パラメータ）"],
    ["✦ 神谕抽取 · 随机文案", "✦ Oracle text · random copy", "✦ Оракул · случайный текст",
     "✦ Oráculo · texto aleatorio", "✦ 神託抽出 ・ ランダム文"],
    ["预设（注入整套参数）", "Preset (inject a full set)", "Пресет (внедрить набор)",
     "Preajuste (inyectar un conjunto)", "プリセット（一式を適用）"],
    ["☾ 低烈度模式（切换）", "☾ Low-intensity mode (toggle)", "☾ Щадящий режим (переключить)",
     "☾ Modo suave (alternar)", "☾ 弱モード（切替）"],
    ["⤓ 落盘 PNG（服务端）", "⤓ Save PNG (server)", "⤓ Сохранить PNG (сервер)",
     "⤓ Guardar PNG (servidor)", "⤓ PNG 保存（サーバー）"],
    ["⇪ 导出参数 JSON", "⇪ Export params JSON", "⇪ Экспорт параметров JSON",
     "⇪ Exportar parámetros JSON", "⇪ パラメータ JSON 出力"],
    ["变异数量", "Variant count", "Число вариантов", "Nº de variantes", "変异数"],
    ["⇪ 批量变异参数", "⇪ Batch mutate params", "⇪ Пакетная мутация параметров",
     "⇪ Mutación de parámetros por lotes", "⇪ パラメータ一括変異"],
    ["导入参数 JSON", "Import params JSON", "Импорт параметров JSON",
     "Importar parámetros JSON", "パラメータ JSON 取込"],
    ["产物", "Output", "Результат", "Resultado", "成果物"],
    ["等待指令。", "Awaiting instruction.", "Ожидаю команду.", "Esperando instrucciones.", "指示待ち。"],
  ];
  /* 比较时剥掉全部空白：Markdown 的换行 / 全角空格 / 反引号不会造成漏翻 */
  function normText(v) { return String(v).replace(/\s+/g, ""); }
  var INLINE_TAGS = { CODE: 1, SPAN: 1, STRONG: 1, EM: 1, B: 1, I: 1, A: 1, BR: 1, SMALL: 1 };
  function hasBlockChild(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (el.children[i].tagName === "BUTTON") continue;
      if (!INLINE_TAGS[el.children[i].tagName]) return true;
    }
    return false;
  }
  function langIndex(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return i;
    return 0;
  }
  function applyChromeI18n() {
    if (!ROOT) return;
    var li = langIndex(state.uiLang);
    var els = document.querySelectorAll(
      "#od-header h1, #od-header p, #od-header blockquote, #od-header blockquote p, " +
      "#od-pyzone h4, #od-pyzone button, #od-pyzone label span, #od-pyzone .prose > p");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      /* 只跳过含块级子元素的容器（例如 <blockquote><p>…），避免整段覆盖掉子节点；
         行内子元素（<code>/<strong>/<span>）允许整体替换文本 */
      if (hasBlockChild(el)) continue;
      var cur = normText(el.textContent);
      if (!cur) continue;
      for (var r = 0; r < CHROME_TEXT.length; r++) {
        var row = CHROME_TEXT[r], hit = false;
        for (var c = 0; c < row.length; c++) {
          if (normText(row[c]) === cur) { hit = true; break; }
        }
        if (hit) { el.textContent = row[li]; break; }
      }
    }
  }

  function apply(obj) {
    if (!obj) return;
    var langBefore = state.uiLang;
    Object.assign(state, obj);
    if (obj.aspect !== undefined || obj.res !== undefined) alloc();
    if (obj.uiLang !== undefined && obj.uiLang !== langBefore) buildPanel();
    syncUI();
    applyLayout();
  }

  /* ------------------------------------------------------- 与 Python 桥接 */
  function findInput(id) {
    var el = document.querySelector(id);
    if (!el) return null;
    return el.matches && el.matches("input,textarea") ? el : el.querySelector("textarea,input");
  }
  function startBridge() {
    var last = "";
    setInterval(function () {
      var f = findInput("#od-bridge");
      if (!f) return;
      var v = f.value || "";
      if (v && v !== last) {
        last = v;
        try {
          var msg = JSON.parse(v);
          if (msg.cmd === "params") apply(msg.params);
          else if (msg.cmd === "text") { state.text = msg.value; syncUI(); }
          else if (msg.cmd === "act" && msg.value === "shot") downloadPNG();
          else if (msg.cmd === "act" && msg.value === "rand") randomize();
          else if (msg.cmd === "act" && msg.value === "low") { state.lowPower = !state.lowPower; syncUI(); syncBar(); }
        } catch (e) { /* 忽略非法载荷 */ }
      }
    }, 120);

    /* 任何落在 Python 控件区的点击：先把画布与参数写回隐藏输入框 */
    document.addEventListener("click", function (e) {
      var tgt = e.target;
      if (!tgt || !tgt.closest) return;
      if (!tgt.closest("#od-pyzone")) return;
      var pf = findInput("#od-png");
      if (pf) { pf.value = exportPNG(); pf.dispatchEvent(new Event("input", { bubbles: true })); }
      var qf = findInput("#od-params");
      if (qf) { qf.value = JSON.stringify(state); qf.dispatchEvent(new Event("input", { bubbles: true })); }
    }, true);
  }

  /* ---------------------------------------------------------------- 启动 */
  function mount() {
    var host = document.getElementById("od-mount");
    if (!host) return false;
    if (host.dataset.odMounted === "1") return true;
    host.dataset.odMounted = "1";
    /* 作为兄弟节点插入：即便 Gradio 重渲染该 HTML 组件，渲染根也不会被抹掉 */
    host.style.display = "none";
    var parent = host.parentNode || document.body;
    parent.insertBefore(buildDOM(), host.nextSibling);
    document.body.classList.add("od-page");
    canvas = ROOT.querySelector("#od-canvas");
    buildRanges();
    initGeo();
    alloc();
    buildPanel();
    buildPresets();
    bindActions();
    applyLayout();
    applyHash();
    startBridge();
    requestAnimationFrame(loop);
    /* 看门狗：无头截图、后台标签等被节流的环境里 rAF 不回调，用 setInterval 兜底 */
    setInterval(function () {
      var now = performance.now();
      if (now - lastWall > 380) loop(now);
    }, 220);
    return true;
  }

  function boot() {
    if (mount()) return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (mount()) { clearInterval(iv); return; }
      if (tries > 150) clearInterval(iv);
    }, 100);
  }

  window.oddemon = {
    apply: apply,
    get state() { return state; },
    exportPNG: exportPNG,
    randomize: randomize,
    setLang: function (l) { if (I18N[l]) { state.uiLang = l; buildPanel(); syncBar(); applyLayout(); } },
    toJSON: function () { return JSON.parse(JSON.stringify(state)); },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
