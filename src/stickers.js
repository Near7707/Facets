// Stickers (0.10.0): the basic sticker pictures, drawn here as SVG (no picture files).
// Pure helpers only (no store access). Each sticker is a list of parts drawn in one of three looks:
//   jelly = soft gradient + white rim + gloss, cut = white die-cut edge + flat colours,
//   gloss = die-cut edge + gentle gradient + gloss. "spark" adds small twinkling four-point stars.

export const LOOKS = ['jelly', 'cut', 'gloss'];
export const MAX_STICKERS = 12;

// Colour sets: [light, middle, deep]
const PAL = {
    pink: ['#ffd6ea', '#ff8cc6', '#c23a7e'],
    cherry: ['#ffd0d8', '#ff5b7a', '#b81e43'],
    gold: ['#fff0c2', '#ffcb52', '#b07812'],
    lav: ['#ece3ff', '#b495ff', '#6b45c2'],
    sky: ['#dcefff', '#8cc6ff', '#3d79c4'],
    mint: ['#d8f6e8', '#7fd8b0', '#2e8f68'],
    bear: ['#fbe7d2', '#dba476', '#7d4a2a'],
    bubble: ['#ffffff', '#f3f8ff', '#5b8fd6'],
    lace: ['#ffffff', '#fff5fa', '#e0568a'],
};

// Part = [colour set, kind, tag, attributes]. kind: mid (body), light, deep, line (deep stroke), shine (white stroke)
const P = (pal, kind, tag, a) => [pal, kind, tag, a];
const path = (d) => `d="${d}"`;
const circle = (cx, cy, r) => `cx="${cx}" cy="${cy}" r="${r}"`;

const LACE_EDGE = 'M32.0 13.0 A5.4 5.4 0 0 1 41.5 15.5 A5.4 5.4 0 0 1 48.5 22.5 A5.4 5.4 0 0 1 51.0 32.0 A5.4 5.4 0 0 1 48.5 41.5 A5.4 5.4 0 0 1 41.5 48.5 A5.4 5.4 0 0 1 32.0 51.0 A5.4 5.4 0 0 1 22.5 48.5 A5.4 5.4 0 0 1 15.5 41.5 A5.4 5.4 0 0 1 13.0 32.0 A5.4 5.4 0 0 1 15.5 22.5 A5.4 5.4 0 0 1 22.5 15.5 A5.4 5.4 0 0 1 32.0 13.0Z';
const LACE_DOTS = [[46.5, 32], [42.3, 42.3], [32, 46.5], [21.7, 42.3], [17.5, 32], [21.7, 21.7], [32, 17.5], [42.3, 21.7]];

