// Facets data lives only in extension settings (never in cards, chat files or chat metadata).

import { cleanDeco, cleanFrame, STICKER_DECO } from './deco.js';
import { LOOKS, BASIC_IDS, MAX_STICKERS } from './stickers.js';
import { cleanCard, cleanDraft, cardFiles, cardPaths, MAX_CARDS } from './cards.js';

export const MODULE = 'facets';
export const FORMAT = 1;
export const DEFAULT_MARK = '__default__';

// Words that, right next to a keyword, mean the outfit is NOT being put on.
// Korean words are checked right after the keyword, English words a few words before or right after.
export const DEFAULT_IGNORE = '벗, 대신, 말고, 없이, 빼고, 아닌, take off, took off, taking off, takes off, taken off, off, '
    + 'out of, without, remove, removed, removing, strip, stripped, not, no';
// Changes kept per chat and person; older ones fold into "before the first change".
export const MAX_POINTS = 200;

const DEFAULTS = Object.freeze({
    format: FORMAT,
    lang: 'en',
    langChosen: false, // false = follow SillyTavern's language
    showInChat: true,
    showInList: true,
    tellAI: false, // off until the user turns it on
    tellCount: 1, // 0.9.3: 1 for new installs (was 3). After a change, describe the look for this many AI replies (0 = every time)
    sinceMode: false, // "From now on": a change keeps older messages in the older outfit
    backupImages: true,
    autoKeywords: true, // change outfits when an AI reply uses their words
    autoPair: false, // automatic changes also change the matching-set partner
    ignoreWords: DEFAULT_IGNORE,
    showStage: true, // "In the chat" pictures (each character / persona still starts off)
    stageKbHide: true, // hide them while a phone keyboard is open
    moreOpen: false, // 0.9.1: the wardrobe's "Tell the AI / Random" fold is open
    // 0.9.2: the look of every Facets window: 'st' (SillyTavern colours), 'holo', 'clean' or 'diary'.
    // Light or dark always follows the SillyTavern theme. (Replaces 0.9.0's followTheme switch.)
    theme: 'st',
    // key -> { name, outfits: Outfit[], drawers: Drawer[], global: outfitId|null, stage?: Stage }
    // key is "char:<avatar file>" or "persona:<avatar file>"
    entities: {},
    // "<character avatar>::<chat file name>" -> { entityKey: outfitId | DEFAULT_MARK }
    chats: {},
    // "From now on" history: chatKey -> { entityKey: { base, points: [{ t, id }] } }
    // base = what older messages show (outfitId | DEFAULT_MARK | null = same as all chats).
    timelines: {},
    // When to describe the look to the AI: chatKey -> { entityKey: { t, muted? } }
    tells: {},
    // Branch chats already set up from their parent chat: chatKey -> parent chatKey
    branchDone: {},
    // "Random each reply": chatKey -> { entityKey: drawerId ('' = all outfits) }
    randoms: {},
    // Pictures pinned in one chat (0.6.1): chatKey -> { entityKey: Pin[] }
    pins: {},
    pinMemo: {},
    // Avatar frames (0.8.0): chatKey -> { entityKey: Frame }
    frames: {},
    // Stickers stuck on a chat (0.10.0): chatKey -> { '*': Sticker[] }. The fixed key '*' (not a character or
    // persona) lets renames, deletes, branches and backups follow the chat like the other chat tables.
    stickers: {},
    // Your own sticker pictures (0.10.0), shared by every chat: [{ id, path, name }]
    myStickers: [],
    // Look picked for new stickers (0.10.0)
    stickerLook: 'gloss',
    stickerSpark: true,
    // 0.11.0: photocards, newest first: Card[] (see cards.js). Pictures are files; only the layout is kept here.
    cards: [],
    // The photocard being made (one at a time), kept so closing the window loses nothing: { base, card, uploads }
    cardDraft: null,
    // Every file path Facets uploaded. Cleanup deletes only these.
    files: [],
});

/**
 * @typedef {{ id: string, name: string, desc: string, orig: string, sq: string,
 *   pair: { key: string, id: string } | null, drawers: string[] }} Outfit
 * @typedef {{ id: string, name: string }} Drawer
 */

let ctxGetter = () => globalThis.SillyTavern?.getContext?.();
export function setContextGetter(fn) { ctxGetter = fn; }
export function ctx() { return ctxGetter(); }

export function settings() {
    const c = ctx();
    const all = c.extensionSettings;
    if (!all[MODULE] || typeof all[MODULE] !== 'object') {
        all[MODULE] = structuredClone(DEFAULTS);
    }
    const s = all[MODULE];
    migrate(s);
    return s;
}

// Stage objects and pin lists already cleaned. settings() runs migrate() on every call, and cleaning them
// again would swap in new objects while a caller is still changing the old ones (0.7.0).
const cleaned = new WeakSet();

export const THEMES = ['st', 'holo', 'clean', 'diary'];

