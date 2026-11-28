// 0.11.0: photocards. Plain helpers (no store, no screen): cleaning the saved data, drawing the background,
// and drawing a whole card onto a canvas for saving. The workbench screen is in cardui.js.

import { LOOKS, BASIC_IDS, basicUrl, svgDataUrl } from './stickers.js';

export const CARD_W = 1100;
export const CARD_H = 1700; // 55:85, a photocard
export const MAX_CARD_PICS = 8;
export const MAX_CARD_STICKERS = 12;
export const MAX_CARDS = 200;
export const CARD_FOLDER = 'Facets_cards';
export const CARD_PIC_MAX = 1700; // long side of a picture uploaded for a card (0.12.2: the card is 1700 tall)
export const BG_KINDS = ['solid', 'pat', 'img', 'clear'];
export const CARD_PATS = ['dots', 'check', 'stripe', 'rainbow', 'holo'];
export const CARD_FIXED = new Set(['rainbow', 'holo']);
export const CARD_COLORS = ['#ffffff', '#ffd1ea', '#e3d0ff', '#c9f1ff', '#c8f2dc', '#fff1b8', '#ff9fb2'];
export const ITEM_W_MIN = 0.06;
export const ITEM_W_MAX = 2.5;
export const OPACITY_MIN = 0.1;
// 0.12.0: tape, card border, see-through margin.
export const CARD_PAD = 100; // margin kept round the card when tape or pictures hang over its edge (1300 × 1900)
export const TAPE_PATS = ['solid', 'gingham', 'dots', 'stripe', 'heart', 'holo'];
export const TAPE_FIXED = new Set(['holo']);
export const TAPE_COLORS = ['#ffd1e3', '#e3d0ff', '#cfe8ff', '#d4f5e4', '#ffeaa8', '#ffb3b3', '#ffffff'];
export const TAPE_BANDS = { thin: 0.07, mid: 0.095, wide: 0.125 }; // thickness, share of the card's width
export const TAPE_ALPHA = 0.86; // tape is always a little see-through
export const TAPE_LEN_MIN = 0.12;
export const FRAME_WIDTHS = { none: 0, thin: 26, mid: 48, thick: 78 }; // card units (the card is 1100 wide)
export const FRAME_COLORS = ['#ffffff', '#ffd1e3', '#e3d0ff', '#cfe8ff', '#fff3c4', '#2b2433'];
export const FRAME_RADII = { sq: 0, soft: 36, round: 84 };

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function normRot(r) {
    let n = Number.isFinite(r) ? r % 360 : 0;
    if (n > 180) n -= 360;
    if (n < -180) n += 360;
    return Math.round(n * 10) / 10;
}

export function cleanBg(b) {
    const o = b && typeof b === 'object' ? b : {};
    const kind = BG_KINDS.includes(o.kind) ? o.kind : 'pat';
    return {
        kind,
        color: typeof o.color === 'string' && HEX.test(o.color) ? o.color.toLowerCase() : CARD_COLORS[1],
        pat: CARD_PATS.includes(o.pat) ? o.pat : 'holo',
        path: typeof o.path === 'string' ? o.path : '',
    };
}

/**
 * Item = a picture or a sticker on the card.
 * x, y = its middle as a share of the card's width / height; w = its width as a share of the card's width;
 * ar = width / height of the picture (kept so the layout doesn't jump while it loads).
 */
export function cleanTapeLook(o) {
    const t = o && typeof o === 'object' ? o : {};
    return {
        pat: TAPE_PATS.includes(t.pat) ? t.pat : 'gingham',
        color: typeof t.color === 'string' && HEX.test(t.color) ? t.color.toLowerCase() : TAPE_COLORS[0],
        band: Object.hasOwn(TAPE_BANDS, t.band) ? t.band : 'mid',
        torn: t.torn !== false,
    };
}

export function cleanFrame(f) {
    const o = f && typeof f === 'object' ? f : {};
    return {
        w: Object.hasOwn(FRAME_WIDTHS, o.w) ? o.w : 'none',
        color: typeof o.color === 'string' && HEX.test(o.color) ? o.color.toLowerCase() : FRAME_COLORS[0],
        r: Object.hasOwn(FRAME_RADII, o.r) ? o.r : 'sq',
    };
}