/** The basic stickers, in the order they are shown. main = colour set whose bodies get the gloss. */
export const BASIC = [
    { id: 'ribbon', main: 'pink', sparks: [[57, 14, 1.3], [6, 44, 0.78]], parts: [
        P('pink', 'mid', 'path', path('M30 34 L22 52 L28 50 L31 55Z')),
        P('pink', 'mid', 'path', path('M34 34 L42 52 L36 50 L33 55Z')),
        P('pink', 'mid', 'path', path('M32 31 C22 17 7 19 9 31 C11 42 24 39 32 33Z')),
        P('pink', 'mid', 'path', path('M32 31 C42 17 57 19 55 31 C53 42 40 39 32 33Z')),
        P('pink', 'line', 'path', path('M15 29 C18 26 23 27 26 31')),
        P('pink', 'line', 'path', path('M49 29 C46 26 41 27 38 31')),
        P('pink', 'mid', 'rect', 'x="27.5" y="26.5" width="9" height="10" rx="3.5"'),
    ] },
    { id: 'heart', main: 'cherry', sparks: [[55, 12, 1.3], [8, 46, 0.78]], parts: [
        P('cherry', 'mid', 'path', path('M32 52 C14 40 8 30 12 21 C16 13 27 13 32 22 C37 13 48 13 52 21 C56 30 50 40 32 52Z')),
        P('cherry', 'shine', 'path', path('M18 24 C19 21 22 19 25 20')),
    ] },
    { id: 'star', main: 'gold', sparks: [[57, 10, 1.17], [8, 52, 0.78]], parts: [
        P('gold', 'mid', 'path', path('M32.0 9.0 L39.1 24.3 L55.8 26.3 L43.4 37.7 L46.7 54.2 L32.0 46.0 L17.3 54.2 L20.6 37.7 L8.2 26.3 L24.9 24.3Z')),
        P('gold', 'deep', 'circle', circle(27, 34, 1.8)),
        P('gold', 'deep', 'circle', circle(37, 34, 1.8)),
        P('gold', 'line', 'path', path('M29.5 39 C31 40.5 33 40.5 34.5 39')),
    ] },
    { id: 'cherry', main: 'cherry', sparks: [[8, 22, 1.04]], parts: [
        P('mint', 'line', 'path', path('M22 36 C24 25 30 17 38 12')),
        P('mint', 'line', 'path', path('M42 37 C40 28 39 20 38 12')),
        P('mint', 'mid', 'path', path('M38 12 C43 6 52 8 55 12 C49 17 43 17 38 12Z')),
        P('cherry', 'mid', 'circle', circle(21, 44, 10)),
        P('cherry', 'mid', 'circle', circle(43, 45, 10)),
        P('cherry', 'shine', 'path', path('M16 40 C17 38 19 37 21 37')),
        P('cherry', 'shine', 'path', path('M38 41 C39 39 41 38 43 38')),
    ] },
    { id: 'crown', main: 'gold', sparks: [[60, 36, 1.04], [4, 8, 0.78]], parts: [
        P('gold', 'mid', 'path', path('M12 45 L9 21 L22 32 L32 14 L42 32 L55 21 L52 45Z')),
        P('gold', 'mid', 'rect', 'x="11" y="43" width="42" height="9" rx="3"'),
        P('cherry', 'mid', 'circle', circle(22, 47.5, 2.6)),
        P('sky', 'mid', 'circle', circle(32, 47.5, 2.6)),
        P('cherry', 'mid', 'circle', circle(42, 47.5, 2.6)),
        P('gold', 'mid', 'circle', circle(9, 20, 3)),
        P('gold', 'mid', 'circle', circle(32, 13, 3)),
        P('gold', 'mid', 'circle', circle(55, 20, 3)),
    ] },
    { id: 'sparkle', main: 'lav', sparks: [[56, 14, 0.9]], parts: [
        P('lav', 'mid', 'path', path('M28 7 C30 23 32 26 48 29 C32 32 30 35 28 51 C26 35 24 32 8 29 C24 26 26 23 28 7Z')),
        P('sky', 'mid', 'path', path('M47 39 C48 46 49 47 56 48 C49 49 48 50 47 57 C46 50 45 49 38 48 C45 47 46 46 47 39Z')),
    ] },
    { id: 'butterfly', main: 'sky', sparks: [[58, 52, 1.04]], parts: [
        P('sky', 'mid', 'path', path('M31 31 C23 12 7 13 9 26 C10 34 22 35 31 33Z')),
        P('sky', 'mid', 'path', path('M33 31 C41 12 57 13 55 26 C54 34 42 35 33 33Z')),
        P('lav', 'mid', 'path', path('M31 34 C22 36 13 44 17 50 C21 55 28 47 31 37Z')),
        P('lav', 'mid', 'path', path('M33 34 C42 36 51 44 47 50 C43 55 36 47 33 37Z')),
        P('sky', 'light', 'circle', circle(18, 25, 3)),
        P('sky', 'light', 'circle', circle(46, 25, 3)),
        P('lav', 'deep', 'rect', 'x="30" y="24" width="4" height="24" rx="2"'),
        P('lav', 'line', 'path', path('M31 25 C29 19 26 16 23 15')),
        P('lav', 'line', 'path', path('M33 25 C35 19 38 16 41 15')),
    ] },
    { id: 'catears', main: 'lav', sparks: [[32, 12, 1.04]], parts: [
        P('lav', 'mid', 'path', path('M14 41 L15 14 L31 31Z')),
        P('lav', 'mid', 'path', path('M50 41 L49 14 L33 31Z')),
        P('pink', 'mid', 'path', path('M18 33 L18.5 21 L26 30Z')),
        P('pink', 'mid', 'path', path('M46 33 L45.5 21 L38 30Z')),
        P('lav', 'mid', 'path', path('M7 50 C10 28 54 28 57 50 L52 51 C48 35 16 35 12 51Z')),
    ] },
    { id: 'bubble', main: 'bubble', sparks: [[60, 8, 1.17]], parts: [
        P('bubble', 'mid', 'path', path('M13 12 H51 A7 7 0 0 1 58 19 V39 A7 7 0 0 1 51 46 H29 L18 55 L20 46 H13 A7 7 0 0 1 6 39 V19 A7 7 0 0 1 13 12Z')),
        P('pink', 'mid', 'path', path('M32 38 C25 33 23 29 25 25.5 C27 22.5 30 23.5 32 27 C34 23.5 37 22.5 39 25.5 C41 29 39 33 32 38Z')),
    ] },
    { id: 'lace', main: 'lace', sparks: [[58, 8, 1.17], [6, 56, 0.78]], parts: [
        P('lace', 'mid', 'path', path(LACE_EDGE)),
        P('pink', 'light', 'circle', circle(32, 32, 9)),
        ...LACE_DOTS.map(([x, y]) => P('lace', 'deep', 'circle', circle(x, y, 1.7))),
    ] },
    { id: 'bear', main: 'bear', sparks: [[58, 10, 1.04]], parts: [
        P('bear', 'mid', 'circle', circle(18, 20, 7.5)),
        P('bear', 'mid', 'circle', circle(46, 20, 7.5)),
        P('bear', 'light', 'circle', circle(18, 20, 3.5)),
        P('bear', 'light', 'circle', circle(46, 20, 3.5)),
        P('bear', 'mid', 'circle', circle(32, 36, 18)),
        P('bear', 'light', 'ellipse', 'cx="32" cy="42" rx="8.5" ry="6.5"'),
        P('bear', 'deep', 'circle', circle(25, 33, 2)),
        P('bear', 'deep', 'circle', circle(39, 33, 2)),
        P('bear', 'deep', 'ellipse', 'cx="32" cy="39.5" rx="2.6" ry="2"'),
        P('pink', 'mid', 'circle', circle(20, 40, 2.6)),
        P('pink', 'mid', 'circle', circle(44, 40, 2.6)),
    ] },
];