export function migrate(s) {
    // 0.9.2: followTheme -> theme. 0.9.x users kept Facets' own look (now "holo"), so it doesn't change on update.
    if (s.theme === undefined && typeof s.followTheme === 'boolean') s.theme = s.followTheme ? 'st' : 'holo';
    if ('followTheme' in s) delete s.followTheme;
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    if (typeof s.format !== 'number') s.format = FORMAT;
    // Future format upgrades go here: if (s.format < 2) { ...; s.format = 2; }
    if (!Array.isArray(s.files)) s.files = [];
    for (const k of ['chats', 'timelines', 'tells', 'branchDone', 'randoms', 'pins', 'pinMemo', 'frames', 'stickers']) {
        if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
    }
    for (const [ck, row] of Object.entries(s.pins)) {
        if (!row || typeof row !== 'object') { delete s.pins[ck]; continue; }
        for (const [ek, list] of Object.entries(row)) {
            if (Array.isArray(list) && list.length && cleaned.has(list)) continue;
            const clean = Array.isArray(list) ? list.map(cleanPin).filter(Boolean).slice(0, MAX_PINS) : [];
            if (clean.length) { row[ek] = clean; cleaned.add(clean); } else delete row[ek];
        }
        if (!Object.keys(row).length) delete s.pins[ck];
    }
    // Pins taken out, kept per outfit so pinning it again brings back its look (0.7.2).
    for (const [ck, row] of Object.entries(s.pinMemo)) {
        if (!row || typeof row !== 'object') { delete s.pinMemo[ck]; continue; }
        for (const [ek, map] of Object.entries(row)) {
            if (map && typeof map === 'object' && cleaned.has(map)) continue;
            const clean = {};
            for (const [oid, m] of Object.entries(map && typeof map === 'object' ? map : {})) {
                const p = cleanPin({ ...(m && typeof m === 'object' ? m : {}), outfit: oid });
                if (p) clean[oid] = p;
            }
            if (Object.keys(clean).length) { row[ek] = clean; cleaned.add(clean); } else delete row[ek];
        }
        if (!Object.keys(row).length) delete s.pinMemo[ck];
    }
    // Avatar frames (0.8.0). Cleaned once, then kept as they are (same reason as above).
    for (const [ck, row] of Object.entries(s.frames)) {
        if (!row || typeof row !== 'object') { delete s.frames[ck]; continue; }
        for (const [ek, f] of Object.entries(row)) {
            if (f && cleaned.has(f)) continue;
            const clean = cleanFrame(f);
            if (clean) { row[ek] = clean; cleaned.add(clean); } else delete row[ek];
        }
        if (!Object.keys(row).length) delete s.frames[ck];
    }
    // Stickers (0.10.0). Cleaned once, then kept as they are (same reason as above).
    if (!Array.isArray(s.myStickers)) s.myStickers = [];
    if (!cleaned.has(s.myStickers)) {
        s.myStickers = s.myStickers.filter(m => m && typeof m.id === 'string' && m.id && typeof m.path === 'string' && m.path)
            .map(m => ({ id: m.id, path: m.path, name: typeof m.name === 'string' ? m.name.slice(0, 40) : '' }));
        cleaned.add(s.myStickers);
    }
    for (const [ck, row] of Object.entries(s.stickers)) {
        const list = row && typeof row === 'object' ? row[STICKER_KEY] : null;
        if (Array.isArray(list) && list.length && cleaned.has(list)) continue;
        const clean = Array.isArray(list) ? list.map(cleanSticker).filter(Boolean).slice(0, MAX_STICKERS) : [];
        if (clean.length) { s.stickers[ck] = { [STICKER_KEY]: clean }; cleaned.add(clean); } else delete s.stickers[ck];
    }
    // Photocards (0.11.0). Cleaned once, then kept as they are (same reason as above).
    if (!Array.isArray(s.cards)) s.cards = [];
    if (!cleaned.has(s.cards)) {
        const seen = new Set();
        s.cards = s.cards.map(cleanCard).filter(c => c && !seen.has(c.id) && seen.add(c.id)).slice(0, MAX_CARDS);
        cleaned.add(s.cards);
    }
    if (s.cardDraft !== null && !cleaned.has(s.cardDraft)) {
        s.cardDraft = cleanDraft(s.cardDraft);
        if (s.cardDraft) cleaned.add(s.cardDraft);
    }
    if (!LOOKS.includes(s.stickerLook)) s.stickerLook = 'gloss';
    if (typeof s.stickerSpark !== 'boolean') s.stickerSpark = true;
    if (![0, 1, 3, 5].includes(s.tellCount)) s.tellCount = 1;
    if (!THEMES.includes(s.theme)) s.theme = 'st';
    if (typeof s.ignoreWords !== 'string') s.ignoreWords = DEFAULT_IGNORE;
    for (const row of Object.values(s.timelines)) {
        for (const [ek, tl] of Object.entries(row || {})) {
            if (!tl || !Array.isArray(tl.points)) { delete row[ek]; continue; }
            tl.points = tl.points.filter(p => p && Number.isFinite(p.t) && p.id).sort((a, b) => a.t - b.t);
            if (tl.base === undefined) tl.base = null;
        }
    }
    for (const e of Object.values(s.entities)) {
        if (!Array.isArray(e.outfits)) e.outfits = [];
        if (e.global === undefined) e.global = null;
        if (!Array.isArray(e.drawers)) e.drawers = [];
        e.drawers = e.drawers.filter(d => d && typeof d.id === 'string');
        for (const d of e.drawers) {
            if (typeof d.name !== 'string') d.name = '';
            if (typeof d.kw !== 'string') d.kw = '';
        }
        if (e.stage !== undefined && !cleaned.has(e.stage)) { e.stage = cleanStage(e.stage); cleaned.add(e.stage); }
        if (e.layouts !== undefined && !cleaned.has(e.layouts)) {
            e.layouts = Array.isArray(e.layouts) ? e.layouts.filter(l => l && typeof l.id === 'string').slice(0, MAX_LAYOUTS) : [];
            for (const l of e.layouts) {
                l.name = typeof l.name === 'string' ? l.name.slice(0, 40) : '';
                l.pins = Array.isArray(l.pins) ? l.pins.map(cleanPin).filter(Boolean).slice(0, MAX_PINS) : [];
                // 0.8.0: a layout also keeps the avatar frame (null = no frame). Older layouts have none.
                if ('frame' in l) l.frame = cleanFrame(l.frame);
                // 0.10.0: and the chat's stickers. Older layouts have none (loading them leaves stickers alone).
                if ('stickers' in l) l.stickers = Array.isArray(l.stickers) ? l.stickers.map(cleanSticker).filter(Boolean).slice(0, MAX_STICKERS) : [];
            }
            cleaned.add(e.layouts);
        }
        const drawerIds = new Set(e.drawers.map(d => d.id));
        for (const o of e.outfits) {
            if (o.pair === undefined) o.pair = null;
            if (typeof o.desc !== 'string') o.desc = '';
            if (typeof o.name !== 'string') o.name = '';
            if (typeof o.kw !== 'string') o.kw = '';
            if (!Array.isArray(o.drawers)) o.drawers = [];
            o.drawers = [...new Set(o.drawers.filter(id => drawerIds.has(id)))];
        }
    }
    return s;
}

// ---- "In the chat" pictures (0.6.0, free placement 0.7.0) ----
// Stage = { on, deco, flip, opacity, locked, hidden, place: { narrow?: Place, wide?: Place }, pose? }
// deco (0.8.0) = the picture's border (deco.js), null = none. The old "sticker" switch becomes a round white border.
// Place (0.7.0, v: 2) = { v, x, y, size, rot }: the middle of the picture as parts of the picture layer
//   (the whole window below SillyTavern's top bar), height as a part of the layer, turn in degrees.
// Older places (no v) were parts of the chat area and depended on a pose; they are changed into the
// new kind the first time they are shown (stage.js). "pose" stays only for that.
// Phones and PCs keep their own place.

