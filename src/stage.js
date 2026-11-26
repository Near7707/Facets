// "In the chat" pictures (0.6.0): the current outfit picture placed over the chat.
// 0.6.1: pinned pictures — chosen outfit pictures placed in one chat only. Each picture is a "piece".
// 0.7.0: free placement anywhere below SillyTavern's top bar (also beside the chat on a PC), and turning.
// Only our own elements are added (one fixed layer on <body>); SillyTavern's elements are never changed.
// The input bar is cut out of the layer, so pictures go behind it and it always stays visible and clickable.
// SillyTavern's top bar, side panels, wand / options menus, popups and toasts are all higher than the layer.
// Unlocked: drag to move, pinch / mouse wheel to resize, twist / Shift + wheel / handle to turn,
// tap for a small tool bar. Locked: touches pass through; only a small 🔒 dot stays clickable.

import { t } from './i18n.js';
import {
    settings, save, stageOf, effectiveOutfit, isCharKey, avatarOfKey, SIZE_MIN, SIZE_MAX, OPACITY_MIN,
    pinsOf, getEntity, removePin, normRot,
} from './store.js';
import { urlOf } from './images.js';
import { currentScene, onApply } from './apply.js';
import { syncTheme } from './theme.js';

let layer = null;
const figures = new Map(); // piece id -> { fig, img, dot, handle, src, ar, broken, visible, center }
// Piece id: the entity key for the "current outfit" picture, "<entity key>\n<pin id>" for a pinned one.
let shown = [];
let toolsKey = ''; // whose tool bar is open
let gesture = null;
const pointers = new Map();
let rotHandle = null;
let sizeHandle = null; // 0.7.1: corner handle to resize
let holes = []; // cut-out boxes in layer coordinates
let geo = null; // { L, T, W, H } of the layer in the window

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SNAP = 4; // degrees: 0 / 90 / 180 pull the turn in

/** Phones and PCs keep their own place, because the screen is a very different shape. */
export function screenKind() {
    return window.innerWidth <= 1000 ? 'narrow' : 'wide';
}

function splitPid(pid) {
    const i = String(pid).indexOf('\n');
    return i < 0 ? { ek: String(pid), pinId: '' } : { ek: pid.slice(0, i), pinId: pid.slice(i + 1) };
}

/** Settings of one piece: the entity's stage, or the pin in the open chat. */
function stOf(pid) {
    const { ek, pinId } = splitPid(pid);
    if (!pinId) return stageOf(ek);
    const chatKey = currentScene().chatKey;
    return chatKey ? pinsOf(chatKey, ek).find(p => p.id === pinId) || null : null;
}

function outfitOf(pid) {
    const { ek, pinId } = splitPid(pid);
    const chatKey = currentScene().chatKey;
    if (!pinId) return effectiveOutfit(ek, chatKey);
    const pin = stOf(pid);
    return getEntity(ek)?.outfits.find(o => o.id === pin?.outfit) || null;
}

const PIN_X = [0.5, 0.35, 0.65, 0.2, 0.8, 0.5];

function defaultPlace(pid) {
    const { ek, pinId } = splitPid(pid);
    let size = screenKind() === 'narrow' ? 0.4 : 0.5;
    let x = isCharKey(ek) ? 0.8 : 0.2; // character right, persona left: they never start on top of each other
    if (pinId) {
        // Pinned pictures start in the middle, spread a little, and a bit smaller.
        const index = Math.max(0, pinsOf(currentScene().chatKey, ek).findIndex(p => p.id === pinId));
        x = PIN_X[index % PIN_X.length];
        size *= 0.8;
    }
    // Standing just above the input bar: its lower part goes behind it.
    const formTop = holes[0] && geo?.H ? holes[0].t / geo.H : 0.88;
    return { v: 2, x, y: clamp(formTop + size * 0.2 - size / 2, size / 2 - 0.1, 1), size, rot: 0 };
}

/** Saved place for this kind of screen (only new-kind places; old ones are changed first). */
function placeNow(pid) {
    const p = stOf(pid)?.place?.[screenKind()];
    return p && p.v === 2 ? p : defaultPlace(pid);
}

