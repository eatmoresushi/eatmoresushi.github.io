/*
 * In-page script of the printable Order card sheets (tools/print/printOrderCards.ts).
 * Plain browser JavaScript, injected as-is into the generated HTML.
 *
 * 1. Paints the card parchment (paper colour, darkened edge, highlight and a seeded texture) as
 *    one opaque, non-repeating PNG data URL that every card shows once (see `cardPaper`).
 * 2. Pre-composites every ceramic the cards need: the neutral cutout with its Glaze colour
 *    multiplied through the cutout's alpha (src/app/pieces/CeramicArt: `--glz-*`, mask +
 *    multiply), trimmed to its silhouette, as PNG data URLs, so the PDF needs no CSS blend modes.
 *    Checks that every Glaze (and the untinted "any Glaze") stays distinguishable on paper.
 * 3. Lays out each card's illustration (single, alternatives side by side, overlapping group).
 * 4. Sets the text and the reward icons at one size for the whole deck: the requirement at
 *    `fit.req.size` (a card whose requirement cannot fit first tightens its leading, then
 *    shrinks), the quality line at the largest size at which every card's fits on one line, the
 *    icons at the largest size at which every reward row fits. A requirement clause wider than
 *    the box breaks between its items and takes lines of its own. A line-final full-width
 *    "；"/"，"/"、" loses its blank right half, so centred Chinese lines centre on their ink.
 * 5. Checks every card (printed text equals the rulebook string, numbers and icon counts, no
 *    overflow, all text ≥ 2.5 mm inside the cut) and every sheet (nothing printed below its
 *    used rows), and publishes `window.__PRINT_REPORT`.
 * 6. Card backs: paints the medallion's faint kiln drawing once (see `medalArt`) and checks
 *    every back sheet: it follows its front, has no cut lines, and draws everything in one
 *    page-sized SVG whose user unit is exactly 1 mm on a whole-pixel box (nothing snapped); one
 *    continuous field reaches at least `minBleed` mm beyond its outer cuts; after a flip on the
 *    long edge (x → 210 − x) and after one on the short edge (y → 297 − y) every front card,
 *    placed by its cut lines, has exactly one back of its own deck on it; every mark on a back,
 *    strokes included, stays at least `safe` mm inside each cut.
 */