export const POSES = ['stand', 'peek', 'pop', 'lean'];
export const SIZE_MIN = 0.1;
export const SIZE_MAX = 0.95;
export const OPACITY_MIN = 0.3;

const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Turn in degrees, kept in -180..180. */
export function normRot(r) {
    if (!Number.isFinite(r)) return 0;
    let x = ((r % 360) + 360) % 360;
    if (x > 180) x -= 360;
    return Math.round(x * 10) / 10;
}

function cleanPlace(p) {
    if (!p || typeof p !== 'object') return undefined;
    const out = p.v === 2
        ? { v: 2, x: clamp(p.x, -0.5, 1.5, 0.5), y: clamp(p.y, -0.5, 1.5, 0.5), size: clamp(p.size, SIZE_MIN, SIZE_MAX, 0.45) }
        : { x: clamp(p.x, 0, 1, 0.5), y: clamp(p.y, 0, 1, 0.5), size: clamp(p.size, 0.2, 0.8, 0.45) };
    out.rot = normRot(p.rot);
    return out;
}

export function cleanStage(st) {
    const s = st && typeof st === 'object' ? st : {};
    const place = {};
    for (const k of ['narrow', 'wide']) {
        const p = cleanPlace(s.place?.[k]);
        if (p) place[k] = p;
    }
    return {
        on: s.on === true,
        pose: POSES.includes(s.pose) ? s.pose : 'stand',
        deco: s.deco !== undefined ? cleanDeco(s.deco) : (s.sticker === true ? { ...STICKER_DECO } : null),
        flip: s.flip === true,
        opacity: clamp(s.opacity, OPACITY_MIN, 1, 1),
        locked: s.locked === true,
        hidden: s.hidden === true,
        place,
    };
}

/** The "in the chat" settings of one character / persona (null if none and not created). */
export function stageOf(key, create = false) {
    const e = getEntity(key, create);
    if (!e) return null;
    if (!e.stage) {
        if (!create) return null;
        e.stage = cleanStage(null);
    }
    return e.stage;
}

// ---- Pinned pictures and saved layouts (0.6.1) ----
// Pin = Stage without "on", plus { id, outfit }. Shown only in the chat it was pinned in.
// Layout = { id, name, pins: Pin[] } kept per character / persona, to load into another chat.

export const MAX_PINS = 6;
export const MAX_LAYOUTS = 20;

function cleanPin(p) {
    if (!p || typeof p !== 'object' || typeof p.outfit !== 'string' || !p.outfit) return null;
    const st = cleanStage(p);
    delete st.on;
    return { id: typeof p.id === 'string' && p.id ? p.id : newId(), outfit: p.outfit, ...st };
}

/** Pins of one character / persona in one chat (a live array; empty if none). */
export function pinsOf(chatKey, entityKey) {
    return settings().pins[chatKey]?.[entityKey] || [];
}

export function findPin(chatKey, entityKey, pinId) {
    return pinsOf(chatKey, entityKey).find(p => p.id === pinId) || null;
}

/** Pin an outfit picture in this chat. Returns the pin, or null when full / not found. */
export function addPin(chatKey, entityKey, outfitId) {
    const e = getEntity(entityKey);
    if (!chatKey || !e?.outfits.some(o => o.id === outfitId)) return null;
    const s = settings();
    const row = s.pins[chatKey] || (s.pins[chatKey] = {});
    const list = row[entityKey] || (row[entityKey] = []);
    if (list.length >= MAX_PINS) return null;
    // Taken out of this chat before? Come back as it was (but never tucked away).
    const memo = s.pinMemo[chatKey]?.[entityKey]?.[outfitId];
    const pin = cleanPin(memo ? { ...memo, id: '', outfit: outfitId, hidden: false } : { outfit: outfitId });
    list.push(pin);
    if (memo) dropMemo(s, chatKey, entityKey, outfitId);
    save();
    return pin;
}

// Takes s instead of calling settings(): migrate() there would tidy away a pin list being filled right now.
function dropMemo(s, chatKey, entityKey, outfitId) {
    const row = s.pinMemo[chatKey];
    if (!row?.[entityKey]) return;
    delete row[entityKey][outfitId];
    if (!Object.keys(row[entityKey]).length) delete row[entityKey];
    if (!Object.keys(row).length) delete s.pinMemo[chatKey];
}

/** @param {boolean} remember keep its look, so pinning the same outfit here again brings it back (0.7.2) */
export function removePin(chatKey, entityKey, pinId, remember = false) {
    const s = settings();
    const row = s.pins[chatKey];
    if (!row?.[entityKey]) return;
    const pin = row[entityKey].find(p => p.id === pinId);
    if (remember && pin) {
        const mrow = s.pinMemo[chatKey] || (s.pinMemo[chatKey] = {});
        const map = mrow[entityKey] || (mrow[entityKey] = {});
        const { id, ...look } = structuredClone(pin);
        map[pin.outfit] = { ...look, hidden: false };
    }
    row[entityKey] = row[entityKey].filter(p => p.id !== pinId);
    if (!row[entityKey].length) delete row[entityKey];
    if (!Object.keys(row).length) delete s.pins[chatKey];
    save();
}

export function layoutsOf(entityKey) {
    return getEntity(entityKey)?.layouts || [];
}

/** Save this chat's pins as a named layout. Returns the layout, or null. */
export function saveLayout(entityKey, chatKey, name) {
    const e = getEntity(entityKey);
    const pins = pinsOf(chatKey, entityKey);
    const frame = frameOf(chatKey, entityKey);
    const stickers = stickersOf(chatKey);
    if (!e || (!pins.length && !frame && !stickers.length)) return null;
    if (!Array.isArray(e.layouts)) e.layouts = [];
    if (e.layouts.length >= MAX_LAYOUTS) return null;
    const layout = {
        id: newId(), name: String(name || '').trim().slice(0, 40), pins: structuredClone(pins),
        frame: frame ? structuredClone(frame) : null,
        stickers: structuredClone(stickers),
    };
    e.layouts.push(layout);
    save();
    return layout;
}

/**
 * Put a saved layout into this chat (replaces the pins already there, and the avatar frame / stickers if the layout has them).
 * Returns { pins: how many were placed, frame: whether the frame was set, stickers: how many (-1 = none in the layout) }.
 */