function snapRot(r) {
    const n = normRot(r);
    for (const a of [-180, -90, 0, 90, 180]) if (Math.abs(n - a) <= SNAP) return normRot(a);
    return n;
}

function setPlace(pid, p) {
    const st = stOf(pid);
    if (!st) return;
    st.place[screenKind()] = {
        v: 2,
        x: clamp(p.x, -0.5, 1.5), y: clamp(p.y, -0.5, 1.5),
        size: clamp(p.size, SIZE_MIN, SIZE_MAX), rot: normRot(p.rot),
    };
    drawOne(pid);
}

/** Back to the starting place, size and turn (this kind of screen only). */
export function resetPlace(key) {
    const st = stageOf(key);
    if (!st) return;
    delete st.place[screenKind()];
    save();
}

/** Turn a piece by 90° to the next straight angle (dir 1 = right, -1 = left). Used by the Style screen too. */
export function turnPiece(pid, dir) {
    const st = stOf(pid);
    if (!st) return false;
    const p = currentPlace(pid);
    if (!p) return false;
    const r = p.rot || 0;
    const next = dir > 0 ? Math.floor(r / 90 + 1e-6) * 90 + 90 : Math.ceil(r / 90 - 1e-6) * 90 - 90;
    setPlace(pid, { ...p, rot: next });
    save();
    if (toolsKey === pid) syncTools();
    return true;
}

/** Turn of a piece now (for showing it). */
export function rotOf(pid) {
    const p = stOf(pid)?.place?.[screenKind()];
    return p ? normRot(p.rot) : 0;
}

/** The place to change: an old-kind place is changed into the new kind first (needs the layer). */
function currentPlace(pid) {
    const st = stOf(pid);
    const p = st?.place?.[screenKind()];
    if (p && p.v !== 2) {
        if (!upgradePlace(pid, st)) {
            // Not drawn yet: keep where it is roughly, only the turn changes.
            st.place[screenKind()] = { ...defaultPlace(pid), rot: normRot(p.rot) };
        }
    }
    return placeNow(pid);
}

function pictureUrl(key, outfit) {
    if (outfit) return urlOf(outfit.orig || outfit.sq);
    const avatar = encodeURIComponent(avatarOfKey(key));
    return isCharKey(key) ? `/characters/${avatar}` : `/User%20Avatars/${avatar}`;
}

function thumbUrl(key, outfit) {
    if (outfit) return urlOf(outfit.sq || outfit.orig);
    const avatar = encodeURIComponent(avatarOfKey(key));
    return `/thumbnail?type=${isCharKey(key) ? 'avatar' : 'persona'}&file=${avatar}`;
}

// ---------- layer ----------

function ensureLayer() {
    if (!document.getElementById('sheld')) return null;
    if (layer && document.body.contains(layer)) return layer;
    layer?.remove();
    figures.clear();
    layer = document.createElement('div');
    layer.id = 'facets_stage';
    layer.className = 'facets-stage';
    document.body.appendChild(layer);
    syncTheme(layer);
    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    layer.addEventListener('pointercancel', onUp);
    layer.addEventListener('lostpointercapture', onUp);
    layer.addEventListener('wheel', onWheel, { passive: false });
    layer.addEventListener('click', onClick);
    layer.addEventListener('input', onInput);
    layer.addEventListener('change', () => save());
    layer.addEventListener('contextmenu', (e) => { if (e.target.closest('.facets-fig')) e.preventDefault(); });
    watchSizes();
    return layer;
}

const visibleBox = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    return r;
};

/**
 * The picture layer: the whole window below SillyTavern's top bar.
 * The input bar is cut out with clip-path, so pictures look like they are behind it.
 */