export function cleanItem(it) {
    if (!it || typeof it !== 'object') return null;
    if (it.kind === 'tape') {
        // Tape: x, y = its middle; w = its length (share of the card's width); thickness comes from band.
        const look = cleanTapeLook(it);
        const w = num(it.w, TAPE_LEN_MIN, ITEM_W_MAX, 0.36);
        return {
            id: typeof it.id === 'string' && it.id ? it.id : rid(),
            kind: 'tape',
            x: num(it.x, -0.5, 1.5, 0.5),
            y: num(it.y, -0.5, 1.5, 0.5),
            w,
            ar: w / TAPE_BANDS[look.band],
            rot: normRot(it.rot),
            flip: false,
            opacity: 1,
            ...look,
        };
    }
    const kind = it.kind === 'stk' ? 'stk' : 'pic';
    const base = {
        id: typeof it.id === 'string' && it.id ? it.id : rid(),
        kind,
        x: num(it.x, -0.5, 1.5, 0.5),
        y: num(it.y, -0.5, 1.5, 0.5),
        w: num(it.w, ITEM_W_MIN, ITEM_W_MAX, 0.6),
        ar: num(it.ar, 0.05, 20, 1),
        rot: normRot(it.rot),
        flip: it.flip === true,
        opacity: num(it.opacity, OPACITY_MIN, 1, 1),
    };
    if (kind === 'pic') {
        if (typeof it.src !== 'string' || !it.src) return null;
        return { ...base, src: it.src, own: it.own === true };
    }
    const skind = it.skind === 'mine' ? 'mine' : 'basic';
    if (typeof it.ref !== 'string' || !it.ref || (skind === 'basic' && !BASIC_IDS.includes(it.ref))) return null;
    return { ...base, skind, ref: it.ref, src: skind === 'mine' && typeof it.src === 'string' ? it.src : '',
        look: LOOKS.includes(it.look) ? it.look : 'gloss', spark: it.spark === true };
}

export function cleanCard(c) {
    if (!c || typeof c !== 'object') return null;
    const items = Array.isArray(c.items) ? c.items.map(cleanItem).filter(Boolean) : [];
    let pics = 0, stks = 0; // stickers and tape count together (12)
    const kept = items.filter(it => (it.kind === 'pic' ? ++pics <= MAX_CARD_PICS : ++stks <= MAX_CARD_STICKERS));
    return {
        id: typeof c.id === 'string' && c.id ? c.id : rid(),
        bg: cleanBg(c.bg),
        frame: cleanFrame(c.frame),
        cardOnly: c.cardOnly === true,
        items: kept,
        out: typeof c.out === 'string' ? c.out : '',
        t: Number.isFinite(c.t) ? c.t : 0,
    };
}

export function newCard() {
    return cleanCard({ bg: { kind: 'pat', pat: 'holo' }, items: [] });
}

/** Draft = the card being made (kept so closing the window loses nothing). uploads = files uploaded while editing. */
export function cleanDraft(d) {
    if (!d || typeof d !== 'object') return null;
    const card = cleanCard(d.card);
    if (!card) return null;
    return {
        base: typeof d.base === 'string' && d.base ? d.base : null,
        card,
        uploads: Array.isArray(d.uploads) ? [...new Set(d.uploads.filter(p => typeof p === 'string' && p))] : [],
    };
}

/** Files that belong to this card (finished picture, background picture, pictures uploaded for it). */
export function cardFiles(c) {
    if (!c) return [];
    const out = [];
    if (typeof c.out === 'string' && c.out) out.push(c.out);
    if (c.bg?.kind === 'img' && typeof c.bg.path === 'string' && c.bg.path) out.push(c.bg.path);
    for (const it of Array.isArray(c.items) ? c.items : []) if (it && it.kind !== 'stk' && it.own === true && typeof it.src === 'string' && it.src) out.push(it.src);
    return out;
}

/** Every picture path the card draws (outfit pictures too). */
export function cardPaths(c) {
    const out = [];
    if (c?.bg?.kind === 'img' && c.bg.path) out.push(c.bg.path);
    for (const it of Array.isArray(c?.items) ? c.items : []) if (it && typeof it.src === 'string' && it.src) out.push(it.src);
    return out;
}