export function loadLayout(entityKey, chatKey, layoutId) {
    const e = getEntity(entityKey);
    const layout = e?.layouts?.find(l => l.id === layoutId);
    if (!layout || !chatKey) return { pins: 0, frame: false };
    const have = new Set(e.outfits.map(o => o.id));
    const list = layout.pins.filter(p => have.has(p.outfit)).slice(0, MAX_PINS)
        .map(p => ({ ...structuredClone(p), id: newId() }));
    const s = settings();
    if (list.length) {
        const row = s.pins[chatKey] || (s.pins[chatKey] = {});
        row[entityKey] = list;
    } else if (s.pins[chatKey]) {
        delete s.pins[chatKey][entityKey];
        if (!Object.keys(s.pins[chatKey]).length) delete s.pins[chatKey];
    }
    const frame = 'frame' in layout;
    if (frame) putFrame(s, chatKey, entityKey, layout.frame);
    // 0.10.0: a layout with stickers replaces the chat's stickers (your own stickers that are gone are left out).
    let stickers = -1;
    if ('stickers' in layout) {
        const mine = new Set(s.myStickers.map(m => m.id));
        const sl = layout.stickers.filter(k => k.kind === 'basic' || mine.has(k.ref)).slice(0, MAX_STICKERS)
            .map(k => ({ ...structuredClone(k), id: newId() }));
        putStickers(s, chatKey, sl);
        stickers = sl.length;
    }
    save();
    return { pins: list.length, frame, stickers };
}

// ---- Avatar frames (0.8.0): per chat, character and persona apart ----

export function frameOf(chatKey, entityKey) {
    return chatKey ? settings().frames[chatKey]?.[entityKey] || null : null;
}

export function setFrame(chatKey, entityKey, frame) {
    if (!chatKey || !entityKey) return;
    putFrame(settings(), chatKey, entityKey, frame);
    save();
}

// Takes s (see dropMemo): settings() in between would tidy away a row being filled.
function putFrame(s, chatKey, entityKey, frame) {
    const clean = cleanFrame(frame);
    if (clean) {
        (s.frames[chatKey] || (s.frames[chatKey] = {}))[entityKey] = clean;
        cleaned.add(clean);
    } else if (s.frames[chatKey]) {
        delete s.frames[chatKey][entityKey];
        if (!Object.keys(s.frames[chatKey]).length) delete s.frames[chatKey];
    }
}

export function renameLayout(entityKey, layoutId, name) {
    const l = layoutsOf(entityKey).find(x => x.id === layoutId);
    if (!l) return;
    l.name = String(name || '').trim().slice(0, 40);
    save();
}

export function deleteLayout(entityKey, layoutId) {
    const e = getEntity(entityKey);
    if (!e?.layouts) return;
    e.layouts = e.layouts.filter(l => l.id !== layoutId);
    save();
}

// ---- Stickers (0.10.0) ----
// Sticker = Stage without "on", plus { id, kind: 'basic' | 'mine', ref: basic sticker id | your sticker's id,
//   look: 'jelly' | 'cut' | 'gloss', spark }. Up to MAX_STICKERS per chat, apart from the 6 outfit pictures.

export const STICKER_KEY = '*';

function cleanSticker(k) {
    if (!k || typeof k !== 'object') return null;
    const kind = k.kind === 'mine' ? 'mine' : 'basic';
    if (typeof k.ref !== 'string' || !k.ref || (kind === 'basic' && !BASIC_IDS.includes(k.ref))) return null;
    const st = cleanStage(k);
    delete st.on;
    delete st.pose;
    return {
        id: typeof k.id === 'string' && k.id ? k.id : newId(), kind, ref: k.ref,
        look: LOOKS.includes(k.look) ? k.look : 'gloss', spark: k.spark === true, ...st,
    };
}

/** Stickers of one chat (a live array; empty if none). */
export function stickersOf(chatKey) {
    return chatKey ? settings().stickers[chatKey]?.[STICKER_KEY] || [] : [];
}

export function findSticker(chatKey, id) {
    return stickersOf(chatKey).find(k => k.id === id) || null;
}

// Takes s (see dropMemo): settings() in between would tidy away a list being filled.
function putStickers(s, chatKey, list) {
    if (list.length) {
        s.stickers[chatKey] = { [STICKER_KEY]: list };
        cleaned.add(list);
    } else delete s.stickers[chatKey];
}

/** Stick one sticker on this chat. Returns it, or null when full / unknown. */
export function addSticker(chatKey, kind, ref, look, spark) {
    if (!chatKey) return null;
    const s = settings();
    if (kind === 'mine' && !s.myStickers.some(m => m.id === ref)) return null;
    const list = s.stickers[chatKey]?.[STICKER_KEY] || [];
    if (list.length >= MAX_STICKERS) return null;
    const k = cleanSticker({ kind, ref, look, spark });
    if (!k) return null;
    putStickers(s, chatKey, [...list, k]);
    save();
    return k;
}

export function removeSticker(chatKey, id) {
    const s = settings();
    const list = s.stickers[chatKey]?.[STICKER_KEY];
    if (!list) return;
    putStickers(s, chatKey, list.filter(k => k.id !== id));
    save();
}

/** Add one of your own sticker pictures (already uploaded). */
export function addMySticker(path, name = '') {
    const s = settings();
    const m = { id: newId(), path, name: String(name || '').slice(0, 40) };
    s.myStickers = [...s.myStickers, m];
    cleaned.add(s.myStickers);
    save();
    return m;
}

/** Remove one of your own stickers from the list, every chat and every layout. Returns its file path. */
export function removeMySticker(id) {
    const s = settings();
    const m = s.myStickers.find(x => x.id === id);
    if (!m) return '';
    s.myStickers = s.myStickers.filter(x => x.id !== id);
    cleaned.add(s.myStickers);
    const gone = (k) => k.kind === 'mine' && k.ref === id;
    for (const ck of Object.keys(s.stickers)) {
        const list = s.stickers[ck]?.[STICKER_KEY] || [];
        if (list.some(gone)) putStickers(s, ck, list.filter(k => !gone(k)));
    }
    for (const e of Object.values(s.entities)) {
        for (const l of e.layouts || []) if (Array.isArray(l.stickers)) l.stickers = l.stickers.filter(k => !gone(k));
    }
    save();
    return m.path;
}