function placeLayer() {
    if (!layer) return false;
    const sheld = document.getElementById('sheld')?.getBoundingClientRect();
    const topBar = visibleBox(document.getElementById('top-settings-holder')) || visibleBox(document.getElementById('top-bar'));
    const chat = document.getElementById('chat')?.getBoundingClientRect();
    let T = topBar ? topBar.bottom : (chat ? chat.top : sheld?.top || 0);
    T = clamp(Math.round(T), 0, window.innerHeight);
    const L = 0, W = window.innerWidth, H = Math.max(0, window.innerHeight - T);
    geo = { L, T, W, H };
    Object.assign(layer.style, { left: `${L}px`, top: `${T}px`, width: `${W}px`, height: `${H}px` });
    holes = [];
    const boxes = [visibleBox(document.getElementById('form_sheld'))];
    for (const r of boxes) {
        if (!r) continue;
        const h = { l: Math.max(0, r.left - L), t: Math.max(0, r.top - T), r: Math.min(W, r.right - L), b: Math.min(H, r.bottom - T) };
        if (h.r - h.l > 1 && h.b - h.t > 1) holes.push(h);
    }
    if (holes.length) {
        // One outline with a hole (even-odd): the outside, then the hole joined back to the corner.
        const pts = ['0 0', `${W}px 0`, `${W}px ${H}px`, `0 ${H}px`, '0 0'];
        for (const h of holes) {
            pts.push(`${h.l}px ${h.t}px`, `${h.l}px ${h.b}px`, `${h.r}px ${h.b}px`, `${h.r}px ${h.t}px`, `${h.l}px ${h.t}px`, '0 0');
        }
        layer.style.clipPath = `polygon(evenodd, ${pts.join(', ')})`;
    } else {
        layer.style.clipPath = '';
    }
    return H > 60 && W > 60;
}

let resizeObs = null;
function watchSizes() {
    resizeObs?.disconnect();
    if (!globalThis.ResizeObserver) return;
    resizeObs = new ResizeObserver(() => applySoon());
    for (const id of ['sheld', 'form_sheld', 'top-settings-holder']) {
        const el = document.getElementById(id);
        if (el) resizeObs.observe(el);
    }
}

/** A phone keyboard is open for the chat input. */
function keyboardOpen() {
    if (!settings().stageKbHide) return false;
    const el = document.activeElement;
    if (!el || !/^(TEXTAREA|INPUT)$/.test(el.tagName) || el.closest('.facets-root, .facets-stage')) return false;
    const vv = window.visualViewport;
    return !!vv && vv.height < window.innerHeight * 0.8;
}

// ---------- drawing ----------

/**
 * What is shown now, in a one-on-one chat: the open character's and persona's "current outfit" picture
 * (if turned on) and the pictures pinned in this chat.
 */
function shownKeys() {
    const sc = currentScene();
    if (!settings().showStage || sc.inGroup || !sc.chatKey) return [];
    const out = [];
    for (const ek of [sc.charKey, sc.personaKey]) {
        if (!ek) continue;
        if (stageOf(ek)?.on) out.push(ek);
        for (const pin of pinsOf(sc.chatKey, ek)) out.push(`${ek}\n${pin.id}`);
    }
    return out;
}

export function applyStage() {
    shown = shownKeys();
    if (!shown.length && !layer) return;
    if (!ensureLayer()) return;
    const ok = placeLayer();
    layer.classList.toggle('facets-stage-off', !ok || keyboardOpen() || !shown.length);
    for (const [key, f] of figures) {
        if (!shown.includes(key)) { f.fig.remove(); f.dot.remove(); f.handle.remove(); figures.delete(key); }
    }
    if (toolsKey && !shown.includes(toolsKey)) closeTools();
    for (const key of shown) drawOne(key);
}

let raf = 0;
function applySoon() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; try { applyStage(); } catch (e) { console.error('[Facets]', e); } });
}

function entryFor(key) {
    let f = figures.get(key);
    if (f) return f;
    const fig = document.createElement('div');
    fig.className = 'facets-fig';
    fig.dataset.key = key;
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    fig.appendChild(img);
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'facets-stage-dot';
    dot.dataset.stageAct = 'tools';
    dot.dataset.key = key;
    dot.innerHTML = '<i class="fa-solid fa-lock"></i>';
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'facets-stage-handle';
    handle.dataset.stageAct = 'show';
    handle.dataset.key = key;
    handle.innerHTML = '<img alt="" draggable="false">';
    layer.append(fig, dot, handle);
    f = { fig, img, dot, handle, src: '', ar: 0, broken: false };
    img.addEventListener('load', () => {
        f.ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
        f.broken = false;
        drawOne(key);
    });
    img.addEventListener('error', () => { f.broken = true; drawOne(key); });
    figures.set(key, f);
    return f;
}