// ---- background ----

function second(c) {
    // Two-colour patterns use white, or a soft pink on a very light colour.
    const n = parseInt(c.slice(1), 16);
    const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.93 ? '#ffd1ea' : '#ffffff';
}

/** The background as an SVG the size of the card (both the screen and the saved file use it). '' = none. */
export function bgSvg(bg) {
    const b = cleanBg(bg);
    const W = CARD_W, H = CARD_H;
    const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
    if (b.kind === 'clear' || b.kind === 'img') return '';
    if (b.kind === 'solid') return `${open}<rect width="${W}" height="${H}" fill="${b.color}"/></svg>`;
    const c = b.color, s = second(c);
    switch (b.pat) {
        case 'dots':
            return `${open}<defs><pattern id="p" width="66" height="66" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="9" fill="${s}" fill-opacity=".9"/><circle cx="49" cy="49" r="9" fill="${s}" fill-opacity=".9"/></pattern></defs><rect width="${W}" height="${H}" fill="${c}"/><rect width="${W}" height="${H}" fill="url(#p)"/></svg>`;
        case 'check':
            return `${open}<defs><pattern id="p" width="110" height="110" patternUnits="userSpaceOnUse"><rect width="55" height="55" fill="${s}" fill-opacity=".6"/><rect x="55" y="55" width="55" height="55" fill="${s}" fill-opacity=".6"/></pattern></defs><rect width="${W}" height="${H}" fill="${c}"/><rect width="${W}" height="${H}" fill="url(#p)"/></svg>`;
        case 'stripe':
            return `${open}<defs><pattern id="p" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="35" height="70" fill="${s}" fill-opacity=".75"/></pattern></defs><rect width="${W}" height="${H}" fill="${c}"/><rect width="${W}" height="${H}" fill="url(#p)"/></svg>`;
        case 'rainbow':
            return `${open}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3e1"/><stop offset=".25" stop-color="#e3d0ff"/><stop offset=".5" stop-color="#c9f1ff"/><stop offset=".75" stop-color="#c8f2dc"/><stop offset="1" stop-color="#fff6c4"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
        default: // holo
            return `${open}<defs><linearGradient id="g" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#ffd1ea"/><stop offset=".45" stop-color="#e3d0ff"/><stop offset="1" stop-color="#c9f1ff"/></linearGradient><pattern id="p" width="70" height="70" patternUnits="userSpaceOnUse"><circle cx="35" cy="35" r="6" fill="#fff" fill-opacity=".85"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#p)"/></svg>`;
    }
}

export function bgUrl(bg) {
    const s = bgSvg(bg);
    return s ? svgDataUrl(s) : '';
}

/** A small pattern sample for the picker (same drawing, scaled down). */
export function patSample(pat, color) {
    return bgUrl({ kind: 'pat', pat, color });
}

// ---- items ----

/** Where an item's picture comes from (urlOf is passed in so this file stays free of the image helpers). */
export function itemSrc(it, urlOf) {
    if (it.kind === 'tape') return svgDataUrl(tapeSvg(it));
    if (it.kind === 'pic') return urlOf(it.src);
    if (it.skind === 'basic') return basicUrl(it.ref, it.look, it.spark, false);
    return it.src ? urlOf(it.src) : '';
}