export const BASIC_IDS = BASIC.map(b => b.id);
const byId = (id) => BASIC.find(b => b.id === id) || null;

function mix(a, b, w) {
    const n = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [n(a), n(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * w).toString(16).padStart(2, '0')).join('');
}

// Small four-point stars; with blink each one twinkles on its own beat. "Reduce motion" stops them.
const SPARK_D = 'M0 -5 C.6 -1 1 -.6 5 0 C1 .6 .6 1 0 5 C-.6 1 -1 .6 -5 0 C-1 -.6 -.6 -1 0 -5Z';
const TW_STYLE = '<style>.tw{animation:tw var(--d) ease-in-out var(--l) infinite}@keyframes tw{0%,100%{opacity:1}50%{opacity:.12}}'
    + '@media (prefers-reduced-motion: reduce){.tw{animation:none}}</style>';
const BEATS = [[2.2, 0.7], [2.6, 1.6], [1.9, 0.2]];

function sparkMarks(spots, blink) {
    return spots.map(([x, y, k], i) => {
        const [d, l] = BEATS[i % BEATS.length];
        const tw = blink ? ` class="tw" style="--d:${d}s;--l:${l}s"` : '';
        return `<path${tw} d="${SPARK_D}" transform="translate(${x} ${y}) scale(${k})" fill="#fff" stroke="#f7b6d6" stroke-width=".5"/>`;
    }).join('');
}

