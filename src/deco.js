// Photo Booth looks (0.8.0): borders for "in the chat" pictures and frames for chat avatars.
// Pure helpers only (no store access), so store.js, stage.js, apply.js and ui.js can all use them.

export const PATTERNS = ['solid', 'dots', 'check', 'stripe', 'dashed', 'lace', 'glitter', 'rainbow', 'holo'];
export const SHAPES = ['rect', 'circle', 'heart', 'star', 'outline'];
export const WIDTHS = { thin: 5, mid: 9, thick: 13 }; // 0.8.1: one step thicker (was 4 / 7 / 11)
export const FRAME_KINDS = ['none', 'polaroid', 'lace', 'ribbon', 'heart', 'sparkle', 'rainbow', 'candy', 'star', 'holo'];
// Jelly colours of the Photo Booth (white, pink, lavender, sky, mint, gold, cherry).
export const COLORS = ['#ffffff', '#ff9ad6', '#b896ff', '#8fc8ff', '#8de0c0', '#ffd060', '#ff5b7a'];
// Patterns with their own fixed colours.
export const FIXED_COLOR = new Set(['rainbow', 'holo']);
export const FRAME_FIXED_COLOR = new Set(['rainbow', 'holo']);
// Frames that have sparkles that can twinkle.
export const FRAME_BLINK = new Set(['sparkle', 'star', 'holo']);

const RAINBOW = 'linear-gradient(135deg,#ff6b9a,#ffb36b,#ffe66b,#7be08a,#6bc4ff,#a98bff)';
const HOLO = 'linear-gradient(135deg,#ffd1ea,#e3d0ff 25%,#c9f1ff 50%,#fff6c4 75%,#ffb3e1)';

const HEX = /^#[0-9a-f]{6}$/i;
export const cleanColor = (c, d = COLORS[0]) => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : d);

/**
 * Border of one picture, or null for none.
 * Deco = { shape, pat, color, width, glitter (sparkles around it), blink (sparkles twinkle),
 *          fx, fy (0.8.1: which part of the picture shows in a cut shape, 0–100, 50 = middle), zoom (1–3) }
 */
export function cleanDeco(d) {
    if (!d || typeof d !== 'object') return null;
    const shape = SHAPES.includes(d.shape) ? d.shape : 'rect';
    return {
        shape,
        // "Follow the outline" draws with a plain colour only.
        pat: shape === 'outline' ? 'solid' : (PATTERNS.includes(d.pat) ? d.pat : 'solid'),
        color: cleanColor(d.color),
        width: d.width in WIDTHS ? d.width : 'mid',
        glitter: d.glitter === true,
        blink: d.blink === true,
        fx: pct(d.fx),
        fy: pct(d.fy),
        zoom: Number.isFinite(+d.zoom) && d.zoom !== null && d.zoom !== '' ? Math.round(Math.min(ZOOM_MAX, Math.max(1, +d.zoom)) * 100) / 100 : 1,
    };
}

export const ZOOM_MAX = 3;
const pct = (v) => (v === null || v === '' || !Number.isFinite(+v) ? 50 : Math.round(Math.min(100, Math.max(0, +v)) * 10) / 10);

/** The old "sticker" switch (0.6.x–0.7.x): round cut, thin white border, shadow. */
export const STICKER_DECO = Object.freeze({ shape: 'circle', pat: 'solid', color: '#ffffff', width: 'thin', glitter: false, blink: false, fx: 50, fy: 50, zoom: 1 });

/** Avatar frame of one character / persona in one chat. Frame = { kind, color, blink } */
export function cleanFrame(f) {
    if (!f || typeof f !== 'object' || !FRAME_KINDS.includes(f.kind) || f.kind === 'none') return null;
    return { kind: f.kind, color: cleanColor(f.color), blink: f.blink === true };
}

/** Pictures cut into a square shape (circle, heart, star) are drawn square and a bit smaller, like the old sticker. */
export function isCutShape(deco) {
    return !!deco && ['circle', 'heart', 'star'].includes(deco.shape);
}

// ---------- colours ----------