/** UI language: the user's own pick, or SillyTavern's language (Korean → ko, anything else → en). */
export function uiLang() {
    const s = settings();
    if (s.langChosen && s.lang) return s.lang;
    let loc = '';
    try { loc = String(ctx().getCurrentLocale?.() || ''); } catch { /* ignore */ }
    return /^ko/i.test(loc) ? 'ko' : 'en';
}

export function chooseLang(lang) {
    const s = settings();
    s.lang = lang;
    s.langChosen = true;
    save();
}

export function save() {
    ctx().saveSettingsDebounced();
}

export function resetAll() {
    const c = ctx();
    const lang = c.extensionSettings[MODULE]?.lang ?? 'en';
    const langChosen = !!c.extensionSettings[MODULE]?.langChosen;
    c.extensionSettings[MODULE] = structuredClone(DEFAULTS);
    c.extensionSettings[MODULE].lang = lang;
    c.extensionSettings[MODULE].langChosen = langChosen;
    save();
}

export function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const charKey = (avatar) => `char:${avatar}`;
export const personaKey = (avatar) => `persona:${avatar}`;
export const isCharKey = (k) => k.startsWith('char:');
export const avatarOfKey = (k) => k.slice(k.indexOf(':') + 1);

export function getEntity(key, create = false, name = '') {
    const s = settings();
    let e = s.entities[key];
    if (!e && create) {
        e = s.entities[key] = { name, outfits: [], drawers: [], global: null };
    }
    if (e && name && e.name !== name) e.name = name;
    return e || null;
}

export function findOutfit(key, id) {
    if (!id || id === DEFAULT_MARK) return null;
    return getEntity(key)?.outfits.find(o => o.id === id) || null;
}

export function chatKeyFor(charAvatar, chatId) {
    if (!charAvatar || !chatId) return null;
    return `${charAvatar}::${chatId}`;
}

/** Outfit chosen for this chat only (undefined = follow "all chats"). */
export function chatChoice(chatKey, entityKey) {
    if (!chatKey) return undefined;
    return settings().chats[chatKey]?.[entityKey];
}

/** The outfit that should be shown now, or null for the default look. */
export function effectiveOutfit(entityKey, chatKey) {
    const e = getEntity(entityKey);
    if (!e) return null;
    const c = chatChoice(chatKey, entityKey);
    if (c === DEFAULT_MARK) return null;
    if (c) {
        const o = findOutfit(entityKey, c);
        if (o) return o;
    }
    return findOutfit(entityKey, e.global);
}

/**
 * Outfit picked with "This chat only" (null if the chat follows "whole character" or shows the default).
 * Only these are described to the AI: a whole-character pick changes the picture only.
 */
export function chatOnlyOutfit(entityKey, chatKey) {
    const c = chatChoice(chatKey, entityKey);
    if (!c || c === DEFAULT_MARK) return null;
    return findOutfit(entityKey, c);
}

// ---- Drawers (groups of outfits; one outfit can be in several drawers) ----

export function addDrawer(entityKey, name) {
    const e = getEntity(entityKey, true);
    const d = { id: newId(), name: String(name || '').trim().slice(0, 40), kw: '' };
    e.drawers.push(d);
    return d;
}

export function renameDrawer(entityKey, drawerId, name) {
    const d = getEntity(entityKey)?.drawers.find(x => x.id === drawerId);
    if (d) d.name = String(name || '').trim().slice(0, 40);
}

export function setDrawerKeywords(entityKey, drawerId, kw) {
    const d = getEntity(entityKey)?.drawers.find(x => x.id === drawerId);
    if (d) d.kw = cleanKeywords(kw);
}

/** "suit,  tie ,," → "suit, tie" */
export function cleanKeywords(kw) {
    return splitWords(kw).join(', ').slice(0, 300);
}

export function splitWords(text) {
    return [...new Set(String(text || '').split(/[,，、\n]/).map(w => w.trim()).filter(Boolean))];
}

/** Removes the drawer only. The outfits inside stay in the wardrobe. */
export function deleteDrawer(entityKey, drawerId) {
    const e = getEntity(entityKey);
    if (!e) return;
    e.drawers = e.drawers.filter(d => d.id !== drawerId);
    for (const o of e.outfits) o.drawers = o.drawers.filter(id => id !== drawerId);
    // "Random each reply" from this drawer falls back to all outfits.
    for (const row of Object.values(settings().randoms)) {
        if (row[entityKey] === drawerId) row[entityKey] = '';
    }
}

// Tables keyed by chat, each row keyed by entity.
export const CHAT_TABLES = ['chats', 'timelines', 'tells', 'randoms', 'pins', 'pinMemo', 'frames', 'stickers'];
// What a "whole character" change resets (the "random each reply" switch stays on).
const PICK_TABLES = ['chats', 'timelines', 'tells'];

function rowOf(table, chatKey, create = false) {
    const s = settings();
    if (!s[table][chatKey] && create) s[table][chatKey] = {};
    return s[table][chatKey] || null;
}

function dropCell(table, chatKey, entityKey) {
    const s = settings();
    const row = s[table][chatKey];
    if (!row) return;
    delete row[entityKey];
    if (!Object.keys(row).length) delete s[table][chatKey];
}

/** "From now on" history of one entity in one chat, or null. */
export function timelineOf(chatKey, entityKey) {
    if (!chatKey) return null;
    const tl = settings().timelines[chatKey]?.[entityKey];
    return tl?.points?.length ? tl : null;
}

function outfitFromMark(entityKey, mark) {
    if (mark === null || mark === undefined) return findOutfit(entityKey, getEntity(entityKey)?.global);
    if (mark === DEFAULT_MARK) return null;
    return findOutfit(entityKey, mark);
}

/** The outfit a message sent at `time` (ms) shows. Without a history this is the current look. */
export function outfitAt(entityKey, chatKey, time) {
    const tl = timelineOf(chatKey, entityKey);
    if (!tl || !Number.isFinite(time)) return effectiveOutfit(entityKey, chatKey);
    let mark;
    let found = false;
    for (const p of tl.points) {
        if (p.t <= time) { mark = p.id; found = true; } else break;
    }
    return outfitFromMark(entityKey, found ? mark : tl.base);
}

/** Description the AI would get for this pick ('' if none). */
function descNow(entityKey, chatKey) {
    return chatOnlyOutfit(entityKey, chatKey)?.desc?.trim() || '';
}