// ---- tape ----

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function rng(seed) {
    let x = seed || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1000) / 1000; };
}
function shade(c, k) {
    const n = parseInt(c.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
    return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
const r1 = (v) => Math.round(v * 10) / 10;

/** Torn ends: a little zigzag at both ends (same for the same tape, so it doesn't flicker). */
function tornPath(L, T, seed) {
    const r = rng(seed);
    const d = Math.max(4, T * 0.1);
    const n = Math.max(5, Math.round(T / 11));
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
        const y = r1(T * i / n);
        left.push(`${r1((i % 2 ? d : 0) + r() * d * 0.5)},${y}`);
        right.push(`${r1(L - (i % 2 ? d : 0) - r() * d * 0.5)},${y}`);
    }
    return `M${right.join(' L')} L${left.reverse().join(' L')} Z`;
}

/** The pattern fill for tape. Patterns are in card units, so a longer tape repeats them instead of stretching. */
function tapeFill(pat, c) {
    const s = second(c);
    switch (pat) {
        case 'gingham': {
            const dk = shade(c, 0.8);
            return [`<pattern id="t" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="13" height="26" fill="${dk}" fill-opacity=".32"/><rect width="26" height="13" fill="${dk}" fill-opacity=".32"/></pattern>`, c];
        }
        case 'dots':
            return [`<pattern id="t" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="4.2" fill="${s}"/><circle cx="20" cy="20" r="4.2" fill="${s}"/></pattern>`, c];
        case 'stripe':
            return [`<pattern id="t" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="9" height="22" fill="${s}" fill-opacity=".85"/></pattern>`, c];
        case 'heart': {
            const h = 'M15 21C6 15 7 8 11.5 8C13.5 8 15 9.5 15 11C15 9.5 16.5 8 18.5 8C23 8 24 15 15 21Z';
            return [`<pattern id="t" width="36" height="36" patternUnits="userSpaceOnUse"><path d="${h}" fill="${s}" transform="scale(.75)"/><path d="${h}" fill="${s}" transform="translate(18 18) scale(.75)"/></pattern>`, c];
        }
        case 'holo':
            return [`<linearGradient id="h" x1="0" y1="0" x2="260" y2="60" gradientUnits="userSpaceOnUse" spreadMethod="reflect"><stop offset="0" stop-color="#ffd1ea"/><stop offset=".35" stop-color="#e3d0ff"/><stop offset=".65" stop-color="#c9f1ff"/><stop offset="1" stop-color="#fff6c4"/></linearGradient><pattern id="t" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="2.4" fill="#fff" fill-opacity=".9"/><circle cx="30" cy="27" r="1.6" fill="#fff" fill-opacity=".8"/></pattern>`, 'url(#h)'];
        default:
            return ['', c];
    }
}

/** Width and height of a tape in card units. */
export function tapeSize(it) {
    return { w: it.w * CARD_W, h: (TAPE_BANDS[it.band] || TAPE_BANDS.mid) * CARD_W };
}

/** A tape as an SVG (the screen and the saved file both use it). */
export function tapeSvg(it) {
    const { w, h } = tapeSize(it);
    const L = r1(w), T = r1(h);
    const [defs, base] = tapeFill(it.pat, it.color);
    const shape = it.torn ? `<path d="${tornPath(L, T, hash(it.id || 'tape'))}"/>` : `<rect width="${L}" height="${T}"/>`;
    const fill = (f) => shape.replace(/\/>$/, ` fill="${f}"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${T}" viewBox="0 0 ${L} ${T}" preserveAspectRatio="none"><defs>${defs}</defs><g opacity="${TAPE_ALPHA}">${fill(base)}${defs.includes('id="t"') ? fill('url(#t)') : ''}</g></svg>`;
}

/** A small sample of a tape look for the picker. */
export function tapeSample(look) {
    return svgDataUrl(tapeSvg({ ...cleanTapeLook(look), id: 'sample', w: 0.3, band: 'wide' }));
}

// ---- card border ----

function roundRectPath(x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!q) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    return `M${x + q} ${y}H${x + w - q}A${q} ${q} 0 0 1 ${x + w} ${y + q}V${y + h - q}A${q} ${q} 0 0 1 ${x + w - q} ${y + h}H${x + q}A${q} ${q} 0 0 1 ${x} ${y + h - q}V${y + q}A${q} ${q} 0 0 1 ${x + q} ${y}Z`;
}

export const frameRadius = (frame) => FRAME_RADII[cleanFrame(frame).r] || 0;

/** The card border as an SVG the size of the card (a ring, see-through inside). '' = none. */
export function frameSvg(frame) {
    const f = cleanFrame(frame);
    const bw = FRAME_WIDTHS[f.w];
    if (!bw) return '';
    const r = FRAME_RADII[f.r];
    const d = roundRectPath(0, 0, CARD_W, CARD_H, r) + roundRectPath(bw, bw, CARD_W - 2 * bw, CARD_H - 2 * bw, Math.max(0, r - bw));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" preserveAspectRatio="none"><path d="${d}" fill="${f.color}" fill-rule="evenodd"/></svg>`;
}

export function frameUrl(frame) {
    const s = frameSvg(frame);
    return s ? svgDataUrl(s) : '';
}

// ---- see-through margin ----

/** Size of an item in card units. */
function itemDims(it) {
    if (it.kind === 'tape') return tapeSize(it);
    const w = it.w * CARD_W;
    return { w, h: w / (it.ar || 1) };
}

/** Half the width / height of the box an item covers once turned (card units). */
export function itemReach(it) {
    const { w, h } = itemDims(it);
    const a = it.rot * Math.PI / 180;
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    return { ex: (c * w + s * h) / 2, ey: (s * w + c * h) / 2 };
}

/** Does any tape or picture hang over the card's edge? */
export function cardOverflow(card) {
    for (const it of card?.items || []) {
        const { ex, ey } = itemReach(it);
        const x = it.x * CARD_W, y = it.y * CARD_H;
        if (x - ex < -1 || x + ex > CARD_W + 1 || y - ey < -1 || y + ey > CARD_H + 1) return true;
    }
    return false;
}

/** The margin the saved picture gets: CARD_PAD when something hangs over (and "card only" is off), else 0. */
export function cardPad(card) {
    return !card?.cardOnly && cardOverflow(card) ? CARD_PAD : 0;
}

function loadImg(src) {
    return new Promise((resolve) => {
        if (!src) { resolve(null); return; }
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Draw the whole card at full size. Pictures that fail to load (a deleted outfit) are left out.
 * @returns {Promise<{ canvas: HTMLCanvasElement, missing: number }>}
 */
export async function renderCard(card, urlOf) {
    const pad = cardPad(card);
    const c = document.createElement('canvas');
    c.width = CARD_W + pad * 2;
    c.height = CARD_H + pad * 2;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.translate(pad, pad);
    let missing = 0;
    const bg = card.bg;
    // The card itself (background + border) keeps its corners; things on it may hang over.
    g.save();
    const r = frameRadius(card.frame);
    if (r) {
        g.beginPath();
        g.moveTo(r, 0); g.arcTo(CARD_W, 0, CARD_W, CARD_H, r); g.arcTo(CARD_W, CARD_H, 0, CARD_H, r);
        g.arcTo(0, CARD_H, 0, 0, r); g.arcTo(0, 0, CARD_W, 0, r); g.closePath();
        g.clip();
    }
    if (bg.kind === 'img' && bg.path) {
        const img = await loadImg(urlOf(bg.path));
        if (img) {
            // Fill the card (cover), centred.
            const k = Math.max(CARD_W / img.naturalWidth, CARD_H / img.naturalHeight);
            const w = img.naturalWidth * k, h = img.naturalHeight * k;
            g.drawImage(img, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
        } else missing++;
    } else {
        const u = bgUrl(bg);
        const img = u ? await loadImg(u) : null;
        if (img) g.drawImage(img, 0, 0, CARD_W, CARD_H);
    }
    const fu = frameUrl(card.frame);
    const fimg = fu ? await loadImg(fu) : null;
    if (fimg) g.drawImage(fimg, 0, 0, CARD_W, CARD_H);
    g.restore();
    for (const it of card.items) {
        const img = await loadImg(itemSrc(it, urlOf));
        if (!img) { missing++; continue; }
        const w = it.w * CARD_W;
        const h = it.kind === 'tape' ? tapeSize(it).h : w / (it.ar || (img.naturalWidth / img.naturalHeight) || 1);
        g.save();
        g.globalAlpha = it.opacity;
        g.translate(it.x * CARD_W, it.y * CARD_H);
        g.rotate(it.rot * Math.PI / 180);
        if (it.flip) g.scale(-1, 1);
        g.drawImage(img, -w / 2, -h / 2, w, h);
        g.restore();
    }
    return { canvas: c, missing, pad };
}

/** Canvas → data URL: webp (keeps see-through parts, small), png where webp can't be made. */
export function canvasData(canvas, quality = 0.92) {
    let out = canvas.toDataURL('image/webp', quality);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
    return out;
}

/** A smaller copy (long side `max`), for stickers and thumbnails. */
export function shrinkCanvas(src, max) {
    const k = Math.min(1, max / Math.max(src.width, src.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k));
    c.height = Math.max(1, Math.round(src.height * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
}