/** Width and height of a picture for a place. */
function sizeOf(p, st, f, H) {
    const ar = st.sticker ? 1 : (f?.ar || 0.6);
    const h = p.size * H * (st.sticker ? 0.6 : 1);
    return { w: h * ar, h };
}

/**
 * Change an old (0.6.x) place into the new kind, so the picture stays about where it was.
 * Old places were parts of the chat area (top of #chat to the input bar, #sheld wide) and the pose decided
 * the spot. Needs the picture's shape, so it waits until the picture has loaded.
 */
function upgradePlace(pid, st) {
    const kind = screenKind();
    const p = st?.place?.[kind];
    if (!p || p.v === 2) return true;
    const f = figures.get(pid);
    if (!st.sticker && !f?.ar && !f?.broken) return false;
    if (!geo) return false;
    const sheld = document.getElementById('sheld')?.getBoundingClientRect();
    const chat = document.getElementById('chat')?.getBoundingClientRect();
    const form = document.getElementById('form_sheld')?.getBoundingClientRect();
    if (!sheld) return false;
    const oL = sheld.left, oW = sheld.width;
    const oT = chat ? Math.max(sheld.top, chat.top) : sheld.top;
    const oH = Math.max(1, (form ? form.top : sheld.bottom) - oT);
    const { w, h } = sizeOf(p, st, f, oH);
    const side = p.x < 0.5 ? 'left' : 'right';
    let left, top, rot = 0;
    switch (st.pose) {
        case 'peek':
            left = side === 'left' ? -w * 0.45 : oW - w * 0.55;
            top = clamp(p.y * oH - h / 2, -h * 0.3, oH - h * 0.4);
            break;
        case 'lean':
            left = side === 'left' ? -w * 0.06 : oW - w * 0.94;
            top = clamp(p.y * oH - h / 2, -h * 0.3, oH - h * 0.4);
            rot = side === 'left' ? -5 : 5;
            break;
        case 'pop':
            left = clamp(p.x * oW - w / 2, -w * 0.3, oW - w * 0.7);
            top = oH - h * 0.32;
            break;
        default:
            left = clamp(p.x * oW - w / 2, -w * 0.3, oW - w * 0.7);
            top = oH - h * 0.7;
    }
    const cx = oL + left + w / 2, cy = oT + top + h / 2;
    st.place[kind] = {
        v: 2,
        x: clamp((cx - geo.L) / geo.W, -0.5, 1.5),
        y: clamp((cy - geo.T) / geo.H, -0.5, 1.5),
        size: clamp(p.size * oH / geo.H, SIZE_MIN, SIZE_MAX),
        rot: normRot(rot + (p.rot || 0)),
    };
    saveSoon();
    return true;
}

let saveTimer = 0;
function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
}

/** Box of one picture in the layer. At least 40% of it stays on the screen. */
function boxOf(key, st, f, W, H) {
    const p = placeNow(key);
    const { w, h } = sizeOf(p, st, f, H);
    const cx = clamp(p.x * W, -w * 0.1, W + w * 0.1);
    const cy = clamp(p.y * H, -h * 0.1, H + h * 0.1);
    const rot = normRot(p.rot);
    // Box around the turned picture.
    const a = rot * Math.PI / 180;
    const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
    const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    return { left: cx - w / 2, top: cy - h / 2, w, h, cx, cy, rot, bw, bh };
}

