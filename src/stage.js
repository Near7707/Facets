// "In the chat" pictures (0.6.0): the current outfit placed at the edge of the chat area.
// Only our own elements are added (one layer inside #sheld); SillyTavern's elements are never changed.
// Unlocked: drag to move, pinch / mouse wheel to resize, tap for a small tool bar.
// Locked: touches pass through the picture; only a small 🔒 dot stays clickable.

import { t } from './i18n.js';
import {
    settings, save, stageOf, effectiveOutfit, isCharKey, avatarOfKey, SIZE_MIN, SIZE_MAX, OPACITY_MIN,
} from './store.js';
import { urlOf } from './images.js';
import { currentScene, onApply } from './apply.js';
import { syncTheme } from './theme.js';

let layer = null;
const figures = new Map(); // entity key -> { fig, img, dot, handle, src, ar }
let toolsKey = ''; // whose tool bar is open
let gesture = null;
const pointers = new Map();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Phones and PCs keep their own place, because the chat area is a very different shape. */
export function screenKind() {
    return window.innerWidth <= 1000 ? 'narrow' : 'wide';
}

function defaultPlace(key) {
    // Character on the right, persona on the left, so the two never start on top of each other.
    return { x: isCharKey(key) ? 0.8 : 0.2, y: 0.5, size: screenKind() === 'narrow' ? 0.45 : 0.55 };
}

function placeNow(key) {
    return stageOf(key)?.place?.[screenKind()] || defaultPlace(key);
}

function setPlace(key, p) {
    const st = stageOf(key);
    if (!st) return;
    st.place[screenKind()] = {
        x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), size: clamp(p.size, SIZE_MIN, SIZE_MAX),
    };
    drawOne(key);
}

/** Back to the starting place and size (this kind of screen only). */
export function resetPlace(key) {
    const st = stageOf(key);
    if (!st) return;
    delete st.place[screenKind()];
    save();
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
    const sheld = document.getElementById('sheld');
    if (!sheld) return null;
    if (layer && sheld.contains(layer)) return layer;
    layer?.remove();
    figures.clear();
    layer = document.createElement('div');
    layer.id = 'facets_stage';
    layer.className = 'facets-stage';
    sheld.appendChild(layer);
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
    watchSizes(sheld);
    return layer;
}

/** The chat area: from the top of #chat down to the top of the input bar. Pictures are cut off there. */
function placeLayer() {
    const sheld = document.getElementById('sheld');
    if (!sheld || !layer) return false;
    const box = sheld.getBoundingClientRect();
    const chat = document.getElementById('chat')?.getBoundingClientRect();
    const form = document.getElementById('form_sheld')?.getBoundingClientRect();
    const top = chat ? Math.max(0, chat.top - box.top) : 0;
    const bottom = form ? form.top - box.top : box.height;
    layer.style.top = `${top}px`;
    layer.style.height = `${Math.max(0, bottom - top)}px`;
    return bottom - top > 40;
}