/**
 * Change one entity (and its matching-set partner).
 * @param {string} entityKey
 * @param {string|null} outfitId null = default look
 * @param {'chat'|'all'} scope
 * @param {string|null} chatKey
 * @param {{ since?: boolean, now?: number }} [opts] since = keep older messages in the older outfit
 */
export function choose(entityKey, outfitId, scope, chatKey, opts = {}) {
    const now = opts.now ?? Date.now();
    setOne(entityKey, outfitId, scope, chatKey, opts.since, now);
    const o = findOutfit(entityKey, outfitId);
    if (o?.pair && findOutfit(o.pair.key, o.pair.id)) {
        setOne(o.pair.key, o.pair.id, scope, chatKey, opts.since, now);
    }
    save();
}

function setOne(entityKey, outfitId, scope, chatKey, since, now) {
    const s = settings();
    const e = getEntity(entityKey, true);
    const mark = outfitId || DEFAULT_MARK;
    if (scope === 'chat' && chatKey) {
        const before = descNow(entityKey, chatKey);
        const row = rowOf('chats', chatKey, true);
        const prev = row[entityKey]; // undefined = same as all chats
        if (since) {
            const tlRow = rowOf('timelines', chatKey, true);
            const tl = tlRow[entityKey] || (tlRow[entityKey] = { base: prev ?? null, points: [] });
            const last = tl.points[tl.points.length - 1];
            const shownNow = last ? last.id : (prev ?? null);
            if (shownNow !== mark) tl.points.push({ t: now, id: mark });
            capPoints(tl);
            if (!tl.points.length) dropCell('timelines', chatKey, entityKey);
        } else {
            // Changing the whole chat replaces its history.
            dropCell('timelines', chatKey, entityKey);
        }
        row[entityKey] = mark;
        // Tell the AI only when the description really changed.
        const after = descNow(entityKey, chatKey);
        if (!after) dropCell('tells', chatKey, entityKey);
        else if (after !== before) rowOf('tells', chatKey, true)[entityKey] = { t: now };
    } else {
        e.global = outfitId || null;
        // "Whole character" applies to every chat: drop per-chat picks, histories and tells for this entity.
        for (const table of PICK_TABLES) {
            for (const k of Object.keys(s[table])) dropCell(table, k, entityKey);
        }
    }
}

/** Old changes fold into the starting outfit so a long chat doesn't grow forever. */
function capPoints(tl) {
    while (tl.points.length > MAX_POINTS) tl.base = tl.points.shift().id;
}

/** After the history changed: the chat's "now" outfit is the last change (or the starting one). */
function syncNow(chatKey, entityKey) {
    const tl = settings().timelines[chatKey]?.[entityKey];
    const row = rowOf('chats', chatKey, true);
    if (tl?.points.length) {
        row[entityKey] = tl.points[tl.points.length - 1].id;
    } else {
        if (!tl || tl.base === null) dropCell('chats', chatKey, entityKey);
        else row[entityKey] = tl.base;
        dropCell('timelines', chatKey, entityKey);
    }
    if (!descNow(entityKey, chatKey)) dropCell('tells', chatKey, entityKey);
}

/**
 * An automatic change (keyword 'kw' or random 'rnd') from one AI reply on. Always "from now on",
 * never told to the AI and never follows the matching set (the caller decides that).
 * @param {{ t: number, mi?: number, src: 'kw'|'rnd' }} info t = when the reply was sent, mi = its message number
 */
export function autoChange(chatKey, entityKey, outfitId, info) {
    if (!chatKey || !entityKey) return;
    getEntity(entityKey, true);
    const mark = outfitId || DEFAULT_MARK;
    const row = rowOf('chats', chatKey, true);
    const tlRow = rowOf('timelines', chatKey, true);
    const tl = tlRow[entityKey] || (tlRow[entityKey] = { base: row[entityKey] ?? null, points: [] });
    const p = { t: info.t, id: mark, src: info.src };
    if (Number.isInteger(info.mi)) p.mi = info.mi;
    tl.points.push(p);
    tl.points.sort((a, b) => a.t - b.t);
    capPoints(tl);
    row[entityKey] = tl.points[tl.points.length - 1].id;
    // Automatic changes change the picture only.
    dropCell('tells', chatKey, entityKey);
}

/** Remove the automatic changes made by one reply (before a swipe picks again). */
export function dropAutoAt(chatKey, entityKey, mi, src = null) {
    const tl = timelineOf(chatKey, entityKey);
    if (!tl) return false;
    const before = tl.points.length;
    tl.points = tl.points.filter(p => !(p.src && p.mi === mi && (!src || p.src === src)));
    if (tl.points.length === before) return false;
    syncNow(chatKey, entityKey);
    return true;
}

/** "Random each reply" for one chat: drawer id ('' = all), or undefined when off. */
export function randomOf(chatKey, entityKey) {
    return chatKey ? settings().randoms[chatKey]?.[entityKey] : undefined;
}

export function setRandom(chatKey, entityKey, drawerId) {
    if (!chatKey || !entityKey) return;
    if (drawerId === null || drawerId === undefined) dropCell('randoms', chatKey, entityKey);
    else rowOf('randoms', chatKey, true)[entityKey] = drawerId;
    save();
}

/** Remove one change from a chat's history. */
export function deletePoint(chatKey, entityKey, t) {
    const tl = timelineOf(chatKey, entityKey);
    if (!tl) return;
    tl.points = tl.points.filter(p => p.t !== t);
    syncNow(chatKey, entityKey);
    save();
}

/** "Tell again": describe the current look for the next few replies. */
export function tellAgain(chatKey, entityKey, now = Date.now()) {
    if (!chatKey || !descNow(entityKey, chatKey)) return;
    rowOf('tells', chatKey, true)[entityKey] = { t: now };
    save();
}

/** "Not this time": stop describing until the next change or "tell again". */
export function muteTell(chatKey, entityKey) {
    const cell = settings().tells[chatKey]?.[entityKey];
    if (cell) { cell.muted = true; save(); }
}

export function tellOf(chatKey, entityKey) {
    return chatKey ? settings().tells[chatKey]?.[entityKey] || null : null;
}

/**
 * A branch (or checkpoint) chat starts with its parent's picks, history and tells. Done once per chat.
 * @returns {boolean} true if something was copied
 */