function drawOne(key) {
    if (!layer || !shown.includes(key)) return;
    const st = stOf(key);
    if (!st) return;
    const { ek, pinId } = splitPid(key);
    const outfit = outfitOf(key);
    if (pinId && !outfit) return; // the outfit was deleted
    const f = entryFor(key);
    const src = pictureUrl(ek, outfit);
    if (f.src !== src) {
        f.src = src;
        f.ar = 0;
        f.img.src = src;
        f.handle.querySelector('img').src = thumbUrl(ek, outfit);
    }
    const W = geo?.W || layer.clientWidth, H = geo?.H || layer.clientHeight;
    const ready = upgradePlace(key, st);
    const b = boxOf(key, st, f, W, H);
    const showFig = ready && !st.hidden && !f.broken && W > 0 && H > 0;
    f.fig.hidden = !showFig;
    f.fig.classList.toggle('is-sticker', st.sticker);
    f.fig.classList.toggle('is-locked', st.locked);
    f.fig.classList.toggle('is-flip', st.flip);
    f.fig.classList.toggle('is-active', gesture?.key === key);
    Object.assign(f.fig.style, {
        left: `${b.left}px`, top: `${b.top}px`, width: `${b.w}px`, height: `${b.h}px`,
        transform: b.rot ? `rotate(${b.rot}deg)` : '', opacity: String(st.opacity),
    });
    f.center = { x: b.cx, y: b.cy, w: b.w, h: b.h, rot: b.rot };
    // Visible part of the box around the picture.
    const vl = clamp(b.cx - b.bw / 2, 0, W), vr = clamp(b.cx + b.bw / 2, 0, W);
    const vt = clamp(b.cy - b.bh / 2, 0, H), vb = clamp(b.cy + b.bh / 2, 0, H);
    f.visible = { left: vl, right: vr, top: vt, bottom: vb };
    const side = b.cx < W / 2 ? 'left' : 'right';
    // 🔒 dot: the only touchable spot of a locked picture.
    f.dot.hidden = !(showFig && st.locked);
    f.dot.title = t('stage_locked');
    f.dot.setAttribute('aria-label', t('stage_locked'));
    f.dot.style.left = `${clamp((side === 'left' ? vr - 34 : vl + 6), 4, Math.max(4, W - 34))}px`;
    f.dot.style.top = `${clamp(vt + 6, 4, Math.max(4, H - 34))}px`;
    // Hidden: a small tab at the nearer wall brings it back.
    f.handle.hidden = !st.hidden;
    f.handle.classList.toggle('is-right', side === 'right');
    f.handle.title = t('stage_show');
    f.handle.setAttribute('aria-label', t('stage_show'));
    const hb = holes[0];
    f.handle.style.top = `${clamp(b.cy - 22, 4, Math.max(4, (hb ? hb.t : H) - 48))}px`;
    if (toolsKey === key) placeTools();
}

// ---------- tool bar ----------

function toolsEl() { return layer?.querySelector('.facets-stage-tools'); }

function closeTools() {
    toolsKey = '';
    toolsEl()?.remove();
    rotHandle?.remove();
    rotHandle = null;
    sizeHandle?.remove();
    sizeHandle = null;
}

const deg = (r) => `${Math.round(normRot(r))}°`;
// 0.7.2: the tool bar's second row is icon buttons only (the name shows on mouse over).
const ico = (act, icon, label) => `<button type="button" class="facets-stage-btn facets-stage-ico" data-stage-act="${act}" title="${esc(label)}" aria-label="${esc(label)}"><i class="fa-solid ${icon}"></i></button>`;