let resizeObs = null;
function watchSizes(sheld) {
    resizeObs?.disconnect();
    if (!globalThis.ResizeObserver) return;
    resizeObs = new ResizeObserver(() => applySoon());
    resizeObs.observe(sheld);
    const form = document.getElementById('form_sheld');
    if (form) resizeObs.observe(form);
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

/** Who is shown now: the open character and persona with "in the chat" on, in a one-on-one chat. */
function shownKeys() {
    const sc = currentScene();
    if (!settings().showStage || sc.inGroup || !sc.chatKey) return [];
    return [sc.charKey, sc.personaKey].filter(k => k && stageOf(k)?.on);
}

export function applyStage() {
    const keys = shownKeys();
    if (!keys.length && !layer) return;
    if (!ensureLayer()) return;
    const ok = placeLayer();
    layer.classList.toggle('facets-stage-off', !ok || keyboardOpen());
    for (const [key, f] of figures) {
        if (!keys.includes(key)) { f.fig.remove(); f.dot.remove(); f.handle.remove(); figures.delete(key); }
    }
    if (toolsKey && !keys.includes(toolsKey)) closeTools();
    for (const key of keys) drawOne(key);
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
    f = { fig, img, dot, handle, src: '', ar: 0 };
    img.addEventListener('load', () => {
        f.ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
        f.broken = false;
        drawOne(key);
    });
    img.addEventListener('error', () => { f.broken = true; drawOne(key); });
    figures.set(key, f);
    return f;
}

/** Box of one picture in the layer, by pose. Returns { left, top, w, h, rot, side }. */
function boxOf(key, st, f, W, H) {
    const p = placeNow(key);
    const ar = st.sticker ? 1 : (f.ar || 0.6);
    const h = p.size * H * (st.sticker ? 0.6 : 1);
    const w = h * ar;
    const side = p.x < 0.5 ? 'left' : 'right';
    let left = 0, top = 0, rot = 0;
    switch (st.pose) {
        case 'peek': // half outside the screen, at the left or right wall
            left = side === 'left' ? -w * 0.45 : W - w * 0.55;
            top = clamp(p.y * H - h / 2, -h * 0.3, H - h * 0.4);
            break;
        case 'lean': // at the wall, tilted a little towards it
            left = side === 'left' ? -w * 0.06 : W - w * 0.94;
            top = clamp(p.y * H - h / 2, -h * 0.3, H - h * 0.4);
            rot = side === 'left' ? -5 : 5;
            break;
        case 'pop': // only the top shows above the input bar
            left = clamp(p.x * W - w / 2, -w * 0.3, W - w * 0.7);
            top = H - h * 0.32;
            break;
        default: // 'stand': the input bar hides the lower part
            left = clamp(p.x * W - w / 2, -w * 0.3, W - w * 0.7);
            top = H - h * 0.7;
    }
    return { left, top, w, h, rot, side };
}

function drawOne(key) {
    if (!layer) return;
    const st = stageOf(key);
    if (!st) return;
    const f = entryFor(key);
    const sc = currentScene();
    const outfit = effectiveOutfit(key, sc.chatKey);
    const src = pictureUrl(key, outfit);
    if (f.src !== src) {
        f.src = src;
        f.ar = 0;
        f.img.src = src;
        f.handle.querySelector('img').src = thumbUrl(key, outfit);
    }
    const W = layer.clientWidth, H = layer.clientHeight;
    const b = boxOf(key, st, f, W, H);
    const showFig = !st.hidden && !f.broken && W > 0 && H > 0;
    f.fig.hidden = !showFig;
    f.fig.classList.toggle('is-sticker', st.sticker);
    f.fig.classList.toggle('is-locked', st.locked);
    f.fig.classList.toggle('is-flip', st.flip);
    f.fig.classList.toggle('is-active', gesture?.key === key);
    Object.assign(f.fig.style, {
        left: `${b.left}px`, top: `${b.top}px`, width: `${b.w}px`, height: `${b.h}px`,
        transform: b.rot ? `rotate(${b.rot}deg)` : '', opacity: String(st.opacity),
    });
    // Visible part of the picture (some poses are half outside).
    const vl = clamp(b.left, 0, W), vr = clamp(b.left + b.w, 0, W);
    const vt = clamp(b.top, 0, H);
    f.visible = { left: vl, right: vr, top: vt, bottom: clamp(b.top + b.h, 0, H) };
    // 🔒 dot: the only touchable spot of a locked picture.
    f.dot.hidden = !(showFig && st.locked);
    f.dot.title = t('stage_locked');
    f.dot.setAttribute('aria-label', t('stage_locked'));
    f.dot.style.left = `${clamp((b.side === 'left' ? vr - 34 : vl + 6), 4, Math.max(4, W - 34))}px`;
    f.dot.style.top = `${clamp(vt + 6, 4, Math.max(4, H - 34))}px`;
    // Hidden: a small tab at the wall brings it back.
    f.handle.hidden = !st.hidden;
    f.handle.classList.toggle('is-right', b.side === 'right');
    f.handle.title = t('stage_show');
    f.handle.setAttribute('aria-label', t('stage_show'));
    const midY = ['stand', 'pop'].includes(st.pose) ? H * 0.7 : b.top + b.h / 2;
    f.handle.style.top = `${clamp(midY - 22, 4, Math.max(4, H - 48))}px`;
    if (toolsKey === key) placeTools();
}

// ---------- tool bar ----------

function toolsEl() { return layer?.querySelector('.facets-stage-tools'); }

function closeTools() {
    toolsKey = '';
    toolsEl()?.remove();
}

function openTools(key) {
    const st = stageOf(key);
    if (!st || !layer) return;
    closeTools();
    toolsKey = key;
    syncTheme(layer);
    const bar = document.createElement('div');
    bar.className = 'facets-stage-tools';
    bar.dataset.key = key;
    bar.innerHTML = st.locked
        ? `<button type="button" class="facets-stage-btn" data-stage-act="unlock"><i class="fa-solid fa-lock-open"></i><span>${esc(t('stage_unlock'))}</span></button>
           <button type="button" class="facets-stage-btn" data-stage-act="hide"><i class="fa-solid fa-eye-slash"></i><span>${esc(t('stage_hide'))}</span></button>`
        : `<label class="facets-stage-op" title="${esc(t('stage_opacity'))}"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
             <input type="range" min="${Math.round(OPACITY_MIN * 100)}" max="100" step="1" value="${Math.round(st.opacity * 100)}" data-stage-act="opacity" aria-label="${esc(t('stage_opacity'))}"></label>
           <button type="button" class="facets-stage-btn" data-stage-act="lock"><i class="fa-solid fa-lock"></i><span>${esc(t('stage_lock'))}</span></button>
           <button type="button" class="facets-stage-btn" data-stage-act="hide"><i class="fa-solid fa-eye-slash"></i><span>${esc(t('stage_hide'))}</span></button>`;
    layer.appendChild(bar);
    placeTools();
}

function placeTools() {
    const bar = toolsEl();
    const f = figures.get(toolsKey);
    if (!bar || !f?.visible) return;
    const W = layer.clientWidth, H = layer.clientHeight;
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    const v = f.visible;
    const cx = (v.left + v.right) / 2;
    let top = v.top - bh - 8;
    if (top < 4) top = v.top + 8;
    bar.style.left = `${clamp(cx - bw / 2, 4, Math.max(4, W - bw - 4))}px`;
    bar.style.top = `${clamp(top, 4, Math.max(4, H - bh - 4))}px`;
}

function toggleTools(key) {
    if (toolsKey === key) closeTools(); else openTools(key);
}

// ---------- touch and mouse ----------

const dist = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

function onDown(e) {
    const fig = e.target.closest('.facets-fig');
    if (!fig) return;
    const key = fig.dataset.key;
    const st = stageOf(key);
    if (!st || st.locked) return;
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    try { fig.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture || gesture.key !== key) {
        gesture = { key, start: { ...placeNow(key) }, x0: e.clientX, y0: e.clientY, moved: false, t0: Date.now(), multi: false, d0: 0 };
    }
    if (pointers.size >= 2) {
        gesture.multi = true;
        gesture.start = { ...placeNow(key) };
        gesture.d0 = dist();
    }
    fig.classList.add('is-active');
}

function onMove(e) {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    const key = gesture.key;
    if (pointers.size >= 2) {
        const d = dist();
        if (gesture.d0 > 0 && d > 0) {
            gesture.moved = true;
            setPlace(key, { ...gesture.start, size: gesture.start.size * d / gesture.d0 });
        }
        return;
    }
    if (gesture.multi) return; // one finger left after a pinch: don't jump
    const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    if (!gesture.moved) closeTools();
    gesture.moved = true;
    const W = layer.clientWidth || 1, H = layer.clientHeight || 1;
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
    else if (e.type === 'pointerup' && Date.now() - g.t0 < 600) toggleTools(g.key);
}

let wheelSave = 0;
function onWheel(e) {
    const fig = e.target.closest('.facets-fig');
    if (!fig) return;
    const key = fig.dataset.key;
    const st = stageOf(key);
    if (!st || st.locked) return;
    e.preventDefault();
    const p = placeNow(key);
    setPlace(key, { ...p, size: p.size * (e.deltaY < 0 ? 1.06 : 1 / 1.06) });
    clearTimeout(wheelSave);
    wheelSave = setTimeout(save, 300);
}

function onClick(e) {
    const el = e.target.closest('[data-stage-act]');
    if (!el || el.tagName === 'INPUT') return;
    const key = el.dataset.key || toolsEl()?.dataset.key || '';
    const st = stageOf(key);
    if (!st) return;
    switch (el.dataset.stageAct) {
        case 'tools': toggleTools(key); return;
        case 'lock': st.locked = true; break;
        case 'unlock': st.locked = false; break;
        case 'hide': st.hidden = true; break;
        case 'show': st.hidden = false; break;
        default: return;
    }
    save();
    closeTools();
    drawOne(key);
    document.dispatchEvent(new CustomEvent('facets:stage'));
}

function onInput(e) {
    const el = e.target;
    if (el.dataset.stageAct !== 'opacity') return;
    const st = stageOf(toolsKey);
    if (!st) return;
    st.opacity = clamp(Number(el.value) / 100, OPACITY_MIN, 1);
    const f = figures.get(toolsKey);
    if (f) f.fig.style.opacity = String(st.opacity);
}

// A tap anywhere else closes the tool bar.
function onOutside(e) {
    if (!toolsKey || !layer) return;
    if (e.target.closest?.('.facets-stage-tools, .facets-stage-dot') || e.target.closest?.('.facets-fig')?.dataset.key === toolsKey) return;
    closeTools();
}

export function initStage() {
    onApply(applyStage);
    window.addEventListener('resize', applySoon);
    window.visualViewport?.addEventListener('resize', applySoon);
    document.addEventListener('focusin', applySoon);
    document.addEventListener('focusout', () => setTimeout(applySoon, 60));
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('facets:lang', () => { if (toolsKey) openTools(toolsKey); applySoon(); });
}

export function _stageForTest() { return { figures, layer, toolsKey }; }