function rgbOf(hex) {
    const n = parseInt(cleanColor(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function isLight(hex) {
    const [r, g, b] = rgbOf(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
}
function lighter(hex, w = 0.5) {
    const [r, g, b] = rgbOf(hex);
    const m = (v) => Math.round(v + (255 - v) * w);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
}
/** Second colour of two-colour patterns: white, or pink when the main colour is already very light. */
const second = (c) => (isLight(c) ? '#ffb3e1' : '#ffffff');

/** CSS background of a border pattern. */
export function patternBg(pat, color) {
    const c = cleanColor(color);
    const s = second(c);
    switch (pat) {
        case 'dots': return `radial-gradient(circle, ${s} 0 1.6px, transparent 2.2px) 0 0/7px 7px, ${c}`;
        case 'check': return `repeating-conic-gradient(${c} 0 25%, ${s} 0 50%) 0 0/10px 10px`;
        case 'stripe': return `repeating-linear-gradient(45deg, ${c} 0 4px, ${s} 4px 8px)`;
        case 'dashed': return `repeating-conic-gradient(from 0deg, ${c} 0 5deg, ${s} 5deg 10deg)`;
        case 'lace': return `radial-gradient(circle, ${c} 0 1.7px, transparent 2.2px) 0 0/6px 6px, radial-gradient(circle, ${c} 0 0.9px, transparent 1.3px) 3px 3px/6px 6px, ${s}`;
        case 'glitter': return 'radial-gradient(circle, rgba(255,255,255,.95) 0 .8px, transparent 1.3px) 0 0/5px 5px, '
            + 'radial-gradient(circle, rgba(255,255,255,.7) 0 .7px, transparent 1.2px) 2px 3px/7px 7px, '
            + `linear-gradient(135deg, ${c}, ${lighter(c)}, ${c}, ${lighter(c)})`;
        case 'rainbow': return RAINBOW;
        case 'holo': return `${HOLO} 0 0/200% 200%`;
        default: return c;
    }
}

// ---------- shapes ----------

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// Old heart (0.8.0), still used by the avatar frame sticker.
const HEART_PATH = 'M50 92C20 70 3 53 3 31 3 15 15 4 29 4c9 0 16 5 21 13C55 9 62 4 71 4c14 0 26 11 26 27 0 22-17 39-47 61Z';
function starPath(cx, cy, ro, ri, n = 5) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? ri : ro;
        const a = -Math.PI / 2 + i * Math.PI / n;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join('L')}Z`;
}
// 0.8.1: border shapes in a 100×100 box. Drawn as path + a round stroke of R, so the corners are soft.
// The outer edge is the path pushed out by R; the picture inside is the outer edge pulled in by the border width,
// so the border is the same thickness all the way round (0.8.0 shrank the whole shape, which made it uneven).
const CUT_R = 1.5;
const CUT_PATH = {
    heart: 'M50 91C21 72 5.5 55 5.5 34 5.5 18.5 17 8 30.5 8 40 8 46.5 13.5 50 20.5 53.5 13.5 60 8 69.5 8 83 8 94.5 18.5 94.5 34 94.5 55 79 72 50 91Z',
    star: starPath(50, 53, 45, 22.5),
};

function shapeSvg(shape, inner) {
    const d = CUT_PATH[shape];
    const base = `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="${CUT_R * 2}" stroke-linejoin="round"/>`;
    if (!inner) return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${base}</svg>`);
    // Inner edge: the outer edge (path + R) pulled in by the border width, by cutting a band around the path.
    const band = Math.max(0.2, inner - CUT_R) * 2;
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">${base}<path d="${d}" fill="none" stroke="#000" stroke-width="${band.toFixed(2)}" stroke-linejoin="round"/></mask><rect width="100" height="100" fill="#fff" mask="url(#m)"/></svg>`);
}

function setMask(el, url) {
    const v = url ? `${url} center / 100% 100% no-repeat` : '';
    el.style.webkitMask = v;
    el.style.mask = v;
}

/**
 * Background size and position that show part of a picture (aspect ratio ar) in a square box,
 * like "cover", zoomed in by zoom, at fx/fy (0 = left/top edge, 100 = right/bottom edge).
 */
export function coverBox(ar, zoom = 1, fx = 50, fy = 50) {
    const a = ar > 0 ? ar : 1;
    const w = (a >= 1 ? a : 1) * 100 * zoom;
    const h = (a >= 1 ? 1 : 1 / a) * 100 * zoom;
    return { w, h, size: `${w.toFixed(2)}% ${h.toFixed(2)}%`, pos: `${fx}% ${fy}%` };
}

// ---------- pictures in the chat ----------

const SPARKS = [[-6, 8], [92, -4], [104, 58], [-8, 76], [46, 102]];

/**
 * Draw the border of one picture. f = { fig, img }; adds f.back (border layer), f.pic (cut picture) and f.spark (sparkles).
 * Only our own elements are changed. g = { size (px of the square box), ar (picture aspect), src } for cut shapes;
 * without it, they are read from the elements.
 */
export function paintPiece(f, deco, g = {}) {
    const d = cleanDeco(deco);
    const { fig, img } = f;
    const cut = isCutShape(d);
    const size = cut ? Math.round(g.size || parseFloat(fig.style.width) || fig.clientWidth || 0) : 0;
    const ar = cut ? (g.ar || (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0)) : 0;
    const src = cut ? (g.src || img.getAttribute('src') || '') : '';
    const sig = d ? JSON.stringify([d, size, ar.toFixed(3), src]) : '';
    if (f.decoSig === sig) return;
    f.decoSig = sig;
    if (!f.back) {
        f.back = document.createElement('div');
        f.back.className = 'facets-fig-back';
        fig.insertBefore(f.back, img);
    }
    if (!f.pic) {
        f.pic = document.createElement('div');
        f.pic.className = 'facets-fig-pic';
        img.after(f.pic);
    }
    for (const s of SHAPES) fig.classList.remove(`is-${s}`);
    fig.classList.toggle('is-deco', !!d);
    fig.classList.toggle('is-cut', cut);
    f.back.hidden = !d || d.shape === 'outline';
    f.pic.hidden = !cut;
    img.style.filter = '';
    img.style.inset = '';
    img.style.width = '';
    img.style.height = '';
    setMask(f.back, '');
    setMask(f.pic, '');
    f.pic.style.inset = '';
    if (d) {
        fig.classList.add(`is-${d.shape}`);
        const w = WIDTHS[d.width];
        if (d.shape === 'outline') {
            // A plain colour that follows the picture's outline (best on pictures with a see-through background).
            const c = d.color;
            const k = Math.max(2, Math.round(w * 0.6));
            img.style.filter = `drop-shadow(${k}px 0 0 ${c}) drop-shadow(-${k}px 0 0 ${c}) drop-shadow(0 ${k}px 0 ${c}) drop-shadow(0 -${k}px 0 ${c}) drop-shadow(0 4px 6px rgba(0,0,0,.3))`;
        } else {
            f.back.style.background = patternBg(d.pat, d.color);
            f.back.classList.toggle('is-holo', d.pat === 'holo');
            if (!cut) {
                // A picture doesn't stretch between left and right like a box does: give it its size too.
                img.style.inset = `${w}px`;
                img.style.width = `calc(100% - ${w * 2}px)`;
                img.style.height = `calc(100% - ${w * 2}px)`;
            } else {
                // Cut shapes: the picture is a background, so the shown part can be moved and zoomed.
                const cb = coverBox(ar, d.zoom, d.fx, d.fy);
                f.pic.style.backgroundImage = src ? `url("${src.replace(/["\\]/g, '\\$&')}")` : '';
                f.pic.style.backgroundSize = ar ? cb.size : 'cover';
                f.pic.style.backgroundPosition = cb.pos;
                if (d.shape === 'circle') {
                    f.pic.style.inset = `${w}px`;
                } else {
                    const inner = size > 0 ? w * 100 / size : 6;
                    setMask(f.back, shapeSvg(d.shape, 0));
                    setMask(f.pic, shapeSvg(d.shape, inner));
                }
            }
        }
    }
    // Sparkles around the picture.
    const wantSpark = !!d?.glitter;
    if (wantSpark && !f.spark) {
        f.spark = document.createElement('div');
        f.spark.className = 'facets-fig-spark';
        f.spark.innerHTML = SPARKS.map(([x, y], i) => `<span style="left:${x}%;top:${y}%;--i:${i}"></span>`).join('');
        fig.appendChild(f.spark);
    }
    if (f.spark) {
        f.spark.hidden = !wantSpark;
        f.spark.classList.toggle('is-blink', !!d?.blink);
    }
}

// ---------- avatar frames ----------

const BOW = (c) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 26"><g stroke="#fff" stroke-width="1.6"><path d="M22 13C14 2 4 2 3 9c-1 7 9 9 19 4Z" fill="${c}"/><path d="M22 13c8-11 18-11 19-4 1 7-9 9-19 4Z" fill="${c}"/><path d="M20 14l-6 11 5-1 3-9Zm4 0 6 11-5-1-3-9Z" fill="${c}"/><circle cx="22" cy="13" r="4.2" fill="${c}"/></g></svg>`);
const HEART = (c) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 96"><path d="${HEART_PATH}" fill="${c}" stroke="#fff" stroke-width="8"/></svg>`);
// 0.9.3: sparkles twinkle one by one, each on its own beat, inside the SVG (no more whole-layer pulsing).
const TWINKLE = '<style>.t{transform-box:fill-box;transform-origin:center;animation:t var(--d) ease-in-out infinite;animation-delay:var(--l)}'
    + '.g{animation:g var(--d) ease-in-out infinite;animation-delay:var(--l)}'
    + '@keyframes t{0%,100%{opacity:.2;transform:scale(.8)}45%,60%{opacity:1;transform:scale(1)}}'
    + '@keyframes g{0%,100%{opacity:.25}50%{opacity:1}}</style>';
const beat = (blink, cls, d, l) => blink ? ` class="${cls}" style="--d:${d}s;--l:${l}s"` : '';
const spark = (x, y, r) => `M${x} ${y - r}C${x + r * 0.18} ${y - r * 0.18} ${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}C${x + r * 0.18} ${y + r * 0.18} ${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}C${x - r * 0.18} ${y + r * 0.18} ${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}C${x - r * 0.18} ${y - r * 0.18} ${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;
const STARS = (c, blink) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">${blink ? TWINKLE : ''}<g fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path${beat(blink, 't', 2.6, 0)} d="${starPath(44, 16, 14, 6.5)}"/><path${beat(blink, 't', 2.2, -0.9)} d="${starPath(24, 10, 8, 3.7)}"/><path${beat(blink, 't', 3, -1.7)} d="${starPath(54, 34, 6, 2.8)}"/></g></svg>`);
// Glitter dust: small dots around the picture and two sparkles (big top right, small bottom left).
const GLITTER_DOTS = [[200, 46, 2.4, 1.6, 0], [245, 47, 2, 2.1, -0.5], [290, 46, 2.3, 1.8, -1], [338, 47, 2, 2.4, -0.2], [22, 46, 2.4, 1.7, -0.8], [68, 47, 2, 2.2, -1.3], [112, 46, 2.3, 1.9, -0.6], [158, 47, 2, 2.5, -1.5]];
const SPARKLES = (c, blink) => {
    const dots = GLITTER_DOTS.map(([deg, r, size, d, l]) => {
        const a = (deg - 90) * Math.PI / 180;
        const cx = (50 + r * Math.cos(a)).toFixed(1), cy = (50 + r * Math.sin(a)).toFixed(1);
        return `<circle${beat(blink, 'g', d, l)} cx="${cx}" cy="${cy}" r="${size}"/>`;
    }).join('');
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${blink ? TWINKLE : ''}<g fill="${c}" stroke="#fff" stroke-width="0.8">${dots}<path${beat(blink, 't', 2.6, 0)} d="${spark(86, 12, 9)}"/><path${beat(blink, 't', 3, -1.2)} d="${spark(13, 85, 6)}"/></g></svg>`);
};

/** Ring radius just outside an avatar with the given radius ("50%" or "10px"). */
function outerRadius(r, grow) {
    const m = /^([\d.]+)px$/.exec(String(r || '').trim());
    if (m) return `${Number(m[1]) + grow}px`;
    return r || '50%';
}

/**
 * CSS for one avatar frame. Only style rules are added; SillyTavern's elements stay as they are.
 * Everything is placed around the picture's own box, so it fits however the avatar box is laid out.
 * @param {string} sel the avatar box (holds the <img>)
 * @param {string} imgSel the avatar <img> inside it
 * @param {{kind:string,color:string,blink:boolean}} fr
 * @param {string} radius the avatar picture's corner radius
 * @param {{x:number,y:number,w:number,h:number}} box the picture inside the avatar box, in px
 */
export function frameCss(sel, imgSel, fr, radius, box) {
    const f = cleanFrame(fr);
    if (!f || !box || !(box.w > 0) || !(box.h > 0)) return '';
    const c = f.color;
    const R = radius || '50%';
    const { x, y, w, h } = box;
    const at = (l, t, ww, hh) => `left:${Math.round(l)}px;top:${Math.round(t)}px;width:${Math.round(ww)}px;height:${Math.round(hh)}px;`;
    const ring = (bg, g = 3, extra = '') => `${sel}::before{content:'';position:absolute;z-index:0;pointer-events:none;${at(x - g, y - g, w + g * 2, h + g * 2)}border-radius:${outerRadius(R, g)};background:${bg};box-shadow:0 2px 6px rgba(0,0,0,.35);${extra}}`;
    // Twinkling lives inside the SVG; "reduce motion" swaps in the still picture.
    const deco = (bg, pos, still) => `${sel}::after{content:'';position:absolute;z-index:2;pointer-events:none;background:${bg} center/contain no-repeat;${pos}}`
        + (still ? `@media (prefers-reduced-motion: reduce){${sel}::after{background-image:${still};}}` : '');
    let css = `${sel}{position:relative;}${imgSel}{position:relative;z-index:1;}`;
    switch (f.kind) {
        case 'polaroid':
            css += `${sel}::before{content:'';position:absolute;z-index:0;pointer-events:none;${at(x - 5, y - 5, w + 10, h + 20)}border-radius:3px;background:${c};box-shadow:0 2px 7px rgba(0,0,0,.4);}`;
            break;
        case 'lace':
            css += ring(patternBg('lace', c), 5, `outline:2px dotted ${isLight(c) ? '#ffb3e1' : c};outline-offset:1px;`);
            break;
        case 'ribbon':
            css += ring(c) + deco(BOW(c), at(x + w / 2 - 15, y - 13, 30, 18));
            break;
        case 'heart':
            css += ring(c) + deco(HEART(c), at(x + w - 12, y + h - 13, 20, 19));
            break;
        case 'sparkle':
            css += ring(patternBg('glitter', c), 4) + deco(SPARKLES(isLight(c) ? '#ffe36b' : '#fff', f.blink), at(x - 11, y - 11, w + 22, h + 22), f.blink && SPARKLES(isLight(c) ? '#ffe36b' : '#fff', false));
            break;
        case 'rainbow':
            css += ring(RAINBOW, 4);
            break;
        case 'candy':
            css += ring(`repeating-conic-gradient(${c} 0 15deg, ${second(c)} 15deg 30deg)`, 4);
            break;
        case 'star':
            css += ring(c) + deco(STARS(c, f.blink), at(x + w - 20, y - 12, 32, 22), f.blink && STARS(c, false));
            break;
        case 'holo':
            css += ring(`${HOLO} 0 0/200% 200%`, 4, 'animation:facets-holo 6s linear infinite;') + deco(SPARKLES('#ffffff', f.blink), at(x - 9, y - 9, w + 18, h + 18), f.blink && SPARKLES('#ffffff', false));
            break;
        default: return '';
    }
    return css;
}