(async () => {
  "use strict";
  const input = window.__PRINT_INPUT;
  const report = { errors: [], info: [], sizes: {} };
  const MM = 96 / 25.4;
  const SAFE_MM = 2.5;

  const fail = (message) => report.errors.push(message);

  /** mulberry32: a small seeded PRNG, so the texture is identical on every build. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Resolution of the card parchment image, px per mm (330 dpi). */
  const PAPER_PX_PER_MM = 13;

  /** Any CSS colour → [r, g, b, a], through the canvas's own normalisation. */
  function cssColour(value) {
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = "#010203";
    probe.fillStyle = value;
    const normal = probe.fillStyle;
    if (normal === "#010203" && value.replace(/\s/g, "").toLowerCase() !== "#010203") throw new Error(`not a colour: ${value}`);
    if (normal.startsWith("#")) return [1, 3, 5].map((i) => parseInt(normal.slice(i, i + 2), 16)).concat(1);
    const [r, g, b, a = 1] = normal.match(/[\d.]+/g).map(Number);
    return [r, g, b, a];
  }

  /**
   * The whole parchment of a card, as one opaque PNG painted once over the card. Bottom to top:
   * the paper colour, the darkened edge, the warm highlight behind the picture (both as the CSS
   * radial gradients they replace), and a seeded texture of soft mottling, fibres and specks, the
   * same on every build and every card. No part of it repeats and nothing in it is transparent:
   * Apple's PDF renderer (Preview, and printing from it) draws faint hairline seams where the
   * cells of a semi-transparent repeating tile meet, which the earlier 25 mm tile showed.
   */
  function cardPaper(widthMm, heightMm) {
    const style = getComputedStyle(document.documentElement);
    const colour = (name) => cssColour(style.getPropertyValue(name).trim() || "invalid");
    const paper = colour("--paper");
    const hi = colour("--paper-hi");
    const edge = colour("--paper-edge");
    const W = widthMm;
    const H = heightMm;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * PAPER_PX_PER_MM);
    canvas.height = Math.round(H * PAPER_PX_PER_MM);
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.scale(canvas.width / W, canvas.height / H); // millimetres from here on
    const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
    ctx.fillStyle = rgba(paper, 1);
    ctx.fillRect(0, 0, W, H);

    // CSS `radial-gradient(ellipse rx ry at cx cy, …)`. A stop's transparent end keeps the
    // colour of its opaque end, which is what CSS's premultiplied interpolation shows.
    const ellipse = (cx, cy, rx, ry, stops) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [at, c, a] of stops) g.addColorStop(at, rgba(c, a));
      ctx.fillStyle = g;
      ctx.fillRect(-cx / rx, -cy / ry, W / rx, H / ry);
      ctx.restore();
    };
    // ellipse 85% 80% at 50% 50%: transparent 62%, --paper-edge 100%.
    ellipse(W / 2, H / 2, 0.85 * W, 0.8 * H, [[0.62, edge, 0], [1, edge, edge[3]]]);
    // ellipse 70% 55% at 50% 38%: --paper-hi 0%, transparent 72%.
    ellipse(W / 2, 0.38 * H, 0.7 * W, 0.55 * H, [[0, hi, hi[3]], [0.72, hi, 0]]);

    // Texture, at the scale and density of the earlier tile (25 mm = 320 of its pixels; 60
    // mottles, 46 fibres and 500 specks per 25 mm square). Mottles and fibres are also seeded
    // just beyond the cut, so the edge is as textured as the middle.
    const PX = 25 / 320;
    const random = rng(0x4b494c4e);
    const count = (perSquare, margin) => Math.round((perSquare * (W + 2 * margin) * (H + 2 * margin)) / 625);
    const spot = (margin) => [-margin + random() * (W + 2 * margin), -margin + random() * (H + 2 * margin)];
    const mottleMargin = 104 * PX;
    for (let i = 0, n = count(60, mottleMargin); i < n; i += 1) {
      const [x, y] = spot(mottleMargin);
      const r = (24 + random() * 80) * PX;
      const dark = random() < 0.5;
      const alpha = 0.012 + random() * 0.02;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, dark ? `rgba(150,110,58,${alpha})` : `rgba(255,252,240,${alpha * 1.6})`);
      g.addColorStop(1, "rgba(150,110,58,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.lineCap = "round";
    const fibreMargin = 28 * PX;
    for (let i = 0, n = count(46, fibreMargin); i < n; i += 1) {
      const [x, y] = spot(fibreMargin);
      const len = (6 + random() * 22) * PX;
      const angle = random() * Math.PI;
      const bend = (random() - 0.5) * 8 * PX;
      ctx.strokeStyle = `rgba(140,102,52,${0.03 + random() * 0.04})`;
      ctx.lineWidth = (0.6 + random() * 0.7) * PX;
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2 - bend, x2, y2);
      ctx.stroke();
    }
    for (let i = 0, n = count(500, 0); i < n; i += 1) {
      ctx.fillStyle = `rgba(120,86,44,${0.03 + random() * 0.05})`;
      const s = (0.6 + random() * 1.1) * PX;
      const [x, y] = spot(0);
      ctx.fillRect(x, y, s, s);
    }
    return canvas.toDataURL("image/png");
  }

  // ---- Ceramics ---------------------------------------------------------------------------

  const sources = new Map();
  async function source(shape, decoration) {
    const key = `${shape}-${decoration}`;
    if (!sources.has(key)) {
      const url = input.cutouts[key];
      if (url === undefined) throw new Error(`no cutout for ${key}`);
      const img = new Image();
      img.src = url;
      sources.set(key, img.decode().then(() => img));
    }
    return sources.get(key);
  }

  const tints = new Map();
  /** The tinted, trimmed ceramic: { url, ar } (aspect ratio width / height). */
  function tinted(figure) {
    const key = `${figure.shape}-${figure.decoration}-${figure.glaze ?? "neutral"}`;
    if (!tints.has(key)) {
      tints.set(key, (async () => {
        const img = await source(figure.shape, figure.decoration);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        if (figure.glaze !== null) {
          const colour = input.glazes[figure.glaze];
          if (colour === undefined) throw new Error(`no colour for Glaze ${figure.glaze}`);
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = colour;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(img, 0, 0);
          ctx.globalCompositeOperation = "source-over";
        }
        const data = ctx.getImageData(0, 0, w, h).data;
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) throw new Error(`empty cutout ${key}`);
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out.getContext("2d").drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        return { url: out.toDataURL("image/png"), ar: cw / ch, key };
      })());
    }
    return tints.get(key);
  }

  // ---- Glaze separation --------------------------------------------------------------------

  /** CIE L*a*b* (D65) of an sRGB triple. */
  function lab([r, g, b]) {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const R = lin(r);
    const G = lin(g);
    const B = lin(b);
    const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
    const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
    const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  }

  /**
   * Mean colour of the Plain Bowl in each Glaze and untinted ("any Glaze"), and the smallest
   * colour difference (ΔE76) between any two: the pictures must tell the Glazes apart.
   */
  async function glazeSeparation() {
    const names = [null, ...Object.keys(input.glazes)];
    const colours = new Map();
    for (const glaze of names) {
      const picture = await tinted({ shape: "bowl", decoration: "plain", glaze });
      const img = new Image();
      img.src = picture.url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const sum = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250) continue;
        sum[0] += data[i];
        sum[1] += data[i + 1];
        sum[2] += data[i + 2];
        n += 1;
      }
      colours.set(glaze ?? "any", lab(sum.map((value) => value / n)));
    }
    const pairs = [];
    const keys = [...colours.keys()];
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const a = colours.get(keys[i]);
        const b = colours.get(keys[j]);
        pairs.push({ pair: `${keys[i]}/${keys[j]}`, de: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) });
      }
    }
    pairs.sort((a, b) => a.de - b.de);
    return pairs;
  }

  /** Relative real-world heights, so a Vase stands taller than a Plate in a group. */
  const NOMINAL_H = { vase: 1.0, censer: 0.8, bowl: 0.7, washer: 0.56, plate: 0.52 };
  const SINGLE = { maxW: 33.5, maxArea: 590 };
  /**
   * Scale caps (mm per nominal unit) for alternatives and groups. A group is otherwise as large
   * as the picture area allows, up to `GROUP_MAX_W` wide, and stands on the picture's floor
   * (like a tall single ceramic), so no empty band opens above the REQUIREMENT heading.
   */
  const KMAX = { alternatives: 17.5, group: 26 };
  const GROUP_MAX_W = 38.5;
  const SHADOW_ROOM = 1.1;
  /**
   * The top of the picture area is shared with the printed ID (top right) and the fret corner
   * (top left). A picture may use it only where it stays clear of both (a centred Vase, the
   * Vase behind a three-ceramic group); otherwise it starts just under the ID's baseline, or at
   * `TOP_ROOM` mm.
   */
  const TOP_ROOM = 2.6;
  const ID_CLEARANCE = 0.7;
  const FRET_EDGE = 6.6;

  /** Unit positions: x = centre, b = baseline height above the lowest baseline, z = paint order. */
  function arrange(layout, items) {
    const n = items.length;
    if (layout === "alternatives" && n === 2) {
      const gap = 0.16;
      items[0].x = -(items[0].w / 2 + gap / 2);
      items[1].x = items[1].w / 2 + gap / 2;
      items.forEach((item) => (item.b = 0));
      return items;
    }
    if (n === 2) {
      const [a, b] = items;
      const back = a.h >= b.h ? a : b;
      const front = back === a ? b : a;
      const overlap = 0.2 * Math.min(a.w, b.w);
      a.x = -(a.w / 2) + overlap / 2;
      b.x = b.w / 2 - overlap / 2;
      back.b = 0.12 * front.h;
      front.b = 0;
      back.z = 0;
      front.z = 1;
      return items;
    }
    // Three: one behind in the middle (the Vase if there is one), two in front.
    let backIndex = items.findIndex((item) => item.shape === "vase");
    if (backIndex < 0) backIndex = 1;
    const back = items[backIndex];
    const fronts = items.filter((_, index) => index !== backIndex);
    const [left, right] = fronts;
    const frontH = Math.max(left.h, right.h);
    if (layout === "alternatives") {
      const gap = 0.1;
      left.x = -(left.w / 2 + gap / 2);
      right.x = right.w / 2 + gap / 2;
      back.b = 0.66 * frontH;
    } else {
      const overlap = 0.02 * Math.min(left.w, right.w);
      left.x = -(left.w / 2) + overlap / 2;
      right.x = right.w / 2 - overlap / 2;
      back.b = 0.5 * frontH;
    }
    back.x = 0;
    left.b = 0;
    right.b = 0;
    back.z = 0;
    left.z = 1;
    right.z = 2;
    return items;
  }

  async function drawArt(art) {
    const layout = art.dataset.layout;
    const figures = JSON.parse(art.dataset.figures);
    const pictures = await Promise.all(figures.map(tinted));
    const W = art.clientWidth / MM;
    const H = art.clientHeight / MM;

    // Obstacles in picture-area millimetres: the ID row's ink (right of `idLeft`, above
    // `idBottom`) and the top-left fret (left of `fretRight`, above `fretBottom`).
    const card = art.closest(".card");
    const artRect = art.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const idLeft = (card.querySelector(".id-row").getBoundingClientRect().left - artRect.left) / MM;
    const idBottom = (card.querySelector(".id-row .baseline").getBoundingClientRect().top - artRect.top) / MM + ID_CLEARANCE;
    const fretRight = FRET_EDGE - (artRect.left - cardRect.left) / MM;
    const fretBottom = FRET_EDGE - (artRect.top - cardRect.top) / MM;
    const clear = (placed) =>
      placed.every((item) => {
        const top = item.base - item.h;
        return (item.left + item.w <= idLeft || top >= idBottom) && (item.left >= fretRight || top >= fretBottom);
      });

    const layoutAt = (top0) => {
      const usableH = H - SHADOW_ROOM - top0;
      if (layout === "single") {
        const { ar } = pictures[0];
        let h = Math.min(usableH, SINGLE.maxW / ar);
        let w = h * ar;
        if (w * h > SINGLE.maxArea) {
          const s = Math.sqrt(SINGLE.maxArea / (w * h));
          w *= s;
          h *= s;
        }
        return [{ picture: pictures[0], w, h, left: (W - w) / 2, base: top0 + (usableH + h) / 2, z: 0 }];
      }
      const items = figures.map((figure, index) => {
        const h = NOMINAL_H[figure.shape];
        return { shape: figure.shape, picture: pictures[index], h, w: h * pictures[index].ar, x: 0, b: 0, z: index };
      });
      arrange(layout, items);
      const minX = Math.min(...items.map((item) => item.x - item.w / 2));
      const maxX = Math.max(...items.map((item) => item.x + item.w / 2));
      const top = Math.max(...items.map((item) => item.b + item.h));
      const maxW = layout === "group" ? Math.min(W - 0.4, GROUP_MAX_W) : W - 0.4;
      const k = Math.min(maxW / (maxX - minX), usableH / top, KMAX[layout]);
      const offsetX = W / 2 - ((minX + maxX) / 2) * k;
      const offsetTop = layout === "group" ? top0 + usableH - top * k : top0 + (usableH - top * k) / 2;
      return items.map((item) => ({
        picture: item.picture,
        w: item.w * k,
        h: item.h * k,
        left: offsetX + (item.x - item.w / 2) * k,
        base: offsetTop + (top - item.b) * k,
        z: item.z,
      }));
    };
    let placed = null;
    for (const top0 of [0, Math.max(0, Math.min(TOP_ROOM, idBottom)), TOP_ROOM]) {
      placed = layoutAt(top0);
      if (clear(placed)) break;
    }
    art.dataset.top = String(Math.round(Math.min(...placed.map((item) => item.base - item.h)) * 100) / 100);
    placed.sort((a, b) => a.z - b.z);
    const fragment = document.createDocumentFragment();
    for (const item of placed) {
      const shadow = document.createElement("i");
      shadow.className = "shadow";
      const sw = item.w * 0.9;
      const sh = Math.max(1.1, Math.min(2.4, item.w * 0.1));
      Object.assign(shadow.style, {
        left: `${item.left + (item.w - sw) / 2}mm`,
        top: `${item.base - sh * 0.55}mm`,
        width: `${sw}mm`,
        height: `${sh}mm`,
      });
      const img = document.createElement("img");
      img.className = "fig";
      img.alt = "";
      img.src = item.picture.url;
      img.dataset.key = item.picture.key;
      Object.assign(img.style, { left: `${item.left}mm`, top: `${item.base - item.h}mm`, width: `${item.w}mm`, height: `${item.h}mm` });
      fragment.append(shadow, img);
    }
    art.append(fragment);
    await Promise.all([...art.querySelectorAll("img")].map((img) => img.decode()));
  }

  // ---- Text fitting -----------------------------------------------------------------------

  const SLACK = 0.25 * MM;

  function fits(box, p) {
    const boxRect = box.getBoundingClientRect();
    const rect = p.getBoundingClientRect();
    return rect.height <= boxRect.height - SLACK && p.scrollWidth <= Math.ceil(boxRect.width) && rect.width <= boxRect.width + 0.01;
  }

  /** Sizes from `max` down to `min` in 0.1 pt steps (exact tenths, no float drift). */
  function* tenths(max, min) {
    for (let t = Math.round(max * 10); t >= Math.round(min * 10); t -= 1) yield t / 10;
  }

  /**
   * Sets `p` at `pt` with line height `lh` and every segment (clause) whole. A segment wider than
   * the box cannot stay whole: then, if `allowWrap`, it is marked `.wrap` (it breaks between its
   * items and takes lines of its own) and "wrapped" is returned; otherwise null.
   */
  function setText(p, pt, lh, allowWrap) {
    p.style.setProperty("--fs", `${pt.toFixed(2)}pt`);
    if (lh !== null) p.style.setProperty("--lh", lh.toFixed(3));
    p.querySelectorAll(".pz.trim").forEach((mark) => mark.classList.remove("trim"));
    p.querySelectorAll("br.single").forEach((br) => br.remove());
    const segs = [...p.querySelectorAll(".seg")];
    segs.forEach((seg) => seg.classList.remove("wrap"));
    const width = p.parentElement.getBoundingClientRect().width;
    const tooWide = segs.filter((seg) => seg.getBoundingClientRect().width > width - 0.5);
    if (tooWide.length === 0 && p.classList.contains("single") && segs.length === 3) breakSingle(p, segs, width);
    if (tooWide.length === 0) return "whole";
    if (!allowWrap) return null;
    tooWide.forEach((seg) => seg.classList.add("wrap"));
    return "wrapped";
  }

  /**
   * A single-ceramic requirement (Shape · Glaze · Decoration) takes two lines, as on the
   * reference cards: "Bowl · any Glaze ·" / "any Decoration" when the first two parts fit one
   * line, else "Bowl, Plate or Brush Washer ·" / "any Glaze · any Decoration". The break is a
   * `<br>` (no text: the printed string is unchanged).
   */
  function breakSingle(p, segs, width) {
    p.style.whiteSpace = "nowrap";
    const firstTwo = segs[1].getBoundingClientRect().right - segs[0].getBoundingClientRect().left;
    p.style.whiteSpace = "";
    const br = document.createElement("br");
    br.className = "single";
    (firstTwo <= width - 0.5 ? segs[1] : segs[0]).after(br);
  }

  /**
   * The requirement at the deck size `cfg.size` if it fits: first with every clause whole
   * (shrinking up to `cfg.keepWhole` pt to keep a clause whole rather than break it), then with
   * long clauses broken, tightening the leading from `cfg.leading` to `cfg.minLeading`; only then
   * smaller, 0.1 pt at a time, down to `cfg.min`.
   */
  function fitRequirement(box, cfg) {
    const p = box.firstElementChild;
    for (const pt of tenths(cfg.size, cfg.size - cfg.keepWhole)) {
      if (setText(p, pt, cfg.leading, false) !== null && fits(box, p)) return { pt, lh: cfg.leading, wrapped: false };
    }
    for (const pt of tenths(cfg.size, cfg.min)) {
      for (let h = Math.round(cfg.leading * 100); h >= Math.round(cfg.minLeading * 100); h -= 1) {
        const mode = setText(p, pt, h / 100, true);
        if (fits(box, p)) return { pt, lh: h / 100, wrapped: mode === "wrapped" };
      }
    }
    return null;
  }

  /** Text line boxes of `p`, as distinct line tops (CSS px), via its chunks (never broken). */
  function lineTops(p) {
    const tops = [];
    for (const chunk of p.querySelectorAll(".ch")) {
      const top = chunk.getBoundingClientRect().top;
      if (!tops.some((known) => Math.abs(known - top) < 2)) tops.push(top);
    }
    return tops.sort((a, b) => a - b);
  }

  /** The largest quality size (≤ `cfg.max`) at which the line fits its box on one line. */
  function fitQuality(box, cfg) {
    const p = box.firstElementChild;
    for (const pt of tenths(cfg.max, cfg.min)) {
      if (setText(p, pt, null, false) !== null && fits(box, p) && lineTops(p).length === 1) return pt;
    }
    return null;
  }

  /**
   * The reward row stays between the bottom fret corners (`FRET_FREE_W` mm, centred). A row
   * wider than that at the deck's icon size closes up: any row may let its icons touch
   * (overlap up to `TOUCH` of an icon, as the reference's coins do); a row of `STACK_FROM` or
   * more icons (six Coins) may overlap them up to `STACK` of an icon, like a stack of coins.
   */
  const FRET_FREE_W = 35.9;
  const TOUCH = 0.06;
  const STACK_FROM = 6;
  const STACK = 0.25;

  function rowWidth(row) {
    const flat = (element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().width + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
    };
    return [...row.children].reduce((sum, child) => sum + (child.classList.contains("icons") ? [...child.children].reduce((inner, icon) => inner + flat(icon), 0) : flat(child)), 0);
  }

  /** Sets the row's icons at `mm`; returns the overlap needed (0 = none), or null if it cannot fit. */
  function fitRowAt(row, mm) {
    row.style.setProperty("--icon", `${mm.toFixed(2)}mm`);
    row.style.removeProperty("--gap");
    const limit = Math.min(FRET_FREE_W * MM, row.getBoundingClientRect().width - 0.2 * MM);
    const width = rowWidth(row);
    if (width <= limit) return 0;
    const icons = row.querySelectorAll(".ico").length;
    if (icons < 2) return null;
    const gap = parseFloat(getComputedStyle(row.querySelectorAll(".ico")[1]).marginLeft) - (width - limit) / (icons - 1);
    if (gap < -(icons >= STACK_FROM ? STACK : TOUCH) * mm * MM) return null;
    row.style.setProperty("--gap", `${(gap / MM).toFixed(3)}mm`);
    return -gap / (mm * MM);
  }

  // ---- Line-final full-width punctuation ---------------------------------------------------

  const inkCanvas = document.createElement("canvas").getContext("2d");
  const blankCache = new Map();
  /** The blank right of `glyph`'s ink, in em, in `element`'s font (weight and family). */
  function rightBlankEm(glyph, element) {
    const style = getComputedStyle(element);
    const key = `${glyph}|${style.fontWeight}|${style.fontFamily}`;
    if (!blankCache.has(key)) {
      inkCanvas.font = `${style.fontWeight} 200px ${style.fontFamily}`;
      const metrics = inkCanvas.measureText(glyph);
      blankCache.set(key, (metrics.width - metrics.actualBoundingBoxRight) / 200);
    }
    return blankCache.get(key);
  }

  /**
   * A full-width "；"/"，"/"、" that ends a line keeps the blank right half of its em box, so a
   * centred line looks shifted left of the card's axis. Trim each one that ends a line to the
   * right blank of an ordinary character ("件"). The fitted line breaks are first fixed with
   * `<br>` (no text: the printed string is unchanged), so the shorter line cannot make
   * `text-wrap: balance` re-break the paragraph; the run fails if any break still moves.
   */
  function trimLineEnds(p) {
    const marks = [...p.querySelectorAll(".pz")];
    if (marks.length === 0) return 0;
    const chunks = [...p.querySelectorAll(".ch")];
    const signature = () => {
      const tops = lineTops(p);
      return chunks.map((chunk) => tops.findIndex((top) => Math.abs(top - chunk.getBoundingClientRect().top) < 2)).join();
    };
    const endsLine = chunks.map((chunk, index) => {
      const next = chunks[index + 1];
      return next === undefined || next.getBoundingClientRect().top > chunk.getBoundingClientRect().top + 2;
    });
    const reference = rightBlankEm("件", p);
    const targets = marks
      .map((mark) => ({ mark, chunk: mark.closest(".ch"), trim: rightBlankEm(mark.textContent, mark) - reference }))
      .filter(({ chunk, trim }) => endsLine[chunks.indexOf(chunk)] && trim > 0.02);
    if (targets.length === 0) return 0;
    const before = signature();
    const breaks = [];
    chunks.forEach((chunk, index) => {
      if (!endsLine[index] || index === chunks.length - 1) return;
      const br = document.createElement("br");
      br.className = "fixed";
      chunk.after(br);
      breaks.push(br);
    });
    for (const { mark, trim } of targets) {
      mark.style.setProperty("--trim", `${(-trim).toFixed(3)}em`);
      mark.classList.add("trim");
    }
    if (signature() !== before) {
      targets.forEach(({ mark }) => mark.classList.remove("trim"));
      breaks.forEach((br) => br.remove());
      fail(`${p.closest(".card").dataset.id}: trimming line-final punctuation moved a line break`);
      return 0;
    }
    return targets.length;
  }

  // ---- Checks -----------------------------------------------------------------------------

  function within(inner, outer, inset, tolerance = 0.35) {
    return (
      inner.left >= outer.left + inset - tolerance &&
      inner.right <= outer.right - inset + tolerance &&
      inner.top >= outer.top + inset - tolerance &&
      inner.bottom <= outer.bottom - inset + tolerance
    );
  }

  /** The union of an element's text line boxes (glyph extents of its text content). */
  function textRect(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length === 0) return element.getBoundingClientRect();
    return {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      top: Math.min(...rects.map((rect) => rect.top)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
    };
  }

  function checkCard(card) {
    const id = card.dataset.id;
    const say = (message) => fail(`${id}: ${message}`);
    const text = (selector) => card.querySelector(selector)?.textContent ?? null;
    if (text(".id") !== id) say(`printed ID "${text(".id")}"`);
    if (text(".req > p") !== card.dataset.req) say(`requirement prints "${text(".req > p")}", rulebook "${card.dataset.req}"`);
    if (text(".qual > p") !== card.dataset.qual) say(`quality prints "${text(".qual > p")}", rulebook "${card.dataset.qual}"`);
    if (text(".vp-num") !== card.dataset.vp) say(`VP prints "${text(".vp-num")}", rulebook ${card.dataset.vp}`);
    const coins = card.querySelectorAll(".ico.coin").length;
    const crowns = card.querySelectorAll(".ico.crown").length;
    if (String(coins) !== card.dataset.coins) say(`${coins} coin icons for ${card.dataset.coins} Coins`);
    if (String(crowns) !== card.dataset.crowns) say(`${crowns} crown icons for ${card.dataset.crowns} Crowns`);
    if ((card.dataset.kind === "starting") !== (card.querySelector(".kind") !== null)) say("kind word does not match the deck");

    const cardRect = card.getBoundingClientRect();
    const safe = SAFE_MM * MM;
    const textual = [".id-row", ".h-req", ".h-qual", ".req > p", ".qual > p", ".vp-badge", ".vp-num", ".sep", ".ico"];
    for (const selector of textual) {
      for (const element of card.querySelectorAll(selector)) {
        const rect = selector.endsWith("> p") || selector === ".vp-num" || selector.startsWith(".h-") ? textRect(element) : element.getBoundingClientRect();
        if (!within(rect, cardRect, safe)) say(`${selector} reaches inside the ${SAFE_MM} mm safe margin`);
      }
    }
    // A clause broken over lines has those lines to itself: no line holds the end of one
    // clause and the start of a broken one ("one Moon White; one Carved,").
    const segs = [...card.querySelectorAll(".req .seg")];
    const top = (element) => element.getBoundingClientRect().top;
    segs.forEach((seg, index) => {
      if (!seg.classList.contains("wrap")) return;
      const chunks = [...seg.querySelectorAll(".ch")];
      const before = index > 0 ? [...segs[index - 1].querySelectorAll(".ch")].at(-1) : undefined;
      const after = segs[index + 1]?.querySelector(".ch") ?? undefined;
      if (before !== undefined && Math.abs(top(before) - top(chunks[0])) < 2) say(`requirement clause "${seg.textContent}" shares a line with the clause before it`);
      if (after !== undefined && Math.abs(top(after) - top(chunks.at(-1))) < 2) say(`requirement clause "${seg.textContent}" shares a line with the clause after it`);
    });

    // The text's line boxes stay inside its box. (The font's content area, 1.35 em for Iowan,
    // is taller than its ink; at the tighter leadings it reaches past the line boxes, its ink
    // does not.)
    for (const selector of [".req", ".qual"]) {
      const box = card.querySelector(selector);
      const p = box.firstElementChild;
      if (!within(p.getBoundingClientRect(), box.getBoundingClientRect(), 0, 0.5)) say(`${selector} text overflows its box`);
    }
    const art = card.querySelector(".art");
    const artRect = art.getBoundingClientRect();
    // The ID row's ink ends at its baseline (IDs and the kind word have no descenders).
    const idRow = card.querySelector(".id-row").getBoundingClientRect();
    const baseline = card.querySelector(".id-row .baseline").getBoundingClientRect().top;
    const idRect = { left: idRow.left, right: idRow.right, top: idRow.top, bottom: baseline + 0.3 * MM };
    for (const img of art.querySelectorAll("img")) {
      const rect = img.getBoundingClientRect();
      if (!img.complete || img.naturalWidth === 0) say(`illustration ${img.dataset.key} did not load`);
      if (!within(rect, artRect, 0, 0.6)) say(`illustration ${img.dataset.key} leaves the picture area`);
      const clear = rect.right <= idRect.left || rect.left >= idRect.right || rect.bottom <= idRect.top || rect.top >= idRect.bottom;
      if (!clear) say(`illustration ${img.dataset.key} overlaps the printed ID`);
      const fretEdgeX = cardRect.left + FRET_EDGE * MM;
      const fretEdgeY = cardRect.top + FRET_EDGE * MM;
      if (rect.left < fretEdgeX - 0.5 && rect.top < fretEdgeY - 0.5) say(`illustration ${img.dataset.key} overlaps the top-left fret`);
    }
    const row = card.querySelector(".reward");
    const rowRect = row.getBoundingClientRect();
    for (const child of row.children) {
      if (!within(child.getBoundingClientRect(), rowRect, 0, 0.5)) say("reward row overflows");
    }
    const parts = [...row.querySelectorAll(".vp-badge, .vp-num, .sep, .ico")].map((element) => element.getBoundingClientRect());
    const left = Math.min(...parts.map((rect) => rect.left)) - cardRect.left;
    const right = Math.max(...parts.map((rect) => rect.right)) - cardRect.left;
    const freeLeft = ((50 - FRET_FREE_W) / 2) * MM;
    if (left < freeLeft - 0.5 || right > 50 * MM - freeLeft + 0.5) say("reward row reaches the bottom fret corners");
  }

  /**
   * A sheet prints nothing below its lowest printed point (`data-ink-bottom`, mm): on a sheet
   * that is not full, the parchment, the cards and every cut line stop above the blank paper.
   */
  function checkSheet(sheet) {
    const say = (message) => fail(`page ${sheet.dataset.sheet}: ${message}`);
    if (sheet.querySelector(".back-page, .back-cell") !== null) say("front sheet holds back parts");
    const inkBottom = Number(sheet.dataset.inkBottom);
    const rows = Number(sheet.dataset.rows);
    const cards = sheet.querySelectorAll(".card").length;
    if (!(rows >= 1 && rows <= 4) || !Number.isFinite(inkBottom)) return say("has no row count or ink limit");
    if (cards > rows * 4 || cards <= (rows - 1) * 4) say(`${cards} cards on ${rows} rows`);
    const limit = sheet.getBoundingClientRect().top + inkBottom * MM + 0.05 * MM;
    for (const element of sheet.querySelectorAll(".bleed, .grid, .card, .cuts line")) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom > limit) say(`${element.getAttribute("class") ?? element.tagName} reaches ${((rect.bottom - sheet.getBoundingClientRect().top) / MM).toFixed(2)} mm, below the ${inkBottom} mm ink limit`);
    }
  }

  // ---- Card backs ---------------------------------------------------------------------------

  /** Resolution of the medallion drawing, px per mm (610 dpi). */
  const ART_PX_PER_MM = 24;
  /** The drawing fades out over this width at the edges of its crop. */
  const ART_EDGE_MM = 2;

  /**
   * The medallion's drawing: the kiln from the approved board illustration, as faint sepia ink
   * (cards.css --ink-2) on the fronts' parchment (--paper), fading out towards the disc's rim.
   * The ink follows the picture's darkness against its own paper (the 92nd-percentile
   * luminance), so the illustration's ground prints as plain parchment. One opaque JPEG the size
   * of the disc, painted once into the shared `#medal-art` image (clipped round); every back
   * shows it through a `<use>`.
   */
  async function medalArt() {
    const { art, discR } = input.back;
    const style = getComputedStyle(document.documentElement);
    const paper = cssColour(style.getPropertyValue("--paper").trim() || "invalid");
    const ink = cssColour(style.getPropertyValue("--ink-2").trim() || "invalid");
    const img = new Image();
    img.src = art.url;
    await img.decode();
    const n = Math.round(2 * discR * ART_PX_PER_MM);
    const source = document.createElement("canvas");
    source.width = n;
    source.height = n;
    const sctx = source.getContext("2d", { alpha: false });
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, n, n);
    const k = (art.place.width * ART_PX_PER_MM) / art.crop.w;
    const drawn = { x: art.place.left * ART_PX_PER_MM, y: art.place.top * ART_PX_PER_MM, w: art.crop.w * k, h: art.crop.h * k };
    sctx.drawImage(img, art.crop.x, art.crop.y, art.crop.w, art.crop.h, drawn.x, drawn.y, drawn.w, drawn.h);
    const pixels = sctx.getImageData(0, 0, n, n).data;
    const luminance = new Float32Array(n * n);
    const sample = [];
    const c = n / 2;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        luminance[i] = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
        const inside = Math.hypot(x + 0.5 - c, y + 0.5 - c) <= c && x >= drawn.x && x < drawn.x + drawn.w && y >= drawn.y && y < drawn.y + drawn.h;
        if (inside && (x + y) % 7 === 0) sample.push(luminance[i]);
      }
    }
    if (sample.length === 0) throw new Error("medallion drawing: the crop misses the disc");
    sample.sort((a, b) => a - b);
    const ground = sample[Math.floor(sample.length * 0.92)];
    const out = document.createElement("canvas");
    out.width = n;
    out.height = n;
    const octx = out.getContext("2d", { alpha: false });
    const result = octx.createImageData(n, n);
    let darkest = 0;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        const r = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
        // Full strength to 62 % of the radius, smoothly gone by 98 % of it; and gone towards the
        // crop's own edges (over `ART_EDGE_MM`), so the cut-off drawing leaves no straight line.
        const t = Math.min(1, Math.max(0, (r - 0.62) / 0.36));
        const edge = Math.min(x + 0.5 - drawn.x, drawn.x + drawn.w - x - 0.5, y + 0.5 - drawn.y, drawn.y + drawn.h - y - 0.5) / (ART_EDGE_MM * ART_PX_PER_MM);
        const fade = (1 - t * t * (3 - 2 * t)) * Math.min(1, Math.max(0, edge));
        const a = art.strength * Math.min(1, Math.max(0, (ground - luminance[i]) / ground)) * fade;
        if (a > darkest) darkest = a;
        for (let ch = 0; ch < 3; ch += 1) result.data[i * 4 + ch] = Math.round(paper[ch] * (1 - a) + ink[ch] * a);
        result.data[i * 4 + 3] = 255;
      }
    }
    octx.putImageData(result, 0, 0);
    const url = out.toDataURL("image/jpeg", 0.92);
    const image = document.getElementById("medal-art");
    if (image === null) throw new Error("medallion drawing: no #medal-art image");
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("medallion drawing: the image did not load")), { once: true });
      image.setAttribute("href", url);
    });
    const uses = document.querySelectorAll(".back-cell .medal-art").length;
    return `medallion drawing: one opaque ${n} × ${n} px JPEG (${ART_PX_PER_MM} px/mm), sepia ink up to ${Math.round(darkest * 100)} % on parchment, painted once and shown by ${uses} backs`;
  }

  /** Chromium lays boxes out in 1/64 px (0.004 mm); the back's SVG geometry is exact. */
  const FLIP_TOLERANCE_MM = 0.02;

  /** An element's inked box in CSS px: its geometry, grown by half its stroke (a square cap by √2 · half). */
  function inkedRect(element) {
    const rect = element.getBoundingClientRect();
    if (!(element instanceof SVGGraphicsElement) || element instanceof SVGTextElement) return rect;
    const style = getComputedStyle(element);
    if (style.stroke === "none" || style.stroke === "") return rect;
    const ctm = element.getScreenCTM();
    const scale = ctm === null ? 1 : Math.hypot(ctm.a, ctm.b);
    const grow = (parseFloat(style.strokeWidth) * scale * (style.strokeLinecap === "square" ? Math.SQRT2 : 1)) / 2;
    return { left: rect.left - grow, right: rect.right + grow, top: rect.top - grow, bottom: rect.bottom + grow };
  }

  /**
   * The cut lines of a front sheet, mm from its top-left: the x of every vertical cut and the y
   * of every horizontal cut, read from its cut-line SVG (exact geometry, unlike the snapped boxes).
   */
  function frontCuts(front, origin) {
    const xs = new Set();
    const ys = new Set();
    for (const line of front.querySelectorAll(".cuts line")) {
      const rect = line.getBoundingClientRect();
      const round = (value) => Math.round(value * 1000) / 1000;
      if (rect.width < rect.height) xs.add(round((rect.left + rect.right) / 2 / MM - origin.left / MM));
      else ys.add(round((rect.top + rect.bottom) / 2 / MM - origin.top / MM));
    }
    const sorted = (set) => [...set].sort((a, b) => a - b);
    return { xs: sorted(xs), ys: sorted(ys) };
  }

  /**
   * Every back sheet: it follows its front; no cut line or front part; one page SVG, exactly
   * 1 mm per unit on a whole-pixel box; one continuous field at least `minBleed` mm beyond the
   * outer cuts on both sides of the sheet; after a long-edge and after a short-edge flip, every
   * front card (placed by its cut lines) has exactly one back of its deck on it; every mark at
   * least `safe` mm inside each cut. Returns the summary line.
   */
  function checkBacks() {
    const { safe, minBleed, pageW, pageH } = input.back;
    const fronts = [...document.querySelectorAll(".sheet.front")];
    const backs = [...document.querySelectorAll(".sheet.back")];
    if (backs.length !== fronts.length) fail(`${backs.length} back sheets for ${fronts.length} front sheets`);
    const inMm = (rect, origin) => ({
      left: (rect.left - origin.left) / MM,
      right: (rect.right - origin.left) / MM,
      top: (rect.top - origin.top) / MM,
      bottom: (rect.bottom - origin.top) / MM,
    });
    const flips = {
      long: (r) => ({ left: pageW - r.right, right: pageW - r.left, top: r.top, bottom: r.bottom }),
      short: (r) => ({ left: r.left, right: r.right, top: pageH - r.bottom, bottom: pageH - r.top }),
    };
    const off = (a, b) => Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right), Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom));
    let worstFlip = 0;
    let worstUnit = 0;
    let nearestMark = Infinity;
    let leastBleed = Infinity;
    let cells = 0;
    let marks = 0;
    let placed = 0;
    for (const back of backs) {
      const say = (message) => fail(`back of page ${back.dataset.sheet}: ${message}`);
      const front = document.querySelector(`.sheet.front[data-sheet="${back.dataset.sheet}"]`);
      if (front === null) {
        say("has no front sheet");
        continue;
      }
      if (front.nextElementSibling !== back) say("does not follow its front sheet");
      if (back.querySelector(".cuts, .bleed, .grid, .card") !== null) say("carries cut lines or front parts");
      const sheetBox = back.getBoundingClientRect();
      const frontBox = front.getBoundingClientRect();
      const svgs = back.querySelectorAll("svg");
      if (svgs.length !== 1 || !svgs[0].classList.contains("back-page")) {
        say(`draws in ${svgs.length} SVGs, not one page SVG`);
        continue;
      }
      // The page SVG: a whole-pixel box at the sheet's corner, 1 user unit = 1 mm exactly.
      const svg = svgs[0];
      const svgBox = svg.getBoundingClientRect();
      const ctm = svg.getScreenCTM();
      const unit = Math.max(Math.abs(ctm.a / MM - 1), Math.abs(ctm.d / MM - 1), Math.abs(ctm.b), Math.abs(ctm.c));
      worstUnit = Math.max(worstUnit, unit);
      if (unit > 1e-6) say(`its SVG unit is not 1 mm (CTM ${ctm.a}, ${ctm.d})`);
      if (svgBox.left !== sheetBox.left || svgBox.top !== sheetBox.top || !Number.isInteger(svgBox.width) || !Number.isInteger(svgBox.height)) {
        say(`its SVG box ${svgBox.width} × ${svgBox.height} px at (${svgBox.left - sheetBox.left}, ${svgBox.top - sheetBox.top}) is not whole pixels at the sheet's corner`);
      }
      const fields = svg.querySelectorAll(".field");
      if (fields.length !== 1) say(`has ${fields.length} fields, not one continuous field`);
      const field = inMm(fields[0].getBoundingClientRect(), sheetBox);
      const cuts = frontCuts(front, frontBox);
      const nearestCut = (list, value) => list.reduce((best, cut) => (Math.abs(cut - value) < Math.abs(best - value) ? cut : best), Infinity);
      const backCells = [...svg.querySelectorAll(".back-cell")];
      const cellRects = backCells.map((cell) => inMm(cell.querySelector(".cell").getBoundingClientRect(), sheetBox));
      // Every front card, placed by its cut lines; its layout box must agree with them.
      const frontCards = [...front.querySelectorAll(".card")].map((card) => {
        const box = inMm(card.getBoundingClientRect(), frontBox);
        const rect = { left: nearestCut(cuts.xs, box.left), right: nearestCut(cuts.xs, box.right), top: nearestCut(cuts.ys, box.top), bottom: nearestCut(cuts.ys, box.bottom) };
        if (off(rect, box) > FLIP_TOLERANCE_MM) say(`${card.dataset.id}: its box is ${off(rect, box).toFixed(3)} mm off its cut lines`);
        return { id: card.dataset.id, kind: card.dataset.kind, rect };
      });
      for (const [flip, map] of Object.entries(flips)) {
        for (const card of frontCards) {
          const matches = backCells.filter((_, at) => off(map(cellRects[at]), card.rect) <= FLIP_TOLERANCE_MM);
          if (matches.length !== 1) {
            say(`${card.id}: ${matches.length} backs on it after a ${flip}-edge flip`);
            continue;
          }
          const at = backCells.indexOf(matches[0]);
          worstFlip = Math.max(worstFlip, off(map(cellRects[at]), card.rect));
          if (matches[0].dataset.kind !== card.kind) say(`${card.id}: a ${matches[0].dataset.kind} back on a ${card.kind} card after a ${flip}-edge flip`);
          if (matches[0].dataset[flip] !== card.id) say(`${card.id}: the back on it after a ${flip}-edge flip records "${matches[0].dataset[flip]}"`);
          placed += 1;
        }
        // The field, seen from the front: at least minBleed beyond the front's outer cuts.
        const seen = map(field);
        const outer = {
          left: Math.min(...frontCards.map((card) => card.rect.left)),
          right: Math.max(...frontCards.map((card) => card.rect.right)),
          top: Math.min(...frontCards.map((card) => card.rect.top)),
          bottom: Math.max(...frontCards.map((card) => card.rect.bottom)),
        };
        const bleed = Math.min(outer.left - seen.left, seen.right - outer.right, outer.top - seen.top, seen.bottom - outer.bottom);
        leastBleed = Math.min(leastBleed, bleed);
        if (!(bleed >= minBleed - 0.01)) say(`after a ${flip}-edge flip the field runs only ${bleed.toFixed(2)} mm beyond the front's outer cuts (at least ${minBleed})`);
      }
      // The backs' own grid: the field reaches minBleed beyond it too.
      const grid = {
        left: Math.min(...cellRects.map((r) => r.left)),
        right: Math.max(...cellRects.map((r) => r.right)),
        top: Math.min(...cellRects.map((r) => r.top)),
        bottom: Math.max(...cellRects.map((r) => r.bottom)),
      };
      const own = Math.min(grid.left - field.left, field.right - grid.right, grid.top - field.top, field.bottom - grid.bottom);
      leastBleed = Math.min(leastBleed, own);
      if (!(own >= minBleed - 0.01)) say(`the field runs only ${own.toFixed(2)} mm beyond the backs' outer cuts (at least ${minBleed})`);
      backCells.forEach((cell, at) => {
        cells += 1;
        const box = cellRects[at];
        for (const part of cell.querySelectorAll("*")) {
          if (part.classList.contains("cell") || part.tagName === "g" || !(part instanceof SVGGraphicsElement)) continue;
          if (part instanceof SVGTSpanElement) continue;
          const ink = inMm(inkedRect(part), sheetBox);
          if (ink.right - ink.left <= 0 && ink.bottom - ink.top <= 0) continue;
          const inset = Math.min(ink.left - box.left, box.right - ink.right, ink.top - box.top, box.bottom - ink.bottom);
          nearestMark = Math.min(nearestMark, inset);
          marks += 1;
          if (inset < safe - 0.001) say(`the back at row ${cell.dataset.row}, column ${cell.dataset.column}: a ${part.getAttribute("class") ?? part.tagName} comes ${inset.toFixed(2)} mm from the cut (at least ${safe})`);
        }
      });
      const inkBottom = Number(back.dataset.inkBottom);
      if (!(field.bottom <= inkBottom + 0.05)) say(`the field reaches ${field.bottom.toFixed(2)} mm, below its ${inkBottom} mm ink limit`);
    }
    const art = document.getElementById("medal-art");
    if (art === null || !(art.getAttribute("href") ?? "").startsWith("data:image/jpeg")) fail("card backs: the medallion drawing is missing");
    return (
      `card backs: ${cells} backs on ${backs.length} sheets, drawn in page SVGs at exactly 1 mm per unit (largest deviation ${worstUnit.toExponential(1)}); ` +
      `after a long-edge and after a short-edge flip each of the ${placed / 2} front cards has one back of its deck on its cut lines (largest deviation ${worstFlip.toFixed(4)} mm); ` +
      `nearest of ${marks} marks ${nearestMark.toFixed(2)} mm inside the cut (at least ${safe}); continuous field ${leastBleed.toFixed(2)} mm beyond the outer cuts (at least ${minBleed}); no cut lines`
    );
  }

  // ---- Run --------------------------------------------------------------------------------

  try {
    await document.fonts.ready;
    const firstCard = document.querySelector(".card");
    if (firstCard !== null) {
      const box = firstCard.getBoundingClientRect();
      const paperMm = [box.width / MM, box.height / MM].map((mm) => Math.round(mm * 100) / 100);
      document.documentElement.style.setProperty("--card-paper", `url("${cardPaper(...paperMm)}")`);
      report.info.push(`card parchment: one opaque ${paperMm.join(" × ")} mm image at ${PAPER_PX_PER_MM} px/mm, painted once per card (no repeating tile)`);
    }
    const cards = [...document.querySelectorAll(".card")];
    await Promise.all(cards.map((card) => drawArt(card.querySelector(".art"))));

    const fit = input.fit;
    const ids = (list) => list.map((card) => card.dataset.id).join(", ");

    // Requirement: the deck size wherever it fits.
    for (const card of cards) {
      const req = fitRequirement(card.querySelector(".req"), fit.req);
      if (req === null) fail(`${card.dataset.id}: requirement does not fit at ${fit.req.min} pt`);
      report.sizes[card.dataset.id] = { req: req && req.pt, reqLeading: req && req.lh, reqWrapped: req?.wrapped ?? null };
    }
    const reqOff = cards.filter((card) => report.sizes[card.dataset.id].req !== fit.req.size || report.sizes[card.dataset.id].reqLeading !== fit.req.leading);
    const reqWrapped = cards.filter((card) => report.sizes[card.dataset.id].reqWrapped);
    report.info.push(
      `requirement ${fit.req.size} pt, leading ${fit.req.leading} on ${cards.length - reqOff.length} of ${cards.length} cards` +
        (reqOff.length > 0 ? `; ${reqOff.map((card) => `${card.dataset.id} ${report.sizes[card.dataset.id].req} pt / ${report.sizes[card.dataset.id].reqLeading}`).join(", ")}` : "") +
        (reqWrapped.length > 0 ? `; clauses broken onto lines of their own: ${ids(reqWrapped)}` : ""),
    );

    // The requirement reads as its heading's text, as on the reference: just under the heading,
    // with the spare room below it (a short requirement drops at most 1.2 mm).
    for (const card of cards) {
      const box = card.querySelector(".req");
      const p = box.firstElementChild;
      const free = box.getBoundingClientRect().height - p.getBoundingClientRect().height;
      p.style.marginTop = `${Math.min(Math.max(0, free) * 0.15, 1.2 * MM) / MM}mm`;
    }

    // Quality: one size for the whole deck, the largest at which every card's fits one line.
    let qual = Infinity;
    for (const card of cards) {
      const q = fitQuality(card.querySelector(".qual"), fit.qual);
      if (q === null) fail(`${card.dataset.id}: quality does not fit one line at ${fit.qual.min} pt`);
      report.sizes[card.dataset.id].qualFit = q;
      if (q !== null) qual = Math.min(qual, q);
    }
    if (Number.isFinite(qual)) {
      for (const card of cards) {
        setText(card.querySelector(".qual > p"), qual, null, false);
        report.sizes[card.dataset.id].qual = qual;
      }
      const setBy = cards.filter((card) => report.sizes[card.dataset.id].qualFit === qual);
      report.info.push(`quality ${qual} pt on all cards (${qual === fit.qual.max ? "the maximum" : `set by ${ids(setBy)}`})`);
    }

    // Icons: one size for the whole deck, the largest at which every reward row fits.
    let icon = null;
    for (let step = 88; step >= 60 && icon === null; step -= 1) {
      const mm = step / 20;
      if (cards.every((card) => fitRowAt(card.querySelector(".reward"), mm) !== null)) icon = mm;
    }
    if (icon === null) fail("reward rows do not fit at 3 mm icons");
    else {
      const overlapping = [];
      for (const card of cards) {
        const overlap = fitRowAt(card.querySelector(".reward"), icon);
        Object.assign(report.sizes[card.dataset.id], { icon, overlap: +overlap.toFixed(3) });
        if (overlap > 0) overlapping.push(`${card.dataset.id} ${Math.round(overlap * 100)} %`);
      }
      report.info.push(`icons ${icon.toFixed(2)} mm on all cards${overlapping.length > 0 ? `; icons overlapping to stay clear of the frets: ${overlapping.join(", ")}` : ""}`);
    }

    // Line-final full-width punctuation (Chinese).
    let trimmed = 0;
    for (const card of cards) {
      for (const p of card.querySelectorAll(".req > p, .qual > p")) trimmed += trimLineEnds(p);
    }
    if (trimmed > 0) report.info.push(`line-final full-width punctuation trimmed: ${trimmed}`);

    // The pictures must tell the Glazes apart (and from the untinted "any Glaze").
    const separation = await glazeSeparation();
    const closest = separation[0];
    report.info.push(`glaze separation (ΔE76, Plain Bowl): closest ${separation.slice(0, 3).map((item) => `${item.pair} ${item.de.toFixed(1)}`).join(", ")}`);
    if (closest.de < input.minGlazeDeltaE) fail(`glazes ${closest.pair} differ by only ΔE ${closest.de.toFixed(1)} (minimum ${input.minGlazeDeltaE})`);

    for (const card of cards) checkCard(card);
    for (const sheet of document.querySelectorAll(".sheet.front")) checkSheet(sheet);
    report.info.push(`ceramic images composited: ${tints.size}`);

    report.info.push(await medalArt());
    report.info.push(checkBacks());
  } catch (error) {
    fail(`page script: ${error && error.stack ? error.stack : String(error)}`);
  }
  window.__PRINT_REPORT = report;
  window.__PRINT_READY = true;
})();
