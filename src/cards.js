// 0.11.0: photocards. Plain helpers (no store, no screen): cleaning the saved data, drawing the background,
// and drawing a whole card onto a canvas for saving. The workbench screen is in cardui.js.

import { LOOKS, BASIC_IDS, basicUrl, svgDataUrl } from './stickers.js';

export const CARD_W = 1100;
export const CARD_H = 1700; // 55:85, a photocard
export const MAX_CARD_PICS = 8;
export const MAX_CARD_STICKERS = 12;
export const MAX_CARDS = 200;
export const CARD_FOLDER = 'Facets_cards';
export const CARD_PIC_MAX = 2048; // long side of a picture uploaded for a card
export const BG_KINDS = ['solid', 'pat', 'img', 'clear'];
export const CARD_PATS = ['dots', 'check', 'stripe', 'rainbow', 'holo'];
export const CARD_FIXED = new Set(['rainbow', 'holo']);
export const CARD_COLORS = ['#ffffff', '#ffd1ea', '#e3d0ff', '#c9f1ff', '#c8f2dc', '#fff1b8', '#ff9fb2'];
export const ITEM_W_MIN = 0.06;
export const ITEM_W_MAX = 2.5;
export const OPACITY_MIN = 0.1;

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
export function cleanItem(it) {
    if (!it || typeof it !== 'object') return null;
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
    let pics = 0, stks = 0;
    const kept = items.filter(it => (it.kind === 'pic' ? ++pics <= MAX_CARD_PICS : ++stks <= MAX_CARD_STICKERS));
    return {
        id: typeof c.id === 'string' && c.id ? c.id : rid(),
        bg: cleanBg(c.bg),
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
    if (it.kind === 'pic') return urlOf(it.src);
    if (it.skind === 'basic') return basicUrl(it.ref, it.look, it.spark, false);
    return it.src ? urlOf(it.src) : '';
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
    const c = document.createElement('canvas');
    c.width = CARD_W;
    c.height = CARD_H;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    let missing = 0;
    const bg = card.bg;
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
    for (const it of card.items) {
        const img = await loadImg(itemSrc(it, urlOf));
        if (!img) { missing++; continue; }
        const w = it.w * CARD_W;
        const h = w / (it.ar || (img.naturalWidth / img.naturalHeight) || 1);
        g.save();
        g.globalAlpha = it.opacity;
        g.translate(it.x * CARD_W, it.y * CARD_H);
        g.rotate(it.rot * Math.PI / 180);
        if (it.flip) g.scale(-1, 1);
        g.drawImage(img, -w / 2, -h / 2, w, h);
        g.restore();
    }
    return { canvas: c, missing };
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