function openTools(key) {
    const st = stOf(key);
    if (!st || !layer) return;
    closeTools();
    toolsKey = key;
    syncTheme(layer);
    const bar = document.createElement('div');
    bar.className = st.locked ? 'facets-stage-tools is-locked' : 'facets-stage-tools';
    bar.dataset.key = key;
    const rot = placeNow(key).rot || 0;
    bar.innerHTML = st.locked
        ? `<button type="button" class="facets-stage-btn" data-stage-act="unlock"><i class="fa-solid fa-lock-open"></i><span>${esc(t('stage_unlock'))}</span></button>
           <button type="button" class="facets-stage-btn" data-stage-act="hide"><i class="fa-solid fa-arrow-right-to-bracket"></i><span>${esc(t('stage_hide'))}</span></button>`
        : `<label class="facets-stage-op" title="${esc(t('stage_opacity'))}"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
             <input type="range" min="${Math.round(OPACITY_MIN * 100)}" max="100" step="1" value="${Math.round(st.opacity * 100)}" data-stage-act="opacity" aria-label="${esc(t('stage_opacity'))}"></label>
           <div class="facets-stage-row2">
             ${ico('rot-left', 'fa-rotate-left', t('stage_rot_left'))}${ico('rot-right', 'fa-rotate-right', t('stage_rot_right'))}
             <span class="facets-stage-sep" aria-hidden="true"></span>
             ${ico('lock', 'fa-lock', t('stage_lock'))}${ico('hide', 'fa-arrow-right-to-bracket', t('stage_hide'))}${ico('remove', 'fa-xmark', `${t('stage_remove')} · ${t(splitPid(key).pinId ? 'stage_remove_pin' : 'stage_remove_main')}`)}
           </div>`;
    layer.appendChild(bar);
    if (!st.locked) {
        rotHandle = document.createElement('button');
        rotHandle.type = 'button';
        rotHandle.className = 'facets-stage-rot';
        rotHandle.dataset.key = key;
        rotHandle.title = t('stage_rot_drag');
        rotHandle.setAttribute('aria-label', t('stage_rot_drag'));
        rotHandle.innerHTML = '<i class="fa-solid fa-rotate"></i>';
        layer.appendChild(rotHandle);
        sizeHandle = document.createElement('button');
        sizeHandle.type = 'button';
        sizeHandle.className = 'facets-stage-size';
        sizeHandle.dataset.key = key;
        sizeHandle.title = t('stage_size_drag');
        sizeHandle.setAttribute('aria-label', t('stage_size_drag'));
        sizeHandle.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
        layer.appendChild(sizeHandle);
    }
    placeTools();
}

/** Show the current turn in the open tool bar. */
function syncTools() {
    const bar = toolsEl();
    if (!bar) return;
    const rot = placeNow(toolsKey).rot || 0;
    const range = bar.querySelector('[data-stage-act="rot"]');
    if (range && document.activeElement !== range) range.value = String(Math.round(rot));
    const label = bar.querySelector('.facets-stage-deg');
    if (label) label.textContent = deg(rot);
}

function placeTools() {
    const bar = toolsEl();
    const f = figures.get(toolsKey);
    if (!bar || !f?.visible || !geo) return;
    const { W, H } = geo;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    const v = f.visible;
    const cx = (v.left + v.right) / 2;
    const left = clamp(cx - bw / 2, 4, Math.max(4, W - bw - 4));
    let top = v.top - bh - 8 - (rotHandle ? 40 : 0);
    if (top < 4) top = Math.min(v.bottom + 8 + (sizeHandle ? 20 : 0), H - bh - 4);
    if (top < 4) top = 4;
    // Never under the input bar.
    for (const h of holes) {
        if (left < h.r && left + bw > h.l && top < h.b && top + bh > h.t) top = Math.max(4, h.t - bh - 6);
    }
    bar.style.left = `${left}px`;
    bar.style.top = `${clamp(top, 4, Math.max(4, H - bh - 4))}px`;
    syncTools();
    if (rotHandle && f.center) {
        // Above the top of the picture, turned with it.
        const a = f.center.rot * Math.PI / 180;
        const d = f.center.h / 2 + 24;
        const x = f.center.x + Math.sin(a) * d, y = f.center.y - Math.cos(a) * d;
        rotHandle.style.left = `${clamp(x - 17, 2, W - 36)}px`;
        rotHandle.style.top = `${clamp(y - 17, 2, H - 36)}px`;
        rotHandle.hidden = !!f.fig.hidden;
    }
    if (sizeHandle && f.center) {
        // On the bottom right corner of the picture, turned with it.
        const c = f.center, a = c.rot * Math.PI / 180;
        const hw = c.w / 2, hh = c.h / 2;
        let x = c.x + hw * Math.cos(a) - hh * Math.sin(a);
        let y = c.y + hw * Math.sin(a) + hh * Math.cos(a);
        x = clamp(x, 19, W - 19);
        y = clamp(y, 19, H - 19);
        // Not behind the input bar: sit just above it.
        for (const h of holes) {
            if (x + 17 > h.l && x - 17 < h.r && y + 17 > h.t && y - 17 < h.b) y = Math.max(19, h.t - 19);
        }
        sizeHandle.style.left = `${x - 17}px`;
        sizeHandle.style.top = `${y - 17}px`;
        // Arrow and mouse cursor follow the corner's direction.
        sizeHandle.querySelector('i').style.transform = `rotate(${90 + c.rot}deg)`;
        const d = ((45 + c.rot) % 180 + 180) % 180;
        sizeHandle.style.cursor = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(d / 45) % 4];
        sizeHandle.hidden = !!f.fig.hidden;
    }
}