/** SVG of one basic sticker ('' if unknown). Same 74-unit box for every look, so the size doesn't jump. */
export function basicSvg(id, look = 'gloss', spark = false, blink = true) {
    const b = byId(id);
    if (!b) return '';
    const lk = LOOKS.includes(look) ? look : 'gloss';
    const pals = [...new Set(b.parts.filter(p => p[1] === 'mid').map(p => p[0]))];
    const grad = (pal) => {
        const [l, m, d] = PAL[pal];
        return lk === 'jelly'
            ? `<radialGradient id="g_${pal}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${mix(l, '#ffffff', 0.3)}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${mix(m, d, 0.55)}"/></radialGradient>`
            : `<radialGradient id="g_${pal}" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="${mix(l, '#ffffff', 0.2)}"/><stop offset=".6" stop-color="${m}"/><stop offset="1" stop-color="${mix(m, d, 0.3)}"/></radialGradient>`;
    };
    const el = (tag, a, rest) => `<${tag} ${a} ${rest}/>`;
    let defs = '';
    let body = '';
    if (lk !== 'cut') defs += pals.map(grad).join('');
    const clip = b.parts.filter(p => p[1] === 'mid' && p[0] === b.main).map(p => el(p[2], p[3], '')).join('');
    if (lk !== 'cut') defs += `<clipPath id="c">${clip}</clipPath>`;
    if (lk !== 'jelly') {
        // White die-cut edge under everything.
        for (const [, kind, tag, a] of b.parts) {
            if (kind === 'shine') continue;
            body += el(tag, a, `fill="#fff" stroke="#fff" stroke-width="${kind === 'line' ? 10 : 7.5}" stroke-linejoin="round" stroke-linecap="round"`);
        }
    }
    for (const [pal, kind, tag, a] of b.parts) {
        const [l, m, d] = PAL[pal];
        switch (kind) {
            case 'mid':
                body += lk === 'cut' ? el(tag, a, `fill="${m}"`)
                    : lk === 'jelly' ? el(tag, a, `fill="url(#g_${pal})" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"`)
                        : el(tag, a, `fill="url(#g_${pal})"`);
                break;
            case 'light': body += el(tag, a, `fill="${lk === 'jelly' ? mix(l, '#ffffff', 0.4) : l}"`); break;
            case 'deep': body += el(tag, a, `fill="${d}"`); break;
            case 'line': body += el(tag, a, `fill="none" stroke="${d}" stroke-width="${lk === 'jelly' ? 2.8 : 2.6}" stroke-linecap="round"`); break;
            case 'shine': {
                const [op, w] = lk === 'jelly' ? ['.8', 2.4] : lk === 'cut' ? ['.75', 2.2] : ['.85', 2.2];
                body += el(tag, a, `fill="none" stroke="#fff" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round"`);
                break;
            }
        }
    }
    if (lk === 'jelly') body += '<g clip-path="url(#c)"><ellipse cx="22" cy="17" rx="15" ry="8" transform="rotate(-25 22 17)" fill="#fff" opacity=".55"/></g>';
    if (lk === 'gloss') body += '<g clip-path="url(#c)"><ellipse cx="22" cy="16" rx="13" ry="6" transform="rotate(-25 22 16)" fill="#fff" opacity=".45"/></g>';
    if (spark) body += sparkMarks(b.sparks, blink);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 74 74" width="148" height="148">${spark && blink ? TW_STYLE : ''}<defs>${defs}</defs>${body}</svg>`;
}

export const svgDataUrl = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Picture address of a basic sticker. */
export function basicUrl(id, look, spark, blink = true) {
    const svg = basicSvg(id, look, spark, blink);
    return svg ? svgDataUrl(svg) : '';
}

/** Twinkling stars laid over your own sticker pictures (the same stars, top right and bottom left). */
export function sparkOverlayUrl(blink = true) {
    return svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 74 74">${blink ? TW_STYLE : ''}${sparkMarks([[60, 6, 1.3], [2, 56, 0.85]], blink)}</svg>`);
}

/** Shadow (and white edge for your own pictures) per look, as a CSS filter for the <img>. */
export function lookFilter(look, mine) {
    if (!mine) return look === 'jelly' ? 'drop-shadow(0 3px 4px rgba(120,50,140,.28))' : 'drop-shadow(0 2px 3px rgba(40,20,60,.3))';
    const k = look === 'jelly' ? 2 : 4;
    const edge = `drop-shadow(${k}px 0 0 #fff) drop-shadow(-${k}px 0 0 #fff) drop-shadow(0 ${k}px 0 #fff) drop-shadow(0 -${k}px 0 #fff)`;
    return `${edge} ${look === 'jelly' ? 'drop-shadow(0 3px 4px rgba(120,50,140,.32))' : 'drop-shadow(0 2px 3px rgba(40,20,60,.35))'}`;
}