export function setupBranch(chatKey, parentKey) {
    const s = settings();
    if (!chatKey || !parentKey || chatKey === parentKey || s.branchDone[chatKey]) return false;
    s.branchDone[chatKey] = parentKey;
    let copied = false;
    for (const table of CHAT_TABLES) {
        if (s[table][parentKey] && !s[table][chatKey]) {
            s[table][chatKey] = structuredClone(s[table][parentKey]);
            copied = true;
        }
    }
    save();
    return copied;
}

/** Remove every reference to an outfit (chat picks, global pick, partner pairs). */
export function forgetOutfit(entityKey, outfitId) {
    const s = settings();
    const e = getEntity(entityKey);
    if (!e) return;
    const o = e.outfits.find(x => x.id === outfitId);
    if (o?.pair) unpairOne(o.pair.key, o.pair.id);
    // Pinned pictures of this outfit go too (in every chat and in saved layouts).
    for (const [ck, row] of Object.entries(s.pins)) {
        if (!Array.isArray(row[entityKey])) continue;
        row[entityKey] = row[entityKey].filter(p => p.outfit !== outfitId);
        if (!row[entityKey].length) delete row[entityKey];
        if (!Object.keys(row).length) delete s.pins[ck];
    }
    for (const l of e.layouts || []) l.pins = l.pins.filter(p => p.outfit !== outfitId);
    for (const ck of Object.keys(s.pinMemo)) dropMemo(s, ck, entityKey, outfitId);
    e.outfits = e.outfits.filter(x => x.id !== outfitId);
    if (e.global === outfitId) e.global = null;
    for (const [k, row] of Object.entries(s.chats)) {
        if (row[entityKey] === outfitId) delete row[entityKey];
        if (!Object.keys(row).length) delete s.chats[k];
    }
    for (const k of Object.keys(s.timelines)) {
        const tl = s.timelines[k][entityKey];
        if (!tl) continue;
        tl.points = tl.points.filter(p => p.id !== outfitId);
        if (tl.base === outfitId) tl.base = null;
        if (!tl.points.length) dropCell('timelines', k, entityKey);
        else if (s.chats[k]) s.chats[k][entityKey] = tl.points[tl.points.length - 1].id;
    }
    for (const k of Object.keys(s.tells)) {
        if (s.tells[k][entityKey] && !descNow(entityKey, k)) dropCell('tells', k, entityKey);
    }
}

function unpairOne(key, id) {
    const o = findOutfit(key, id);
    if (o) o.pair = null;
}

export function setPair(keyA, idA, keyB, idB) {
    const a = findOutfit(keyA, idA);
    if (!a) return;
    if (a.pair) unpairOne(a.pair.key, a.pair.id);
    if (!keyB || !idB) { a.pair = null; return; }
    const b = findOutfit(keyB, idB);
    if (!b) { a.pair = null; return; }
    if (b.pair) unpairOne(b.pair.key, b.pair.id);
    a.pair = { key: keyB, id: idB };
    b.pair = { key: keyA, id: idA };
}

export function addFile(path) {
    const s = settings();
    if (path && !s.files.includes(path)) s.files.push(path);
}

export function dropFile(path) {
    const s = settings();
    s.files = s.files.filter(p => p !== path);
}

// ---- Reacting to SillyTavern signals ----

export function onCharacterRenamed(oldAvatar, newAvatar) {
    if (!oldAvatar || !newAvatar || oldAvatar === newAvatar) return;
    const s = settings();
    const oldKey = charKey(oldAvatar), newKey = charKey(newAvatar);
    if (s.entities[oldKey] && !s.entities[newKey]) {
        s.entities[newKey] = s.entities[oldKey];
        delete s.entities[oldKey];
        // Files stay where they are; only the list is updated.
        for (const e of Object.values(s.entities)) {
            for (const o of e.outfits) {
                if (o.pair?.key === oldKey) o.pair.key = newKey;
            }
        }
    }
    for (const table of CHAT_TABLES) {
        for (const [k, row] of Object.entries(s[table])) {
            if (oldKey in row) { row[newKey] = row[oldKey]; delete row[oldKey]; }
            if (k.startsWith(oldAvatar + '::')) {
                const nk = newAvatar + k.slice(oldAvatar.length);
                if (!s[table][nk]) s[table][nk] = row;
                delete s[table][k];
            }
        }
    }
    for (const k of Object.keys(s.branchDone)) {
        if (k.startsWith(oldAvatar + '::')) {
            s.branchDone[newAvatar + k.slice(oldAvatar.length)] = s.branchDone[k];
            delete s.branchDone[k];
        }
    }
    save();
}

export function onChatRenamed(avatar, oldFile, newFile) {
    const strip = (f) => String(f || '').replace(/\.jsonl$/i, '');
    const oldKey = chatKeyFor(avatar, strip(oldFile));
    const newKey = chatKeyFor(avatar, strip(newFile));
    const s = settings();
    if (!oldKey || !newKey) return;
    // If something is already stored under the new name we can't tell which is right: keep both as they are.
    if (s.chats[newKey] || s.timelines[newKey]) return;
    let moved = false;
    for (const table of [...CHAT_TABLES, 'branchDone']) {
        if (s[table][oldKey] === undefined) continue;
        s[table][newKey] = s[table][oldKey];
        delete s[table][oldKey];
        moved = true;
    }
    if (moved) save();
}

export function onChatDeleted(avatar, chatName) {
    const key = chatKeyFor(avatar, String(chatName || '').replace(/\.jsonl$/i, ''));
    const s = settings();
    if (!key) return;
    let changed = false;
    for (const table of [...CHAT_TABLES, 'branchDone']) {
        if (s[table][key] !== undefined) { delete s[table][key]; changed = true; }
    }
    if (changed) save();
}

/** Returns the file paths that belonged to the removed entity. */
export function removeEntity(key) {
    const s = settings();
    const e = s.entities[key];
    const files = [];
    if (e) {
        for (const o of [...e.outfits]) {
            files.push(o.orig, o.sq);
            forgetOutfit(key, o.id);
        }
        delete s.entities[key];
    }
    const avatar = avatarOfKey(key);
    for (const table of CHAT_TABLES) {
        for (const [k, row] of Object.entries(s[table])) {
            delete row[key];
            if (isCharKey(key) && k.startsWith(avatar + '::')) delete s[table][k];
            else if (!Object.keys(row).length) delete s[table][k];
        }
    }
    if (isCharKey(key)) {
        for (const k of Object.keys(s.branchDone)) if (k.startsWith(avatar + '::')) delete s.branchDone[k];
    }
    save();
    return files.filter(Boolean);
}