function toggleTools(key) {
    if (toolsKey === key) closeTools(); else openTools(key);
}

// ---------- touch and mouse ----------

const two = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI } : null;
};

/** Angle from the picture's middle to a point on the screen, 0 = straight up. */
function angleTo(key, x, y) {
    const c = figures.get(key)?.center;
    if (!c || !geo) return 0;
    return Math.atan2(x - geo.L - c.x, -(y - geo.T - c.y)) * 180 / Math.PI;
}

/** Distance from the picture's middle to a point on the screen. */
function distTo(key, x, y) {
    const c = figures.get(key)?.center;
    if (!c || !geo) return 0;
    return Math.hypot(x - geo.L - c.x, y - geo.T - c.y);
}

function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    const rot = e.target.closest('.facets-stage-rot');
    if (rot) {
        const key = rot.dataset.key;
        const st = stOf(key);
        if (!st || st.locked) return;
        e.preventDefault();
        try { rot.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const start = { ...currentPlace(key) };
        pointers.clear();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        gesture = { key, kind: 'rot', start, a0: angleTo(key, e.clientX, e.clientY), moved: false, t0: Date.now() };
        return;
    }
    const sz = e.target.closest('.facets-stage-size');
    if (sz) {
        const key = sz.dataset.key;
        const st = stOf(key);
        if (!st || st.locked) return;
        e.preventDefault();
        try { sz.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        const start = { ...currentPlace(key) };
        pointers.clear();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        gesture = { key, kind: 'size', start, d0: distTo(key, e.clientX, e.clientY), moved: false, t0: Date.now() };
        return;
    }
    const fig = e.target.closest('.facets-fig');
    if (!fig) return;
    const key = fig.dataset.key;
    const st = stOf(key);
    if (!st || st.locked) return;
    e.preventDefault();
    try { fig.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (gesture && gesture.key !== key) { pointers.clear(); gesture = null; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) {
        gesture = { key, kind: 'move', start: { ...currentPlace(key) }, x0: e.clientX, y0: e.clientY, moved: false, t0: Date.now(), multi: false };
    }
    if (pointers.size >= 2) {
        const tw = two();
        gesture.multi = true;
        gesture.start = { ...placeNow(key) };
        gesture.d0 = tw?.d || 0;
        gesture.a0 = tw?.ang || 0;
    }
    fig.classList.add('is-active');
}

function onMove(e) {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    const key = gesture.key;
    if (gesture.kind === 'rot') {
        const a = angleTo(key, e.clientX, e.clientY);
        gesture.moved = true;
        setPlace(key, { ...gesture.start, rot: snapRot(gesture.start.rot + a - gesture.a0) });
        return;
    }
    if (gesture.kind === 'size') {
        // The middle stays put; farther from it = bigger.
        const d = distTo(key, e.clientX, e.clientY);
        if (gesture.d0 > 4 && d > 0) {
            gesture.moved = true;
            setPlace(key, { ...gesture.start, size: gesture.start.size * d / gesture.d0 });
        }
        return;
    }
    if (pointers.size >= 2) {
        const tw = two();
        if (gesture.d0 > 0 && tw?.d > 0) {
            gesture.moved = true;
            setPlace(key, {
                ...gesture.start,
                size: gesture.start.size * tw.d / gesture.d0,
                rot: snapRot(gesture.start.rot + tw.ang - gesture.a0),
            });
        }
        return;
    }
    if (gesture.multi) return; // one finger left after a pinch: don't jump
    const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    if (!gesture.moved) closeTools();
    gesture.moved = true;
    const W = geo?.W || 1, H = geo?.H || 1;
    setPlace(key, { ...gesture.start, x: gesture.start.x + dx / W, y: gesture.start.y + dy / H });
}

function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    const g = gesture;
    gesture = null;
    if (!g) return;
    figures.get(g.key)?.fig.classList.remove('is-active');
    if (g.moved) save();
    else if (g.kind === 'move' && e.type === 'pointerup' && Date.now() - g.t0 < 600) toggleTools(g.key);
}

// A finger that left without "up" (switching apps, a system gesture) must not keep a picture stuck.
function dropAll() {
    if (!gesture) { pointers.clear(); return; }
    const g = gesture;
    gesture = null;
    pointers.clear();
    figures.get(g.key)?.fig.classList.remove('is-active');
    if (g.moved) save();
}

function onWheel(e) {
    const fig = e.target.closest('.facets-fig, .facets-stage-rot, .facets-stage-size');
    if (!fig) return;
    const key = fig.dataset.key;
    const st = stOf(key);
    if (!st || st.locked) return;
    e.preventDefault();
    const p = currentPlace(key);
    // Shift + wheel turns (some browsers send Shift + wheel sideways).
    const delta = e.deltaY || e.deltaX;
    if (e.shiftKey || fig.classList.contains('facets-stage-rot')) {
        setPlace(key, { ...p, rot: snapRot(p.rot + (delta > 0 ? 5 : -5)) });
        if (toolsKey === key) syncTools();
    } else {
        setPlace(key, { ...p, size: p.size * (delta < 0 ? 1.06 : 1 / 1.06) });
    }
    saveSoon();
}

function onClick(e) {
    const el = e.target.closest('[data-stage-act]');
    if (!el || el.tagName === 'INPUT') return;
    const key = el.dataset.key || toolsEl()?.dataset.key || '';
    const st = stOf(key);
    if (!st) return;
    switch (el.dataset.stageAct) {
        case 'tools': toggleTools(key); return;
        case 'lock': st.locked = true; break;
        case 'unlock': st.locked = false; break;
        case 'hide': st.hidden = true; break;
        case 'show': st.hidden = false; break;
        case 'rot-left': case 'rot-right': {
            // Keep the bar open to keep turning.
            turnPiece(key, el.dataset.stageAct === 'rot-right' ? 1 : -1);
            document.dispatchEvent(new CustomEvent('facets:stage'));
            return;
        }
        case 'remove': {
            const { ek, pinId } = splitPid(key);
            closeTools();
            if (pinId) removePin(currentScene().chatKey, ek, pinId, true);
            else { st.on = false; save(); }
            applyStage();
            document.dispatchEvent(new CustomEvent('facets:stage'));
            return;
        }
        default: return;
    }
    save();
    closeTools();
    drawOne(key);
    document.dispatchEvent(new CustomEvent('facets:stage'));
}

function onInput(e) {
    const el = e.target;
    const st = stOf(toolsKey);
    if (!st) return;
    if (el.dataset.stageAct === 'opacity') {
        st.opacity = clamp(Number(el.value) / 100, OPACITY_MIN, 1);
        const f = figures.get(toolsKey);
        if (f) f.fig.style.opacity = String(st.opacity);
    } else if (el.dataset.stageAct === 'rot') {
        const p = currentPlace(toolsKey);
        setPlace(toolsKey, { ...p, rot: snapRot(Number(el.value)) });
        const label = toolsEl()?.querySelector('.facets-stage-deg');
        if (label) label.textContent = deg(placeNow(toolsKey).rot);
    }
}

// A tap anywhere else closes the tool bar.
function onOutside(e) {
    if (!toolsKey || !layer) return;
    if (e.target.closest?.('.facets-stage-tools, .facets-stage-dot, .facets-stage-rot, .facets-stage-size') || e.target.closest?.('.facets-fig')?.dataset.key === toolsKey) return;
    closeTools();
}

export function initStage() {
    onApply(applyStage);
    window.addEventListener('resize', applySoon);
    window.visualViewport?.addEventListener('resize', applySoon);
    document.addEventListener('focusin', applySoon);
    document.addEventListener('focusout', () => setTimeout(applySoon, 60));
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', dropAll);
    window.addEventListener('pagehide', dropAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) dropAll(); });
    document.addEventListener('facets:lang', () => { if (toolsKey) openTools(toolsKey); applySoon(); });
}

export function _stageForTest() { return { figures, layer, toolsKey, holes, geo }; }