// ---- Leftovers (0.5.0) ----

/**
 * Give everything stored for oldKey (outfits, drawers, chat choices, history) to newKey.
 * Only into a character / persona with no outfits yet, and only char → char or persona → persona.
 * Nothing already stored for newKey is overwritten.
 */
export function moveEntity(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey || isCharKey(oldKey) !== isCharKey(newKey)) return false;
    const s = settings();
    const from = s.entities[oldKey];
    const to = s.entities[newKey];
    if (!from || to?.outfits?.length) return false;
    s.entities[newKey] = from;
    delete s.entities[oldKey];
    for (const e of Object.values(s.entities)) {
        for (const o of e.outfits) if (o.pair?.key === oldKey) o.pair.key = newKey;
    }
    const oldAvatar = avatarOfKey(oldKey), newAvatar = avatarOfKey(newKey);
    for (const table of CHAT_TABLES) {
        const rows = s[table];
        for (const row of Object.values(rows)) {
            if (!(oldKey in row)) continue;
            if (!(newKey in row)) row[newKey] = row[oldKey];
            delete row[oldKey];
        }
        if (!isCharKey(oldKey)) continue;
        // A character's chats are stored under its avatar name.
        for (const k of Object.keys(rows)) {
            if (!k.startsWith(oldAvatar + '::')) continue;
            const nk = newAvatar + k.slice(oldAvatar.length);
            if (!rows[nk]) rows[nk] = rows[k];
            else for (const [ek, v] of Object.entries(rows[k])) if (!(ek in rows[nk])) rows[nk][ek] = v;
            delete rows[k];
        }
    }
    if (isCharKey(oldKey)) {
        for (const k of Object.keys(s.branchDone)) {
            if (!k.startsWith(oldAvatar + '::')) continue;
            const nk = newAvatar + k.slice(oldAvatar.length);
            if (s.branchDone[nk] === undefined) s.branchDone[nk] = s.branchDone[k];
            delete s.branchDone[k];
        }
    }
    save();
    return true;
}

/** Files Facets uploaded that no outfit uses any more. */
export function unusedFiles() {
    const s = settings();
    const used = new Set();
    for (const e of Object.values(s.entities)) {
        for (const o of e.outfits) { if (o.orig) used.add(o.orig); if (o.sq) used.add(o.sq); }
    }
    for (const m of s.myStickers) used.add(m.path); // 0.10.0: your own stickers are not "pictures nobody uses"
    for (const p of cardFilesInUse()) used.add(p); // 0.11.0: photocards and the one being made
    return s.files.filter(p => p && !used.has(p));
}

// ---- Photocards (0.11.0) ----

export function cardsOf() { return settings().cards; }
export function findCard(id) { return settings().cards.find(c => c.id === id) || null; }
export function cardDraftOf() { return settings().cardDraft; }

/** Files kept for photocards (saved ones and the one being made), optionally leaving one card out. */
export function cardFilesInUse(skipId = null, withDraft = true) {
    const s = settings();
    const used = new Set();
    for (const c of s.cards) if (c.id !== skipId) for (const p of cardFiles(c)) used.add(p);
    if (withDraft && s.cardDraft) {
        for (const p of cardFiles(s.cardDraft.card)) used.add(p);
        for (const p of s.cardDraft.uploads) used.add(p);
    }
    return used;
}

/** Other things that keep a file alive: outfits and your own stickers. */
function otherFilesInUse(s) {
    const used = new Set();
    for (const e of Object.values(s.entities)) for (const o of e.outfits) { if (o.orig) used.add(o.orig); if (o.sq) used.add(o.sq); }
    for (const m of s.myStickers) used.add(m.path);
    return used;
}

/** Keep the card being made. Pass null to forget it (files are not touched here). */
export function setCardDraft(d) {
    const s = settings();
    s.cardDraft = d ? cleanDraft(d) : null;
    if (s.cardDraft) cleaned.add(s.cardDraft);
    save();
}

/** Throw the draft away. Returns its files that nothing else uses (for the caller to delete). */
export function dropCardDraft() {
    const s = settings();
    const d = s.cardDraft;
    if (!d) return [];
    s.cardDraft = null;
    const keep = cardFilesInUse(null, false);
    const other = otherFilesInUse(s);
    save();
    return [...new Set([...cardFiles(d.card), ...d.uploads])].filter(p => !keep.has(p) && !other.has(p));
}

/**
 * Save the draft as a card (replacing its old version), then forget the draft.
 * Returns { card, gone }: gone = files of the old version / the draft that the new card no longer uses.
 */
export function commitCardDraft(out) {
    const s = settings();
    const d = s.cardDraft;
    if (!d) return null;
    const old = d.base ? s.cards.find(c => c.id === d.base) : null;
    const card = cleanCard({ ...d.card, id: old ? old.id : d.card.id, out, t: Date.now() });
    const list = old ? s.cards.map(c => (c.id === old.id ? card : c)) : [card, ...s.cards];
    s.cards = list.slice(0, MAX_CARDS);
    cleaned.add(s.cards);
    s.cardDraft = null;
    const keep = cardFilesInUse(null, false);
    const other = otherFilesInUse(s);
    const before = new Set([...(old ? cardFiles(old) : []), ...cardFiles(d.card), ...d.uploads]);
    save();
    return { card, gone: [...before].filter(p => p !== out && !keep.has(p) && !other.has(p)) };
}

/** Delete a saved card. Returns its files that nothing else uses. */
export function removeCard(id) {
    const s = settings();
    const c = s.cards.find(x => x.id === id);
    if (!c) return [];
    s.cards = s.cards.filter(x => x.id !== id);
    cleaned.add(s.cards);
    const keep = cardFilesInUse();
    const other = otherFilesInUse(s);
    save();
    return cardFiles(c).filter(p => !keep.has(p) && !other.has(p));
}

/** How many photocards (the draft counts as one) draw any of these pictures. */
export function cardsUsing(paths) {
    const want = new Set(paths.filter(Boolean));
    if (!want.size) return 0;
    const s = settings();
    const list = [...s.cards, ...(s.cardDraft ? [s.cardDraft.card] : [])];
    return list.filter(c => cardPaths(c).some(p => want.has(p))).length;
}
