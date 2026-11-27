// The wardrobe window: ① wardrobe ② organize ③ edit one outfit ④ settings, plus crop and pair pickers.
// 0.8.0: the Photo Booth (its own look): home, decorate the chat, picture borders and avatar frames.

import { t, LANGUAGES, setLanguage, getLanguage } from './i18n.js';
import {
    ctx, settings, save, chooseLang, getEntity, findOutfit, choose, chatChoice, effectiveOutfit,
    forgetOutfit, setPair, newId, charKey, personaKey, isCharKey, avatarOfKey, DEFAULT_MARK,
    addDrawer, renameDrawer, deleteDrawer, timelineOf, deletePoint, tellAgain, muteTell,
    setDrawerKeywords, cleanKeywords, randomOf, setRandom, DEFAULT_IGNORE,
    removeEntity, moveEntity, unusedFiles, stageOf,
    pinsOf, addPin, removePin, layoutsOf, saveLayout, loadLayout, renameLayout, deleteLayout, MAX_PINS, MAX_LAYOUTS,
    frameOf, setFrame, THEMES,
    stickersOf, addSticker, removeSticker, addMySticker, removeMySticker, STICKER_KEY,
} from './store.js';
import { resetPlace, screenKind, turnPiece, rotOf, pieceInfo, redrawPiece, stickerSrc, paintSticker } from './stage.js';
import { BASIC_IDS, LOOKS, MAX_STICKERS, basicUrl } from './stickers.js';
import {
    PATTERNS, SHAPES, WIDTHS, COLORS, FIXED_COLOR, FRAME_KINDS, FRAME_FIXED_COLOR, FRAME_BLINK,
    cleanDeco, cleanColor, patternBg, paintPiece, isCutShape, frameCss, coverBox, ZOOM_MAX,
} from './deco.js';
import { rollDice } from './auto.js';
import {
    urlOf, folderFor, readAsDataURL, loadImage, uploadDataURL, deletePath, autoCrop, renderCrop,
    avatarAspect, avatarStyle, coverScale,
} from './images.js';
import { currentScene, personaName, applyAllSoon, currentPersonaAvatar, tellStatus } from './apply.js';
import { exportBackup, importBackup, cleanupAll } from './backup.js';
import { syncTheme } from './theme.js';
import { startViewport, stopViewport } from './viewport.js';

let VERSION = '';
export function setVersion(v) { VERSION = v; }

const state = {
    open: false,
    screen: 'wardrobe', // wardrobe | organize | edit | crop | settings | pair | drawers | history | leftovers | move
    //                     Photo Booth (0.8.0): booth | room | border | frame
    tab: 'char',
    drawer: '', // drawer tab shown in the wardrobe ('' = all)
    fromSettings: false,
    scope: 'chat',
    pick: { char: '', persona: '' }, // chosen entity when opened from settings
    editId: null,
    draft: null,
    crop: null,
    busy: false,
    pairTarget: '',
    histMore: false,
    moveFrom: '', // leftover being moved
    roomFrom: 'booth', // where "Decorate the chat" was opened from (back goes there)
    roomTab: 'outfits', // outfits | stickers
    borderPid: '', // piece whose border is being edited
    frameColor: COLORS[1], // colour picked before a frame is chosen
    stickerEdit: false, // 0.10.0: [Organize] on My stickers (shows 🗑)
    settingsFrom: 'wardrobe', // 0.9.2: ⚙ can be opened from the Photo Booth too
    dark: true, // 0.9.0: SillyTavern's theme is dark (Facets' own look follows it)
};

const BOOTH_SCREENS = new Set(['booth', 'room', 'border', 'frame']);

const HISTORY_PAGE = 50;

let root = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (kind, msg) => { try { globalThis.toastr?.[kind]?.(msg, t('ext_name')); } catch { /* ignore */ } };

// ---------- which character / persona is being shown ----------

function allCharacters() {
    return (ctx().characters || []).filter(c => c?.avatar && c.avatar !== 'none');
}
function allPersonas() {
    const p = ctx().powerUserSettings?.personas || {};
    return Object.keys(p).map(avatar => ({ avatar, name: p[avatar] || avatar }));
}

function chatAvailable() {
    const sc = currentScene();
    return !state.fromSettings && !!sc.chatKey;
}

function activeKey() {
    const sc = currentScene();
    if (state.tab === 'char') {
        if (!state.fromSettings) return sc.charKey;
        const list = allCharacters();
        if (!list.some(c => charKey(c.avatar) === state.pick.char)) {
            state.pick.char = sc.charKey && list.some(c => charKey(c.avatar) === sc.charKey) ? sc.charKey
                : (list[0] ? charKey(list[0].avatar) : '');
        }
        return state.pick.char || null;
    }
    if (!state.fromSettings) return sc.personaKey;
    const list = allPersonas();
    if (!list.some(p => personaKey(p.avatar) === state.pick.persona)) {
        state.pick.persona = sc.personaKey && list.some(p => personaKey(p.avatar) === sc.personaKey) ? sc.personaKey
            : (list[0] ? personaKey(list[0].avatar) : '');
    }
    return state.pick.persona || null;
}

function displayName(key) {
    if (!key) return '';
    const avatar = avatarOfKey(key);
    if (isCharKey(key)) return allCharacters().find(c => c.avatar === avatar)?.name || getEntity(key)?.name || avatar;
    return personaName(avatar);
}

function defaultThumb(key) {
    const avatar = avatarOfKey(key);
    return `/thumbnail?type=${isCharKey(key) ? 'avatar' : 'persona'}&file=${encodeURIComponent(avatar)}`;
}

function entityFor(key) {
    return getEntity(key, true, displayName(key));
}

function scopeNow() {
    return chatAvailable() ? state.scope : 'all';
}

function drawerLabel(d, i) {
    return d?.name?.trim() || t('drawer_n', { n: i + 1 });
}

/** The drawer tab in use, or '' if it no longer exists. */
function currentDrawer(e) {
    if (state.drawer && !e.drawers.some(d => d.id === state.drawer)) state.drawer = '';
    return state.drawer;
}

function timeLabel(ms) {
    try {
        const d = new Date(ms);
        const today = d.toDateString() === new Date().toDateString();
        return d.toLocaleString(getLanguage() === 'ko' ? 'ko-KR' : 'en-US', today
            ? { hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return new Date(ms).toISOString(); }
}

/** Name of what a stored mark shows: outfit id, DEFAULT_MARK, or null (= same as all chats). */
function markLabel(key, mark) {
    const e = getEntity(key);
    if (mark === null || mark === undefined) return t('status_follow');
    if (mark === DEFAULT_MARK) return t('default_look');
    const o = findOutfit(key, mark);
    return o ? outfitLabel(o, e.outfits.indexOf(o)) : t('default_look');
}

function outfitLabel(o, i) {
    return o?.name?.trim() || t('outfit_n', { n: i + 1 });
}

// ---------- automatic changes ----------

/** After a keyword change: a short notice; tapping it undoes the change. Random picks stay quiet. */
export function notifyAuto(changes) {
    const kw = changes.filter(c => c.src === 'kw');
    if (!kw.length) return;
    const chatKey = currentScene().chatKey;
    const names = kw.map(c => {
        const e = getEntity(c.key);
        const o = findOutfit(c.key, c.id);
        return `${displayName(c.key)}: ${o ? outfitLabel(o, e.outfits.indexOf(o)) : t('default_look')}`;
    }).join(', ');
    const undo = () => {
        for (const c of kw) deletePoint(chatKey, c.key, c.t);
        applyAllSoon();
        refreshIfOpen();
        toast('info', t('kw_undone'));
    };
    try {
        globalThis.toastr?.info?.(t('kw_toast', { names }), t('ext_name'), { onclick: undo, timeOut: 8000, extendedTimeOut: 4000 });
    } catch { /* ignore */ }
}

// ---------- open / close ----------

export function openWardrobe({ fromSettings = false } = {}) {
    ensureRoot();
    state.open = true;
    state.fromSettings = fromSettings;
    state.screen = 'wardrobe';
    state.editId = null;
    state.draft = null;
    state.drawer = '';
    state.stickerEdit = false;
    if (!chatAvailable()) state.scope = 'all';
    else state.scope = 'chat';
    root.hidden = false;
    document.documentElement.classList.add('facets-open');
    state.dark = syncTheme(root);
    startViewport(root);
    render();
}

export function closeWardrobe() {
    if (!root) return;
    state.open = false;
    root.hidden = true;
    document.documentElement.classList.remove('facets-open');
    stopViewport();
    endDrag();
}

export function isOpen() { return state.open; }

/** Close, but first keep any pictures still waiting to be cropped (automatic crop). */
export async function requestClose() {
    if (state.busy) { toast('info', t('busy')); return; }
    if (state.crop?.mode === 'add') await finishQueueAuto();
    closeWardrobe();
}

/** Redraw whatever screen is open (used after a language change from outside). */
export function rerender() {
    if (state.open && !state.busy && state.screen !== 'crop') render();
}

export function refreshIfOpen() {
    if (state.open && !state.busy && ['wardrobe', 'organize'].includes(state.screen)) render();
}

function ensureRoot() {
    if (root && document.body.contains(root)) return;
    root = document.createElement('div');
    root.id = 'facets_root';
    root.className = 'facets-root';
    root.hidden = true;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); back(); }
    });
}

function back() {
    if (root.querySelector('.facets-full')) { root.querySelector('.facets-full').remove(); return; }
    switch (state.screen) {
        case 'edit': state.screen = 'organize'; state.draft = null; break;
        case 'crop':
            if (state.crop?.mode === 'add') { finishQueueAuto().then(render); return; }
            state.screen = state.crop?.mode === 'add' ? 'organize' : 'edit'; state.crop = null; break;
        case 'pair': state.screen = 'edit'; break;
        case 'drawers': state.screen = 'organize'; break;
        case 'history': state.screen = 'wardrobe'; state.histMore = false; break;
        case 'leftovers': state.screen = 'wardrobe'; break;
        case 'move': state.screen = 'leftovers'; state.moveFrom = ''; break;
        case 'settings': state.screen = state.settingsFrom === 'booth' ? 'booth' : 'wardrobe'; break;
        case 'organize': case 'booth': state.screen = 'wardrobe'; break;
        case 'room': state.screen = state.roomFrom === 'wardrobe' ? 'wardrobe' : 'booth'; break;
        case 'border': state.screen = 'room'; break;
        case 'frame': state.screen = 'booth'; break;
        default: closeWardrobe(); return;
    }
    render();
}

// ---------- rendering ----------

function render() {
    if (!root) return;
    const keepScroll = root.querySelector('.facets-body')?.scrollTop || 0;
    const sameScreen = root.dataset.screen === state.screen;
    let body = '', head = '', foot = '';
    switch (state.screen) {
        case 'wardrobe': [head, body, foot] = viewWardrobe(); break;
        case 'organize': [head, body, foot] = viewOrganize(); break;
        case 'edit': [head, body, foot] = viewEdit(); break;
        case 'crop': [head, body, foot] = viewCrop(); break;
        case 'settings': [head, body, foot] = viewSettings(); break;
        case 'pair': [head, body, foot] = viewPair(); break;
        case 'drawers': [head, body, foot] = viewDrawers(); break;
        case 'history': [head, body, foot] = viewHistory(); break;
        case 'leftovers': [head, body, foot] = viewLeftovers(); break;
        case 'move': [head, body, foot] = viewMove(); break;
        case 'booth': [head, body, foot] = viewBooth(); break;
        case 'room': [head, body, foot] = viewRoom(); break;
        case 'border': [head, body, foot] = viewBorder(); break;
        case 'frame': [head, body, foot] = viewFrame(); break;
    }
    const booth = BOOTH_SCREENS.has(state.screen);
    // 0.9.2: one theme for every screen, the Photo Booth too. 'st' = SillyTavern colours.
    const theme = settings().theme;
    const look = theme === 'st' ? ' facets-tst' : ` facets-ft facets-t-${theme} ${state.dark ? 'is-dark' : 'is-light'}`;
    const lang = getLanguage();
    root.innerHTML = `
      <div class="facets-backdrop" data-act="close"></div>
      <div class="facets-sheet${booth ? ' facets-booth' : ''}${look}" role="dialog" aria-modal="true" aria-label="${esc(t('ext_name'))}" lang="${lang}">
        <div class="facets-head">${head}
          <button type="button" class="facets-iconbtn facets-close" data-act="close" title="${esc(t('close'))}" aria-label="${esc(t('close'))}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="facets-body">${body}</div>
        ${foot ? `<div class="facets-foot">${foot}</div>` : ''}
      </div>`;
    root.dataset.screen = state.screen;
    if (sameScreen) {
        const b = root.querySelector('.facets-body');
        if (b) b.scrollTop = keepScroll;
    }
    if (state.screen === 'crop') mountCrop();
    if (state.screen === 'border') mountBorderPreview();
    if (state.busy) root.querySelector('.facets-sheet')?.classList.add('facets-busy');
}

function headTitle(title) {
    return `<button type="button" class="facets-iconbtn" data-act="back" title="${esc(t('back'))}" aria-label="${esc(t('back'))}"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="facets-title">${esc(title)}</div>`;
}

/** 0.9.2: [Wardrobe | Photo Booth] switch at the top left of both main screens. */
function headSwitch(on) {
    const b = (where, icon, label) => `<button type="button" role="tab" class="facets-segbtn${on === where ? ' on' : ''}" data-act="${where === 'wardrobe' ? 'go-wardrobe' : 'booth'}" aria-selected="${on === where}" title="${esc(label)}">${icon}<span>${esc(label)}</span></button>`;
    return `<div class="facets-seg facets-headswitch" role="tablist" aria-label="${esc(t('ext_name'))}">
        ${b('wardrobe', ICON_HANGER, t('wardrobe_title'))}${b('booth', ICON_CAMERA, t('booth_title'))}
      </div><span class="facets-headgap"></span>`;
}

const settingsButton = () => `<button type="button" class="facets-iconbtn" data-act="settings" title="${esc(t('settings'))}" aria-label="${esc(t('settings'))}"><i class="fa-solid fa-gear"></i></button>`;

function headWardrobe() {
    // 0.9.0: the character / me picker moved into the body (whoPicker), like the Photo Booth.
    // 0.9.2: [Wardrobe | Photo Booth] switch, then ✨ Decorate the chat, ⚙ and ✕ as framed buttons.
    return `${headSwitch('wardrobe')}
      <button type="button" class="facets-iconbtn facets-head-door is-wand" data-act="room" title="${esc(t('room_open'))}" aria-label="${esc(t('room_open'))}">${ICON_WAND}</button>
      ${settingsButton()}`;
}

/** 0.9.6: a small label over a card (NOW WEARING, MY CLOSET…); each theme decorates it. */
function kicker(text) {
    return `<div class="facets-kicker"><span>${esc(text)}</span></div>`;
}

/** The "+" tile at the end of an outfit grid (opens the file picker). */
function addTile(labelKey) {
    return `<label class="facets-tile facets-add" role="button" tabindex="0" title="${esc(t('add_outfit'))}">
        <div class="facets-thumb"><span class="facets-add-plus"><i class="fa-solid fa-plus"></i></span></div>
        <div class="facets-label">${esc(t(labelKey))}</div>
        <input type="file" accept="image/*" multiple class="facets-file" data-act="add-files" hidden>
      </label>`;
}

function emptyNote(msgKey) {
    return `<div class="facets-empty"><div class="facets-empty-body">${esc(t(msgKey))}</div></div>`;
}

function viewWardrobe() {
    const head = headWardrobe();
    const sc = currentScene();
    const key = activeKey();
    if (!key) {
        const msg = !state.fromSettings && sc.inGroup ? 'group_unsupported'
            : state.tab === 'char' ? 'no_character' : 'no_persona';
        return [head, whoPicker('tab') + emptyNote(msg), ''];
    }
    const e = entityFor(key);
    const chatKey = chatAvailable() ? sc.chatKey : null;
    const shown = effectiveOutfit(key, chatKey);
    const globalO = findOutfit(key, e.global);
    const idx = (o) => e.outfits.indexOf(o);
    const globalName = globalO ? outfitLabel(globalO, idx(globalO)) : t('default_look');
    // 0.9.6: the worn outfit's name is the big line; where it applies is the small line under it.
    const nowName = shown ? outfitLabel(shown, idx(shown)) : t('default_look');
    let sub = t('now_follow');
    if (chatKey) {
        const c = chatChoice(chatKey, key);
        const picked = c === DEFAULT_MARK || (c !== undefined && findOutfit(key, c));
        if (picked) {
            const tl = timelineOf(chatKey, key);
            const since = tl ? ` ${t('status_since', { time: timeLabel(tl.points[tl.points.length - 1].t) })}` : '';
            sub = `${t('now_chat_only')}${since} · ${t('status_all', { b: globalName })}`;
        }
    }
    const drawer = currentDrawer(e);
    const visible = e.outfits.map((o, i) => [o, i]).filter(([o]) => !drawer || o.drawers.includes(drawer));
    const tiles = [tileHtml({ key, outfit: null, selected: !shown, mode: 'wear' })]
        .concat(visible.map(([o, i]) => tileHtml({ key, outfit: o, index: i, selected: shown?.id === o.id, mode: 'wear' })));
    tiles.push(addTile('add_tile'));
    const historyBtn = chatKey && timelineOf(chatKey, key)
        ? `<button type="button" class="facets-btn facets-small" data-act="history" title="${esc(t('history'))}"><i class="fa-solid fa-clock-rotate-left"></i><span>${esc(t('history_short'))}</span></button>` : '';
    const diceBtn = chatKey && e.outfits.length
        ? `<button type="button" class="facets-btn facets-small" data-act="dice" title="${esc(t('dice'))}" aria-label="${esc(t('dice'))}"><i class="fa-solid fa-dice"></i><span>${esc(t('dice_short'))}</span></button>` : '';
    // 0.9.0: what is worn and what the AI is told, in one card.
    // 0.9.6: a small label, the worn outfit's name in big letters, where it applies, then the AI line.
    let body = `${whoPicker('tab')}${state.fromSettings ? leftoverBar() : ''}<div class="facets-card facets-nowcard">
        <div class="facets-nowtop">
          <div class="facets-nowtext">${kicker(t('now_label'))}
            <div class="facets-nowname" title="${esc(nowName)}"><span>${esc(nowName)}</span></div>
            <div class="facets-nowsub" title="${esc(sub)}">${esc(sub)}</div>
          </div>
          ${historyBtn || diceBtn ? `<div class="facets-nowbtns">${historyBtn}${diceBtn}</div>` : ''}
        </div>
        ${moreHtml(e, key, chatKey)}
      </div>`;
    // 0.9.6: the outfits sit in one card (label, count, drawer tabs, grid), not loose on the background.
    const n = e.outfits.length;
    let closet = `<div class="facets-closet-head">${kicker(t('closet_label'))}<span class="facets-count">${esc(t(n === 1 ? 'closet_count_one' : 'closet_count', { n }))}</span></div>
        ${drawerChips(e, drawer)}
        <div class="facets-grid">${tiles.join('')}</div>`;
    if (e.outfits.length && drawer && !visible.length) {
        closet += `<div class="facets-empty facets-empty-inline"><div class="facets-empty-body">${esc(t('drawer_empty'))}</div></div>`;
    }
    if (!e.outfits.length) {
        closet += `<div class="facets-empty facets-empty-inline"><div class="facets-empty-title">${esc(t('empty_title'))}</div><div class="facets-empty-body">${esc(t('empty_body'))}</div></div>`;
    }
    body += `<div class="facets-card facets-closet">${closet}</div>`;
    if (state.fromSettings || !chatKey) {
        body += `<div class="facets-note">${esc(t('settings_hint_nochat'))}</div>`;
    }
    const allLabel = state.tab === 'char' ? t('scope_all') : t('scope_all_persona');
    const seg = chatKey
        ? `<div class="facets-seg" role="radiogroup">
            <button type="button" role="radio" class="facets-segbtn${state.scope === 'chat' ? ' on' : ''}" data-act="scope" data-scope="chat" aria-checked="${state.scope === 'chat'}" title="${esc(t('scope_chat'))}">${esc(t('scope_chat'))}</button>
            <button type="button" role="radio" class="facets-segbtn${state.scope === 'all' ? ' on' : ''}" data-act="scope" data-scope="all" aria-checked="${state.scope === 'all'}" title="${esc(allLabel)}">${esc(allLabel)}</button>
          </div>`
        : '';
    // 0.9.1: "From now on" sits beside the picker as one short line (the note is in ⚙ Settings).
    // 0.9.8: always there so the line keeps its shape; dimmed and not clickable with "whole character".
    const sinceOff = state.scope !== 'chat';
    const since = chatKey
        ? `<label class="facets-toggle facets-since-mini${sinceOff ? ' is-off' : ''}" title="${esc(sinceOff ? t('since_off') : t('since_note'))}">
            <span class="facets-toggle-text"><span>${esc(t('since_label'))}</span></span>
            <input type="checkbox" data-setting="sinceMode"${settings().sinceMode ? ' checked' : ''}${sinceOff ? ' disabled' : ''}>
            <span class="facets-switch" aria-hidden="true"></span>
          </label>` : '';
    const foot = `${seg ? `<div class="facets-segline">${seg}${since}</div>` : ''}
      <div class="facets-row">
        <button type="button" class="facets-btn" data-act="wear-default" title="${esc(t('default_look'))}">${esc(t('default_look'))}</button>
        ${addButton(true)}
        <button type="button" class="facets-btn" data-act="organize" title="${esc(t('organize'))}">${esc(t('organize'))}</button>
      </div>`;
    return [head, body, foot];
}

/** "Random each reply" switch for this chat. The range is the drawer tab open when it was turned on. */
function randomRow(e, key, chatKey) {
    const range = randomOf(chatKey, key);
    const on = range !== undefined;
    const i = on && range ? e.drawers.findIndex(d => d.id === range) : -1;
    const note = !on ? t('rnd_note_off') : i >= 0 ? t('rnd_note_drawer', { name: drawerLabel(e.drawers[i], i) }) : t('rnd_note_all');
    return `<label class="facets-toggle">
        <span class="facets-toggle-text"><span>${esc(t('rnd_label'))}</span><small>${esc(note)}</small></span>
        <input type="checkbox" data-act="random"${on ? ' checked' : ''}>
        <span class="facets-switch" aria-hidden="true"></span>
      </label>`;
}

/**
 * 0.9.1: "Tell the AI" and "Random each reply" fold into one summary line under the status.
 * The line keeps the AI state and its button; ▾ opens the switches and their notes (remembered).
 */
function moreHtml(e, key, chatKey) {
    const s = settings();
    const open = !!s.moreOpen;
    const st = s.tellAI && chatKey ? aiState(key, chatKey) : null;
    const text = !s.tellAI ? t('ai_off_short') : st ? st.text : t('ai_on_short');
    const rnd = chatKey && randomOf(chatKey, key) !== undefined
        ? `<span class="facets-sum-rnd" title="${esc(t('rnd_label'))}" aria-label="${esc(t('rnd_label'))}">🎲</span>` : '';
    const more = `<button type="button" class="facets-iconbtn facets-more-btn" data-act="more" aria-expanded="${open}" title="${esc(t(open ? 'more_close' : 'more_open'))}" aria-label="${esc(t(open ? 'more_close' : 'more_open'))}"><i class="fa-solid fa-chevron-${open ? 'up' : 'down'}"></i></button>`;
    const line = `<div class="facets-aistate facets-sumline${st?.on ? ' is-on' : ''}"><span class="facets-aistate-dot" aria-hidden="true"></span><span class="facets-aistate-text">${esc(text)}</span>${rnd}${st?.btn || ''}${more}</div>`;
    if (!open) return line;
    const rows = [toggleRow('tellAI', t('tell_ai_short'), t('tell_ai_note'))];
    if (chatKey && e.outfits.length) rows.push(randomRow(e, key, chatKey));
    return `${line}<div class="facets-morebox">${rows.join('')}<div class="facets-note">${esc(t('auto_no_tell'))}</div></div>`;
}

/** The Photo Booth doors in the wardrobe (0.8.0): everything about decorating lives there. */
// 0.8.1: line icons for the two doors (pink camera, lavender wand), drawn here so they don't depend on the icon font.
const ICON_CAMERA = '<svg class="facets-door-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 6.5 9.8 4.6h4.4l1.2 1.9H18a2.6 2.6 0 0 1 2.6 2.6v8.2A2.6 2.6 0 0 1 18 19.9H6a2.6 2.6 0 0 1-2.6-2.6V9.1A2.6 2.6 0 0 1 6 6.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13.1" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="9.5" r="1" fill="currentColor"/></svg>';
const ICON_HANGER = '<svg class="facets-door-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.6a2.3 2.3 0 1 1 2.3-2.3M12 7.6v1.6l8.6 5.9a1.2 1.2 0 0 1-.7 2.2H4.1a1.2 1.2 0 0 1-.7-2.2L12 9.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_WAND = '<svg class="facets-door-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5 14 10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M16 3l1.1 2.9 2.9 1.1-2.9 1.1L16 11l-1.1-2.9L12 7l2.9-1.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M20 13.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" fill="currentColor"/><circle cx="8" cy="5.5" r="1" fill="currentColor"/></svg>';

// ---------- Photo Booth (0.8.0) ----------

const sw = (act, on, label, note = '', extra = '') => `<label class="facets-toggle">
    <span class="facets-toggle-text"><span>${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ''}</span>
    <input type="checkbox" data-act="${act}"${on ? ' checked' : ''}${extra}>
    <span class="facets-switch" aria-hidden="true"></span>
  </label>`;

function boothHead(titleKey) {
    return `${headTitle(t(titleKey))}`;
}

function viewBooth() {
    // 0.8.1: photocards (a tape on top, a coloured photo with the icon, the name as a caption).
    // 0.9.2: no big title or tagline (the head switch already says Photo Booth).
    // 0.9.6: a thin label strip on top, two-colour icons drawn here, "Soon" cards keep their colour
    //        (each theme shows either the SOON stamp on the photo or the small tag by the name).
    let num = 0;
    const tile = (act, icon, nameKey, tone) => {
        const name = esc(t(nameKey));
        num++;
        const photo = `<span class="facets-btile-photo">${BOOTH_ICONS[icon]}<span class="facets-btile-num" aria-hidden="true">${String(num).padStart(2, '0')}</span>${act ? '' : `<span class="facets-btile-stamp" aria-hidden="true">${esc(t('booth_soon_stamp'))}</span>`}</span>`;
        const caption = `<span class="facets-btile-cap"><span class="facets-btile-name">${name}</span>${act ? '' : `<span class="facets-btile-tag">${esc(t('booth_soon'))}</span>`}</span>`;
        return act
            ? `<button type="button" class="facets-btile facets-tone-${tone}" data-act="booth-go" data-to="${act}" title="${name}">${photo}${caption}</button>`
            : `<div class="facets-btile facets-tone-${tone} is-soon" aria-disabled="true" title="${name} · ${esc(t('booth_soon'))}">${photo}${caption}</div>`;
    };
    const tiles = [
        tile('room', 'wand', 'booth_room', 'pink'),
        tile('frame', 'portrait', 'booth_frame', 'lav'),
        tile('stickers', 'heart', 'booth_stickers', 'cherry'),
        tile('', 'card', 'booth_card', 'sky'),
        tile('', 'film', 'booth_strip', 'gold'),
        tile('', 'book', 'booth_book', 'silver'),
    ];
    const body = `<div class="facets-booth-strip">${kicker(t('booth_label'))}<span class="facets-count">${esc(t('booth_count', { open: 3, soon: 3 }))}</span></div>
      <div class="facets-btiles">${tiles.join('')}</div>`;
    return [`${headSwitch('booth')}${settingsButton()}`, body, ''];
}

// 0.9.6: two-colour icons for the photocards: the line is the card's ink, the soft fill is --icofill.
const boothIcon = (paths) => `<svg class="facets-bico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const BOOTH_ICONS = {
    wand: boothIcon('<path d="m4 20 10-10"/><path d="m12.5 8.5 3 3"/><path class="f" d="M17 3.5l.6 1.6 1.6.6-1.6.6L17 7.9l-.6-1.6-1.6-.6 1.6-.6Z"/><path class="f" d="M20 10.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4Z"/>'),
    portrait: boothIcon('<rect class="f" x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="10.5" r="2.6"/><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3"/>'),
    heart: boothIcon('<path class="f" d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4Z"/>'),
    card: boothIcon('<rect class="f" x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="8.8" cy="11" r="1.8"/><path d="M6 15.5c.6-1.2 1.6-1.8 2.8-1.8s2.2.6 2.8 1.8M14 10h3.5M14 13h3.5"/>'),
    film: boothIcon('<rect class="f" x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4"/>'),
    book: boothIcon('<path class="f" d="M12 7c-1.8-1.3-4.3-1.8-7.5-1.5v12.5c3.2-.3 5.7.2 7.5 1.5 1.8-1.3 4.3-1.8 7.5-1.5V5.5C16.3 5.2 13.8 5.7 12 7Z"/><path d="M12 7v12.5"/>'),
};

/** Character / me picker used in the Photo Booth (and the name of who is picked). */
function whoPicker(act = 'booth-who') {
    const key = activeKey();
    let name = key ? `<div class="facets-booth-who" title="${esc(displayName(key))}">${esc(displayName(key))}</div>` : '';
    let pick = false;
    if (state.fromSettings) {
        const opts = state.tab === 'char'
            ? allCharacters().map(c => [charKey(c.avatar), c.name])
            : allPersonas().map(p => [personaKey(p.avatar), p.name]);
        name = opts.length ? `<select class="facets-select facets-entity" data-act="entity" aria-label="${esc(t(state.tab === 'char' ? 'pick_character' : 'pick_persona'))}">
            ${opts.map(([k, n]) => `<option value="${esc(k)}"${k === key ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>` : '';
        pick = !!name;
    }
    // 0.9.6: the name sits in a name tag with a small picture of what is worn now.
    if (name) {
        const shown = key && getEntity(key) ? effectiveOutfit(key, chatAvailable() ? currentScene().chatKey : null) : null;
        const av = key ? `<span class="facets-namechip-av" aria-hidden="true"><img src="${esc(thumbOf(key, shown))}" alt="" draggable="false" onerror="this.parentNode.classList.add('broken')"></span>` : '';
        name = `<div class="facets-namechip${pick ? ' has-select' : ''}">${av}${name}</div>`;
    }
    const b = (tab, label) => `<button type="button" role="radio" class="facets-segbtn${state.tab === tab ? ' on' : ''}" data-act="${act}" data-tab="${tab}" aria-checked="${state.tab === tab}">${esc(label)}</button>`;
    return `<div class="facets-whorow"><div class="facets-seg" role="radiogroup">${b('char', t('tab_character'))}${b('persona', t('who_me'))}</div>${name}</div>`;
}

function viewRoom() {
    const key = activeKey();
    const tabs = `<div class="facets-roomtabs" role="tablist">
        <button type="button" role="tab" class="facets-roomtab${state.roomTab === 'outfits' ? ' on' : ''}" data-act="room-tab" data-tab="outfits" aria-selected="${state.roomTab === 'outfits'}"><i class="fa-solid fa-shirt"></i><span>${esc(t('room_tab_outfits'))}</span></button>
        <button type="button" role="tab" class="facets-roomtab${state.roomTab === 'stickers' ? ' on' : ''}" data-act="room-tab" data-tab="stickers" aria-selected="${state.roomTab === 'stickers'}"><i class="fa-solid fa-heart"></i><span>${esc(t('room_tab_stickers'))}</span></button>
      </div>`;
    let inner;
    const stickers = state.roomTab === 'stickers';
    if (stickers) {
        inner = roomStickers();
    } else if (!key) {
        const sc = currentScene();
        inner = emptyNote(!state.fromSettings && sc.inGroup ? 'group_unsupported' : state.tab === 'char' ? 'no_character' : 'no_persona');
    } else {
        inner = roomOutfits(key);
    }
    // 0.10.0: stickers belong to the chat, not to a character, so the [Character | Me] row is left out there.
    const body = `${stickers ? '' : whoPicker()}${tabs}<div class="facets-stack">${inner}</div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="back">${esc(t('done'))}</button></div>`;
    return [boothHead('room_title'), body, foot];
}

// ----- stickers (0.10.0) -----

const stickerName = (k) => {
    if (k.kind === 'basic') return t(`stk_${k.ref}`);
    const list = settings().myStickers;
    const i = list.findIndex(m => m.id === k.ref);
    return list[i]?.name || t('stk_mine_n', { n: i + 1 });
};

function roomStickers() {
    const s = settings();
    const look = s.stickerLook;
    const spark = s.stickerSpark;
    const chatKey = chatAvailable() ? currentScene().chatKey : null;
    const placed = chatKey ? stickersOf(chatKey) : [];
    const full = placed.length >= MAX_STICKERS;
    const lock = chatKey && !full ? '' : ' disabled';
    // ON THIS CHAT: what is stuck here now (small ✕ = take it off).
    let here;
    if (!chatKey) {
        here = `<div class="facets-note">${esc(t('stk_need_chat'))}</div>`;
    } else {
        const thumbs = placed.map(k => {
            const pid = `${STICKER_KEY}\n${k.id}`;
            const name = stickerName(k);
            return `<div class="facets-stk-on">
                <button type="button" class="facets-stk-onpic" data-act="border" data-pid="${esc(pid)}" title="${esc(`${name} · ${t('border_btn')}`)}" aria-label="${esc(`${name} · ${t('border_btn')}`)}">
                  <img src="${esc(stickerSrc(k, false))}" alt="" draggable="false" style="transform:rotate(${Math.round(rotOf(pid))}deg)"></button>
                <button type="button" class="facets-stk-x" data-act="stk-remove" data-id="${esc(k.id)}" title="${esc(t('stk_remove', { name }))}" aria-label="${esc(t('stk_remove', { name }))}"><i class="fa-solid fa-xmark"></i></button>
              </div>`;
        }).join('');
        here = `${placed.length ? `<div class="facets-stk-onrow">${thumbs}</div>` : `<div class="facets-note">${esc(t('stk_none_here'))}</div>`}
          <div class="facets-note">${esc(t('stk_here_note'))}</div>`;
    }
    const count = chatKey ? `<span class="facets-count">${esc(t('stk_count', { n: placed.length, max: MAX_STICKERS }))}</span>` : '';
    const onCard = `<div class="facets-card facets-stk-card"><div class="facets-closet-head">${kicker(t('stk_here_label'))}${count}</div>${here}</div>`;
    // BASIC: pick the look first, then tap a sticker.
    const looks = LOOKS.map(v => `<button type="button" role="radio" class="facets-segbtn${look === v ? ' on' : ''}" data-act="stk-look" data-v="${v}" aria-checked="${look === v}">${esc(t(`stk_look_${v}`))}</button>`).join('');
    const sparkSw = `<label class="facets-toggle facets-stk-spark" title="${esc(t('stk_spark_note'))}">
        <span class="facets-toggle-text"><span>✦ ${esc(t('stk_spark'))}</span></span>
        <input type="checkbox" data-act="stk-spark"${spark ? ' checked' : ''}>
        <span class="facets-switch" aria-hidden="true"></span>
      </label>`;
    const basic = BASIC_IDS.map(id => {
        const name = t(`stk_${id}`);
        return `<button type="button" class="facets-stk-tile" data-act="stk-add" data-kind="basic" data-ref="${id}" title="${esc(name)}" aria-label="${esc(t('stk_add', { name }))}"${lock}>
            <img src="${esc(basicUrl(id, look, spark, false))}" alt="" draggable="false"><span>${esc(name)}</span></button>`;
    }).join('');
    const basicCard = `<div class="facets-card facets-stk-card">
        <div class="facets-closet-head">${kicker(t('stk_basic_label'))}<span class="facets-stk-hint">${esc(t('stk_tap_hint'))}</span></div>
        <div class="facets-stk-lookrow"><div class="facets-seg" role="radiogroup" aria-label="${esc(t('stk_look'))}">${looks}</div>${sparkSw}</div>
        <div class="facets-stk-grid">${basic}</div>
        <div class="facets-note">${esc(t('stk_basic_note'))}</div>
      </div>`;
    // MY STICKERS: your own pictures, the same in every chat.
    const mine = s.myStickers.map((m, i) => {
        const name = m.name || t('stk_mine_n', { n: i + 1 });
        if (state.stickerEdit) {
            return `<button type="button" class="facets-stk-tile is-edit" data-act="stk-del" data-id="${esc(m.id)}" title="${esc(t('stk_delete'))}" aria-label="${esc(`${t('stk_delete')} · ${name}`)}">
                <img src="${esc(urlOf(m.path))}" alt="" draggable="false" loading="lazy"><span>${esc(name)}</span><em class="facets-stk-del" aria-hidden="true"><i class="fa-solid fa-trash-can"></i></em></button>`;
        }
        return `<button type="button" class="facets-stk-tile is-mine" data-act="stk-add" data-kind="mine" data-ref="${esc(m.id)}" title="${esc(name)}" aria-label="${esc(t('stk_add', { name }))}"${lock}>
            <img src="${esc(urlOf(m.path))}" alt="" draggable="false" loading="lazy"><span>${esc(name)}</span></button>`;
    }).join('');
    const upload = state.stickerEdit ? '' : `<label class="facets-stk-tile facets-stk-up" role="button" tabindex="0" title="${esc(t('stk_upload'))}">
        <span class="facets-add-plus"><i class="fa-solid fa-plus"></i></span><span>${esc(t('stk_upload'))}</span>
        <input type="file" accept="image/*" multiple data-act="stk-upload" hidden></label>`;
    const edit = s.myStickers.length
        ? `<button type="button" class="facets-btn facets-small${state.stickerEdit ? ' facets-primary' : ''}" data-act="stk-edit">${esc(t(state.stickerEdit ? 'done' : 'stk_organize'))}</button>` : '';
    const mineCard = `<div class="facets-card facets-stk-card">
        <div class="facets-closet-head">${kicker(t('stk_mine_label'))}${edit}</div>
        <div class="facets-stk-grid">${upload}${mine}</div>
        <div class="facets-note">${esc(t(state.stickerEdit ? 'stk_delete_note' : 'stk_mine_note'))}</div>
      </div>`;
    return onCard + basicCard + mineCard + (full ? `<div class="facets-note">${esc(t('stk_full', { max: MAX_STICKERS }))}</div>` : '');
}

function stickHere(kind, ref) {
    if (!chatAvailable()) return;
    const s = settings();
    if (!addSticker(currentScene().chatKey, kind, ref, s.stickerLook, s.stickerSpark)) toast('warning', t('stk_full', { max: MAX_STICKERS }));
    applyAllSoon();
    render();
}

/** Your own sticker pictures: made smaller (keeps see-through parts) and uploaded once, then used in every chat. */
async function uploadStickers(files) {
    if (!files?.length) return;
    await withBusy(async () => {
        const items = await readPicked([...files]);
        let added = 0;
        for (const it of items) {
            const max = 512;
            const k = Math.min(1, max / Math.max(it.img.naturalWidth || 1, it.img.naturalHeight || 1));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(it.img.naturalWidth * k));
            c.height = Math.max(1, Math.round(it.img.naturalHeight * k));
            c.getContext('2d').drawImage(it.img, 0, 0, c.width, c.height);
            let data = c.toDataURL('image/webp', 0.92);
            if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/png');
            try {
                const path = await uploadDataURL(data, STICKER_FOLDER, `stk_${newId()}`);
                addMySticker(path, it.name);
                added++;
            } catch (err) {
                console.error('[Facets]', err);
                toast('error', t('upload_failed', { name: it.fileName || it.name }));
            }
        }
        save();
        if (added) toast('success', t('stk_uploaded', { n: added }));
    }, () => toast('error', t('stk_upload_failed')));
    render();
}

const STICKER_FOLDER = 'Facets_stickers';

async function deleteMySticker(id) {
    const list = settings().myStickers;
    const i = list.findIndex(m => m.id === id);
    if (i < 0) return;
    const name = list[i].name || t('stk_mine_n', { n: i + 1 });
    if (!(await confirmBox(t('confirm_stk_delete', { name }), t('delete')))) return;
    await withBusy(async () => {
        const path = removeMySticker(id);
        save();
        applyAllSoon();
        if (path && !(await deletePath(path))) toast('warning', t('delete_failed'));
        save();
        if (!settings().myStickers.length) state.stickerEdit = false;
    });
    render();
}

function thumbOf(key, outfit) {
    return outfit ? urlOf(outfit.sq || outfit.orig) : defaultThumb(key);
}

function roomOutfits(key) {
    entityFor(key);
    const st = stageOf(key, true);
    const chatKey = chatAvailable() ? currentScene().chatKey : null;
    const now = effectiveOutfit(key, chatKey);
    // 0.9.1: the current-outfit picture is the first row of the one list, with [Add] / [Remove] like the others.
    const sub = st.on && !settings().showStage ? t('stage_note_master') : t('main_sub');
    const tail = st.on
        ? `<button type="button" class="facets-btn facets-small" data-act="stage-off">${esc(t('stage_remove'))}</button>`
        : `<button type="button" class="facets-btn facets-small facets-jellybtn" data-act="stage-on-btn">${esc(t('pin_add'))}</button>`;
    let tools = '';
    if (st.on) {
        const states = [];
        if (st.hidden) states.push(`<div class="facets-stage-state"><span>${esc(t('stage_hidden_note'))}</span><button type="button" class="facets-btn facets-small" data-act="stage-show"><i class="fa-solid fa-eye"></i><span>${esc(t('stage_show'))}</span></button></div>`);
        if (st.locked) states.push(`<div class="facets-stage-state"><span>${esc(t('stage_locked_note'))}</span><button type="button" class="facets-btn facets-small" data-act="stage-unlock"><i class="fa-solid fa-lock-open"></i><span>${esc(t('stage_unlock'))}</span></button></div>`);
        const kind = t(screenKind() === 'narrow' ? 'stage_kind_narrow' : 'stage_kind_wide');
        tools = `${states.join('')}
        <div class="facets-btnrow facets-main-tools">
          <button type="button" class="facets-btn facets-small facets-jellybtn" data-act="border" data-pid="${esc(key)}"><i class="fa-solid fa-wand-magic-sparkles"></i><span>${esc(t('border_btn'))}</span></button>
          <span class="facets-btnrow-gap"></span>
          <span class="facets-turnrow">
            <button type="button" class="facets-iconbtn" data-act="stage-turn" data-dir="-1" title="${esc(t('stage_rot_left'))}" aria-label="${esc(t('stage_rot_left'))}"><i class="fa-solid fa-rotate-left"></i></button>
            <span class="facets-turndeg" title="${esc(t('stage_rot'))}">${Math.round(rotOf(key))}°</span>
            <button type="button" class="facets-iconbtn" data-act="stage-turn" data-dir="1" title="${esc(t('stage_rot_right'))}" aria-label="${esc(t('stage_rot_right'))}"><i class="fa-solid fa-rotate-right"></i></button>
          </span>
          <button type="button" class="facets-iconbtn facets-pin-opt${st.flip ? ' on' : ''}" data-act="stage-flip-btn" aria-pressed="${!!st.flip}" title="${esc(t('stage_flip'))}" aria-label="${esc(t('stage_flip'))}"><i class="fa-solid fa-arrows-left-right"></i></button>
          <button type="button" class="facets-iconbtn" data-act="stage-reset" title="${esc(`${t('stage_reset')} · ${t('stage_reset_note', { kind })}`)}" aria-label="${esc(t('stage_reset'))}"><i class="fa-solid fa-arrows-to-dot"></i></button>
        </div>`;
    }
    const main = `<div class="facets-mainpin${st.on ? ' is-on' : ''}">
        <div class="facets-hist-row facets-pin-row facets-main-row${st.on ? ' is-pinned' : ''}">
          <div class="facets-hist-thumb"><img src="${esc(thumbOf(key, now))}" alt="" draggable="false"></div>
          <div class="facets-hist-text">
            <div class="facets-hist-name">${esc(t('stage_main_title'))}</div>
            <div class="facets-hist-time">${esc(sub)}</div>
          </div>
          ${tail}
        </div>${tools}
      </div>`;
    return `${pinSection(key, main)}<div class="facets-note">${esc(t('stage_how'))}</div>`;
}

/** 📌 Pictures pinned in this chat, and saved layouts. Only inside a chat. */
function pinSection(key, main = '') {
    const title = `<div class="facets-card-title">${esc(t('pin_title'))}</div>`;
    if (!chatAvailable()) return `<div class="facets-card">${title}${main}<div class="facets-note">${esc(t('pin_need_chat'))}</div></div>`;
    const chatKey = currentScene().chatKey;
    const e = getEntity(key);
    const pins = pinsOf(chatKey, key);
    const full = pins.length >= MAX_PINS;
    const rows = (e?.outfits || []).map((o, i) => {
        const pin = pins.find(p => p.outfit === o.id);
        const name = outfitLabel(o, i);
        const tail = pin
            ? `<button type="button" class="facets-iconbtn facets-pin-opt${pin.deco ? ' on' : ''}" data-act="border" data-pid="${esc(`${key}\n${pin.id}`)}" title="${esc(t('border_btn'))}" aria-label="${esc(t('border_btn'))}"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
               <button type="button" class="facets-iconbtn facets-pin-opt${pin.flip ? ' on' : ''}" data-act="pin-flip" data-pin="${esc(pin.id)}" aria-pressed="${pin.flip}" title="${esc(t('stage_flip'))}" aria-label="${esc(t('stage_flip'))}"><i class="fa-solid fa-arrows-left-right"></i></button>
               <button type="button" class="facets-iconbtn facets-pin-turn" data-act="pin-turn" data-pin="${esc(pin.id)}" title="${esc(t('stage_rot_right'))}" aria-label="${esc(t('stage_rot_right'))}"><i class="fa-solid fa-rotate-right"></i></button>
               <button type="button" class="facets-btn facets-small" data-act="pin-remove" data-pin="${esc(pin.id)}">${esc(t('stage_remove'))}</button>`
            : `<button type="button" class="facets-btn facets-small facets-jellybtn" data-act="pin-add" data-id="${esc(o.id)}"${full ? ' disabled' : ''}>${esc(t('pin_add'))}</button>`;
        return `<div class="facets-hist-row facets-pin-row${pin ? ' is-pinned' : ''}">
            <div class="facets-hist-thumb"><img src="${esc(urlOf(o.sq || o.orig))}" alt="" loading="lazy" draggable="false"></div>
            <div class="facets-hist-text">
              <div class="facets-hist-name" title="${esc(name)}">${esc(name)}</div>
              ${pin ? `<div class="facets-hist-time">${esc(t('pin_here'))}</div>` : ''}
            </div>
            ${tail}
          </div>`;
    }).join('');
    const layouts = layoutsOf(key);
    const lrows = layouts.map((l, i) => `<div class="facets-drawer-row facets-layout-row">
        <input type="text" class="facets-input" data-layout-name="${esc(l.id)}" maxlength="40" value="${esc(l.name)}" placeholder="${esc(t('layout_n', { n: i + 1 }))}" aria-label="${esc(t('layout_name'))}" autocomplete="off">
        <span class="facets-drawer-count">${esc(layoutCount(l))}</span>
        <button type="button" class="facets-btn facets-small" data-act="layout-load" data-id="${esc(l.id)}">${esc(t('layout_load'))}</button>
        <button type="button" class="facets-iconbtn facets-danger-icon" data-act="layout-delete" data-id="${esc(l.id)}" title="${esc(t('layout_delete'))}" aria-label="${esc(t('layout_delete'))}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`).join('');
    const hasSome = pins.length > 0 || !!frameOf(chatKey, key) || stickersOf(chatKey).length > 0;
    const canSave = hasSome && layouts.length < MAX_LAYOUTS;
    return `<div class="facets-card">${title}
        ${main}
        <div class="facets-note">${esc(t('pin_note', { n: pins.length, max: MAX_PINS }))}</div>
        ${rows || `<div class="facets-note">${esc(t('pin_no_outfits'))}</div>`}
      </div>
      <div class="facets-card">
        <div class="facets-card-title">${esc(t('layout_title'))}</div>
        <div class="facets-drawer-row">
          <input type="text" class="facets-input facets-layout-new" maxlength="40" placeholder="${esc(t('layout_new_ph'))}" aria-label="${esc(t('layout_new_ph'))}" autocomplete="off"${canSave ? '' : ' disabled'}>
          <button type="button" class="facets-btn facets-small" data-act="layout-save"${canSave ? '' : ' disabled'}>${esc(t('layout_save'))}</button>
        </div>
        ${lrows}
        <div class="facets-note">${esc(t(hasSome ? 'layout_note' : 'layout_note_empty'))}</div>
      </div>`;
}

/** "3 pictures · deco · 2 stickers" */
function layoutCount(l) {
    const parts = [t('layout_part_pics', { n: l.pins.length })];
    if (l.frame) parts.push(t('layout_part_deco'));
    if (l.stickers?.length) parts.push(t('layout_part_stickers', { n: l.stickers.length }));
    return parts.join(' · ');
}

// ----- ① picture border -----

function borderInfo() {
    const info = state.borderPid ? pieceInfo(state.borderPid) : null;
    if (!info) return null;
    const i = state.borderPid.indexOf('\n');
    const ek = i < 0 ? state.borderPid : state.borderPid.slice(0, i);
    if (info.sticker) return { ...info, ek, name: stickerName(info.st), who: t('stk_word'), pinned: true };
    const e = getEntity(ek);
    const name = info.outfit ? outfitLabel(info.outfit, e?.outfits.indexOf(info.outfit) ?? 0) : t('default_look');
    return { ...info, ek, name, who: displayName(ek), pinned: i >= 0 };
}

function viewBorder() {
    const info = borderInfo();
    if (!info) { state.screen = 'room'; return viewRoom(); }
    const d = info.st.deco;
    const cur = d || { shape: 'rect', pat: 'solid', color: COLORS[0], width: 'mid', glitter: false, blink: false };
    const on = (k, v) => !!d && d[k] === v;
    const SHAPE_ICON = { rect: 'fa-square', circle: 'fa-circle', heart: 'fa-heart', star: 'fa-star', outline: 'fa-person' };
    const shapes = SHAPES.map(v => `<button type="button" class="facets-chip${on('shape', v) ? ' on' : ''}" data-act="deco" data-k="shape" data-v="${v}" aria-pressed="${on('shape', v)}"><i class="fa-solid ${SHAPE_ICON[v]}"></i><span>${esc(t(`shape_${v}`))}</span></button>`).join('');
    const outline = cur.shape === 'outline';
    const pats = PATTERNS.map(v => {
        const dis = outline && v !== 'solid';
        return `<button type="button" class="facets-patchip${on('pat', v) ? ' on' : ''}" data-act="deco" data-k="pat" data-v="${v}" aria-pressed="${on('pat', v)}"${dis ? ' disabled' : ''} title="${esc(t(`pat_${v}`))}">
            <span class="facets-patswatch" style="background:${esc(patternBg(v, cur.color))}"></span><span class="facets-patname">${esc(t(`pat_${v}`))}</span></button>`;
    }).join('');
    const fixed = FIXED_COLOR.has(cur.pat);
    const colorRow = colorSwatches('deco-color', d ? d.color : null, fixed);
    const widths = Object.keys(WIDTHS).map(v => `<button type="button" role="radio" class="facets-segbtn${on('width', v) ? ' on' : ''}" data-act="deco" data-k="width" data-v="${v}" aria-checked="${on('width', v)}">${esc(t(`width_${v}`))}</button>`).join('');
    const notes = [];
    if (isCutShape(cur)) notes.push(t('border_cut_note'));
    if (outline) notes.push(t('border_outline_note'));
    const cut = isCutShape(d);
    // 0.8.1: move and zoom the picture inside a circle, heart or star.
    const zoomPct = Math.round((d?.zoom || 1) * 100);
    // 0.9.0: moving / zooming sits in the shape card, under the shapes.
    const moveCard = cut ? `<div class="facets-movecard"><div class="facets-card-title">${esc(t('border_move'))}</div>
          <div class="facets-note">${esc(t('border_move_hint'))}</div>
          <div class="facets-zoomrow"><span class="facets-zoomlabel">${esc(t('border_zoom'))}</span>
            <button type="button" class="facets-iconbtn" data-act="deco-zoom-step" data-dir="-1" title="${esc(t('zoom_out'))}" aria-label="${esc(t('zoom_out'))}"><i class="fa-solid fa-minus"></i></button>
            <input type="range" class="facets-range" min="100" max="${ZOOM_MAX * 100}" step="5" value="${zoomPct}" data-act="deco-zoom" aria-label="${esc(t('border_zoom'))}">
            <button type="button" class="facets-iconbtn" data-act="deco-zoom-step" data-dir="1" title="${esc(t('zoom_in'))}" aria-label="${esc(t('zoom_in'))}"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div class="facets-row"><button type="button" class="facets-btn" data-act="deco-center">${esc(t('border_center'))}</button><button type="button" class="facets-btn" data-act="deco-face">${esc(t('border_face'))}</button></div>
        </div>` : '';
    const body = `<div class="facets-bprev${info.pinned ? '' : ' is-main'}${cut ? ' is-movable' : ''}"><div class="facets-fig facets-bprev-fig"><img alt="" draggable="false"></div></div>
      <div class="facets-booth-who facets-center" title="${esc(info.name)}">${esc(`${info.who} · ${info.name}`)}</div>
      <div class="facets-stack">${info.sticker ? stickerLookCard(info.st) : ''}
        <div class="facets-card"><div class="facets-card-title">${esc(t('border_shape'))}</div><div class="facets-chips">${shapes}</div>
          ${notes.map(n => `<div class="facets-note">${esc(n)}</div>`).join('')}
          ${moveCard}</div>
        <div class="facets-card"><div class="facets-card-title">${esc(t('border_pattern'))}</div><div class="facets-patgrid">${pats}</div></div>
        <div class="facets-card"><div class="facets-card-title">${esc(t('border_color'))}</div>${colorRow}
          ${fixed ? `<div class="facets-note">${esc(t('border_fixed_color'))}</div>` : ''}</div>
        <div class="facets-card"><div class="facets-card-title">${esc(t('border_width'))}</div><div class="facets-seg" role="radiogroup">${widths}</div></div>
        <div class="facets-card">
          ${sw('deco-glitter', !!d?.glitter, t('border_glitter'), t('border_glitter_note'))}
          ${sw('deco-blink', !!d?.blink, t('border_blink'), t('border_blink_note'), d?.glitter ? '' : ' disabled')}
        </div>
      </div>`;
    const foot = `<div class="facets-row facets-row-split"><button type="button" class="facets-btn facets-danger" data-act="deco-none"${d ? '' : ' disabled'} title="${esc(t('border_none'))}">${esc(t('border_none'))}</button><button type="button" class="facets-btn facets-primary facets-wide" data-act="back">${esc(t('done'))}</button></div>`;
    return [headTitle(t('border_title')), body, foot];
}

/** 0.10.0: the look of one sticker already in the chat (border screen). */
function stickerLookCard(k) {
    const looks = LOOKS.map(v => `<button type="button" role="radio" class="facets-segbtn${k.look === v ? ' on' : ''}" data-act="stk-piece-look" data-v="${v}" aria-checked="${k.look === v}">${esc(t(`stk_look_${v}`))}</button>`).join('');
    return `<div class="facets-card"><div class="facets-card-title">${esc(t('stk_look'))}</div>
        <div class="facets-seg" role="radiogroup" aria-label="${esc(t('stk_look'))}">${looks}</div>
        ${sw('stk-piece-spark', !!k.spark, `✦ ${t('stk_spark')}`, t('stk_spark_note'))}
        ${k.deco ? `<div class="facets-note">${esc(t('stk_look_deco_note'))}</div>` : ''}
      </div>`;
}

/** Change the look of the sticker open in the border screen. */
function setStickerLook(change) {
    const info = borderInfo();
    if (!info?.sticker) return;
    Object.assign(info.st, change);
    save();
    redrawPiece(state.borderPid);
    applyAllSoon();
    render();
}

/** 7 jelly colours + "pick your own". */
function colorSwatches(act, value, disabled) {
    const v = value ? cleanColor(value) : '';
    const custom = v && !COLORS.includes(v);
    const sws = COLORS.map((c, i) => `<button type="button" class="facets-swatch${v === c ? ' on' : ''}" data-act="${act}" data-v="${c}" style="--sw:${c}" title="${esc(t('color_n', { n: i + 1 }))}" aria-label="${esc(t('color_n', { n: i + 1 }))}" aria-pressed="${v === c}"${disabled ? ' disabled' : ''}></button>`).join('');
    return `<div class="facets-swatches${disabled ? ' is-off' : ''}">${sws}
        <label class="facets-swatch facets-swatch-custom${custom ? ' on' : ''}" title="${esc(t('color_custom'))}" style="--sw:${custom ? v : '#ffffff'}">
          <i class="fa-solid fa-eye-dropper" aria-hidden="true"></i>
          <input type="color" data-act="${act}" value="${v || '#ffffff'}" aria-label="${esc(t('color_custom'))}"${disabled ? ' disabled' : ''}>
        </label></div>`;
}

/** Draw the border preview with the same code the chat uses. */
let previewPiece = null;
function mountBorderPreview() {
    const info = borderInfo();
    const box = root.querySelector('.facets-bprev');
    const fig = root.querySelector('.facets-bprev-fig');
    if (!info || !fig) return;
    const img = fig.querySelector('img');
    const deco = info.st.deco;
    const cut = isCutShape(deco);
    const pf = { fig, img };
    previewPiece = pf;
    const size = () => {
        const H = 150;
        const ar = cut ? 1 : (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.7);
        // 0.8.1: cut shapes are no longer drawn smaller here, so they are easy to drag.
        fig.style.width = `${Math.round(Math.min(H * ar, 260))}px`;
        fig.style.height = `${H}px`;
    };
    const paint = () => {
        paintPiece(pf, info.st.deco, { size: parseFloat(fig.style.width), src: info.src });
        if (info.sticker) { pf.src = info.src; paintSticker(pf, info.st); }
    };
    img.addEventListener('load', () => { size(); paint(); });
    img.src = info.src;
    size();
    fig.classList.toggle('is-flip', !!info.st.flip);
    paint();
    if (cut && box) movePreview(box, pf, info, paint);
}

const previewAr = () => {
    const img = previewPiece?.img;
    return img?.naturalWidth && img?.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
};

/** Live change of where the picture sits in a cut shape (not saved until the gesture ends). */
function nudgeDeco(info, paint, change) {
    const d = cleanDeco({ ...info.st.deco, ...change });
    info.st.deco = d;
    paint();
    redrawPiece(state.borderPid);
    const r = root.querySelector('[data-act="deco-zoom"]');
    if (r) r.value = String(Math.round(d.zoom * 100));
}

/** Drag to move, wheel or two fingers to zoom, on the border preview. */
function movePreview(box, pf, info, paint) {
    const pts = new Map();
    let start = null;
    const begin = () => {
        const d = info.st.deco;
        const list = [...pts.values()];
        start = { fx: d.fx, fy: d.fy, zoom: d.zoom, pts: list.map(p => ({ ...p })), dist: list.length > 1 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0 };
    };
    const end = (e) => {
        if (!pts.delete(e.pointerId)) return;
        if (pts.size) { begin(); return; }
        start = null;
        save();
        applyAllSoon();
    };
    box.addEventListener('pointerdown', (e) => {
        if (pts.size >= 2) return;
        e.preventDefault();
        try { box.setPointerCapture(e.pointerId); } catch { /* old browser */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        begin();
    });
    box.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId) || !start) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const list = [...pts.values()];
        if (list.length > 1 && start.dist > 0) {
            const dist = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
            nudgeDeco(info, paint, { zoom: start.zoom * dist / start.dist });
            return;
        }
        const S = parseFloat(pf.fig.style.width) || pf.fig.clientWidth;
        const cb = coverBox(previewAr(), start.zoom);
        const freeX = S * cb.w / 100 - S, freeY = S * cb.h / 100 - S;
        const dx = (list[0].x - start.pts[0].x) * (info.st.flip ? -1 : 1);
        const dy = list[0].y - start.pts[0].y;
        nudgeDeco(info, paint, {
            fx: freeX > 0.5 ? start.fx - dx / freeX * 100 : start.fx,
            fy: freeY > 0.5 ? start.fy - dy / freeY * 100 : start.fy,
        });
    });
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('lostpointercapture', end);
    box.addEventListener('wheel', (e) => {
        e.preventDefault();
        nudgeDeco(info, paint, { zoom: (info.st.deco.zoom || 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
        save();
    }, { passive: false });
}

/** Where a face usually is: the top part of a tall picture. */
const faceSpot = (ar) => ({ fx: 50, fy: ar && ar < 0.9 ? 12 : 30 });

function setDeco(change) {
    const info = borderInfo();
    if (!info) return;
    const base = info.st.deco || { shape: 'rect', pat: 'solid', color: COLORS[0], width: 'mid', glitter: false, blink: false };
    const next = change === null ? null : { ...base, ...change };
    if (next && !next.glitter) next.blink = false;
    // 0.8.1: switching to a circle, heart or star on a tall picture starts at the top, where the face usually is.
    if (next && change?.shape && isCutShape(next) && !isCutShape(info.st.deco)) {
        const old = cleanDeco(base);
        if (old.fx === 50 && old.fy === 50 && old.zoom === 1 && previewAr() > 0 && previewAr() < 0.9) Object.assign(next, faceSpot(previewAr()));
    }
    info.st.deco = next ? cleanDeco(next) : null;
    save();
    redrawPiece(state.borderPid);
    applyAllSoon();
    render();
}

// ----- ② avatar frame -----

/** Corner radius of the chat's avatar pictures, and whether they are tall rectangles. */
function avatarShape() {
    const img = document.querySelector('#chat .mes .avatar img');
    const r = img ? getComputedStyle(img).borderRadius : '';
    const style = avatarStyle();
    const fallback = { round: '50%', rounded: '10px', square: '2px', rect: '2px' }[style] || '50%';
    return { radius: /^[\d.]+(px|%)$/.test(r) ? r : fallback, tall: style === 'rect' };
}

function viewFrame() {
    const key = activeKey();
    const chatKey = chatAvailable() ? currentScene().chatKey : null;
    let inner;
    if (!key) {
        const sc = currentScene();
        inner = emptyNote(!state.fromSettings && sc.inGroup ? 'group_unsupported' : state.tab === 'char' ? 'no_character' : 'no_persona');
    } else if (!chatKey) {
        inner = `<div class="facets-card"><div class="facets-note">${esc(t('frame_need_chat'))}</div></div>`;
    } else {
        const fr = frameOf(chatKey, key);
        const kind = fr?.kind || 'none';
        const color = fr?.color || state.frameColor;
        const { radius, tall } = avatarShape();
        const pic = thumbOf(key, effectiveOutfit(key, chatKey));
        const scope = '.facets-booth .facets-fwrap';
        let css = '';
        // Same sizes as in style.css (.facets-fav).
        const chipBox = tall ? { x: 0, y: 0, w: 28, h: 42 } : { x: 0, y: 0, w: 34, h: 34 };
        const mainBox = tall ? { x: 0, y: 0, w: 50, h: 75 } : { x: 0, y: 0, w: 62, h: 62 };
        for (const k of FRAME_KINDS) {
            const f = { kind: k, color, blink: !!fr?.blink };
            css += frameCss(`${scope} [data-fk="${k}"]`, `${scope} [data-fk="${k}"] img`, f, radius, chipBox);
        }
        css += frameCss(`${scope} .facets-fmain`, `${scope} .facets-fmain img`, fr, radius, mainBox);
        const av = (attr) => `<span class="facets-fav${tall ? ' is-tall' : ''}" ${attr}><img src="${esc(pic)}" alt="" draggable="false" style="border-radius:${esc(radius)}"></span>`;
        const chips = FRAME_KINDS.map(k => `<button type="button" class="facets-fchip${kind === k ? ' on' : ''}" data-act="frame-kind" data-v="${k}" aria-pressed="${kind === k}" title="${esc(t(`frame_${k}`))}">
            ${av(`data-fk="${k}"`)}<span class="facets-fchip-name">${esc(t(`frame_${k}`))}</span></button>`).join('');
        const fixed = FRAME_FIXED_COLOR.has(kind);
        inner = `<style>${css}</style>
          <div class="facets-fwrap">
            <div class="facets-fstage">
              ${av('').replace('class="facets-fav', 'class="facets-fav facets-fmain')}
              <div class="facets-fmsg"><b>${esc(displayName(key))}</b><span class="facets-fline" aria-hidden="true"></span><span class="facets-fline is-short" aria-hidden="true"></span></div>
            </div>
            <div class="facets-card"><div class="facets-card-title">${esc(t('frame_kind'))}</div><div class="facets-fchips">${chips}</div></div>
            <div class="facets-card"><div class="facets-card-title">${esc(t('border_color'))}</div>${colorSwatches('frame-color', color, fixed)}
              ${fixed ? `<div class="facets-note">${esc(t('border_fixed_color'))}</div>` : ''}</div>
            ${FRAME_BLINK.has(kind) ? `<div class="facets-card">${sw('frame-blink', !!fr?.blink, t('border_blink'), t('border_blink_note'))}</div>` : ''}
            <div class="facets-note">${esc(t('frame_note'))}</div>
          </div>`;
    }
    const body = `${whoPicker()}<div class="facets-stack">${inner}</div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="back">${esc(t('done'))}</button></div>`;
    return [boothHead('frame_title'), body, foot];
}

function setFrameHere(change) {
    const key = activeKey();
    const chatKey = chatAvailable() ? currentScene().chatKey : null;
    if (!key || !chatKey) return;
    const cur = frameOf(chatKey, key);
    if (change.color) state.frameColor = change.color;
    if (change.kind === 'none') setFrame(chatKey, key, null);
    else if (change.kind || cur) setFrame(chatKey, key, { kind: cur?.kind, color: cur?.color || state.frameColor, blink: !!cur?.blink, ...change });
    applyAllSoon();
    render();
}

function saveLayoutFromInput() {
    const key = activeKey();
    const input = root.querySelector('.facets-layout-new');
    if (!key || !input || !chatAvailable()) return;
    const l = saveLayout(key, currentScene().chatKey, input.value);
    if (l) toast('success', t('layout_saved'));
    render();
}

async function loadLayoutHere(id) {
    const key = activeKey();
    if (!key || !chatAvailable()) return;
    const chatKey = currentScene().chatKey;
    if ((pinsOf(chatKey, key).length || frameOf(chatKey, key) || stickersOf(chatKey).length) && !(await confirmBox(t('confirm_layout_load'), t('layout_load')))) return;
    const r = loadLayout(key, chatKey, id);
    applyAllSoon();
    if (r.pins) toast('success', t('layout_loaded', { n: r.pins }));
    else if (r.stickers > 0) toast('success', t('layout_loaded_stickers', { n: r.stickers }));
    else if (r.frame) toast('success', t('layout_loaded_frame'));
    else toast('warning', t('layout_empty'));
    render();
}

/** One line under "Tell the AI": is the look being sent right now, and why not. */
/** What the AI is told about this outfit right now: { text, on, btn } (null when there is nothing to say). */
function aiState(key, chatKey) {
    if (!settings().tellAI || !chatKey) return null;
    const st = tellStatus(key, chatKey);
    const n = settings().tellCount;
    const text = {
        notchat: t('ai_notchat'), default: t('ai_default'), empty: t('ai_empty'),
        always: t('ai_always'), sending: t('ai_sending', { n: st.left }), muted: t('ai_muted'),
        done: t('ai_done', { n }), none: t('ai_none'), auto: t('ai_auto'),
    }[st.kind];
    if (!text) return null;
    const on = st.kind === 'sending' || st.kind === 'always';
    let btn = '';
    if (st.kind === 'sending') btn = `<button type="button" class="facets-btn facets-small" data-act="ai-mute">${esc(t('ai_mute'))}</button>`;
    else if (['muted', 'done', 'none'].includes(st.kind) || st.kind === 'auto') btn = `<button type="button" class="facets-btn facets-small" data-act="ai-again"><i class="fa-solid fa-rotate-right"></i><span>${esc(t('ai_again'))}</span></button>`;
    return { text, on, btn };
}

function viewHistory() {
    const key = activeKey();
    const sc = currentScene();
    const chatKey = chatAvailable() ? sc.chatKey : null;
    const head = headTitle(`${t('history')} · ${displayName(key)}`);
    const tl = chatKey && key ? timelineOf(chatKey, key) : null;
    if (!tl) { state.screen = 'wardrobe'; return viewWardrobe(); }
    const e = getEntity(key);
    const thumb = (mark) => {
        const o = mark === null ? findOutfit(key, e.global) : (mark === DEFAULT_MARK ? null : findOutfit(key, mark));
        return `<div class="facets-hist-thumb"><img src="${esc(o ? urlOf(o.sq || o.orig) : defaultThumb(key))}" alt="" draggable="false"></div>`;
    };
    const all = [...tl.points].reverse();
    const list = state.histMore ? all : all.slice(0, HISTORY_PAGE);
    const icon = (p) => p.src === 'kw' ? '🔑 ' : p.src === 'rnd' ? '🎲 ' : '';
    const more = list.length < all.length
        ? `<button type="button" class="facets-btn facets-wide" data-act="history-more">${esc(t('history_more', { n: all.length - list.length }))}</button>` : '';
    const rows = list.map(p => `<div class="facets-hist-row">
        ${thumb(p.id)}
        <div class="facets-hist-text"><div class="facets-hist-name">${esc(icon(p) + markLabel(key, p.id))}</div><div class="facets-hist-time">${esc(t('history_from', { time: timeLabel(p.t) }))}</div></div>
        <button type="button" class="facets-iconbtn facets-danger-icon" data-act="history-delete" data-t="${p.t}" title="${esc(t('history_delete'))}" aria-label="${esc(t('history_delete'))}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`).join('');
    const base = `<div class="facets-hist-row is-base">
        ${thumb(tl.base)}
        <div class="facets-hist-text"><div class="facets-hist-name">${esc(markLabel(key, tl.base))}</div><div class="facets-hist-time">${esc(t('history_base'))}</div></div>
      </div>`;
    const body = `<div class="facets-stack">${rows}${more}${state.histMore || !more ? base : ''}<div class="facets-note">${esc(t('history_note'))}</div></div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="back">${esc(t('done'))}</button></div>`;
    return [head, body, foot];
}

/** Drawer tabs above the wardrobe grid (only when the entity has drawers). */
function drawerChips(e, drawer) {
    if (!e.drawers.length) return '';
    const chip = (id, label) => `<button type="button" class="facets-chip${drawer === id ? ' on' : ''}" data-act="drawer" data-drawer="${esc(id)}" aria-pressed="${drawer === id}" title="${esc(label)}">${esc(label)}</button>`;
    return `<div class="facets-chips" role="toolbar" aria-label="${esc(t('drawers'))}">
        ${chip('', t('drawer_all'))}${e.drawers.map((d, i) => chip(d.id, drawerLabel(d, i))).join('')}
      </div>`;
}

function addButton(primary = false) {
    return `<label class="facets-btn${primary ? ' facets-primary' : ''}" role="button" tabindex="0" title="${esc(t('add_outfit'))}"><i class="fa-solid fa-plus"></i><span>${esc(t('add_short'))}</span>
        <input type="file" accept="image/*" multiple class="facets-file" data-act="add-files" hidden></label>`;
}

function tileHtml({ key, outfit, index = 0, selected = false, mode }) {
    const isDefault = !outfit;
    const src = isDefault ? defaultThumb(key) : urlOf(outfit.sq || outfit.orig);
    const label = isDefault ? t('default_look') : outfitLabel(outfit, index);
    const paired = outfit?.pair && findOutfit(outfit.pair.key, outfit.pair.id);
    const act = mode === 'wear' ? (isDefault ? 'wear-default' : 'wear') : (isDefault ? '' : 'edit');
    const handle = mode === 'organize' && !isDefault
        ? `<span class="facets-handle" data-drag="${esc(outfit.id)}" title="${esc(t('drag_handle'))}" aria-label="${esc(t('drag_handle'))}"><i class="fa-solid fa-grip-vertical"></i></span>` : '';
    const pen = mode === 'organize' && !isDefault ? `<span class="facets-pen" aria-hidden="true"><i class="fa-solid fa-pen"></i></span>` : '';
    const trash = mode === 'organize' && !isDefault
        ? `<button type="button" class="facets-trash" data-act="delete-tile" data-id="${esc(outfit.id)}" title="${esc(t('delete_outfit'))}" aria-label="${esc(t('delete_outfit'))}"><i class="fa-solid fa-trash-can"></i></button>` : '';
    return `<div class="facets-tile${selected ? ' on' : ''}${isDefault ? ' is-default' : ''}${mode === 'organize' && isDefault ? ' is-locked' : ''}"
        ${outfit ? `data-id="${esc(outfit.id)}"` : ''} ${act ? `data-act="${act}" role="button" tabindex="0"` : ''}
        title="${esc(label)}">
        <div class="facets-thumb"><img src="${esc(src)}" alt="" loading="lazy" draggable="false" onerror="this.closest('.facets-thumb').classList.add('broken')"></div>
        ${isDefault ? `<span class="facets-badge">${esc(t('badge_default'))}</span>` : ''}
        ${selected && mode === 'wear' ? `<span class="facets-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>` : ''}
        ${paired ? `<span class="facets-ring" aria-hidden="true"><i class="fa-solid fa-link"></i></span>` : ''}
        ${handle}${pen}${trash}
        <div class="facets-label">${esc(label)}</div>
      </div>`;
}

function viewOrganize() {
    const key = activeKey();
    const head = headTitle(`${t('organize')} · ${displayName(key)}`);
    if (!key) return [head, emptyNote('no_character'), ''];
    const e = entityFor(key);
    const tiles = [tileHtml({ key, outfit: null, mode: 'organize' })]
        .concat(e.outfits.map((o, i) => tileHtml({ key, outfit: o, index: i, mode: 'organize' })));
    tiles.push(addTile('add_outfit'));
    const body = `<div class="facets-grid facets-organize">${tiles.join('')}</div>`;
    const foot = `<div class="facets-row">${addButton()}
        <button type="button" class="facets-btn" data-act="drawers" title="${esc(t('drawers'))}"><i class="fa-solid fa-box-archive"></i><span>${esc(t('drawers'))}</span></button>
        <button type="button" class="facets-btn facets-primary" data-act="done">${esc(t('done'))}</button></div>`;
    return [head, body, foot];
}

// ---------- leftovers of deleted characters / personas (0.5.0) ----------

/**
 * Stored characters / personas that SillyTavern no longer has.
 * null while SillyTavern's character list is not ready, so nothing is mistaken for deleted.
 */
function findLeftovers() {
    const chars = allCharacters();
    if (!chars.length) return null;
    const haveChar = new Set(chars.map(c => charKey(c.avatar)));
    const personas = allPersonas();
    const havePersona = new Set(personas.map(p => personaKey(p.avatar)));
    const nowPersona = currentPersonaAvatar();
    if (nowPersona) havePersona.add(personaKey(nowPersona));
    const out = { char: [], persona: [], empty: [] };
    for (const [k, e] of Object.entries(settings().entities)) {
        const isChar = isCharKey(k);
        if (isChar ? haveChar.has(k) : (!personas.length || havePersona.has(k))) continue;
        if (!e?.outfits?.length) out.empty.push(k);
        else out[isChar ? 'char' : 'persona'].push(k);
    }
    return out;
}

function leftoverName(key) {
    return getEntity(key)?.name || avatarOfKey(key).replace(/\.[a-z0-9]+$/i, '');
}

function leftoverBar() {
    const left = findLeftovers();
    if (!left) return '';
    const n = left.char.length + left.persona.length;
    const files = n ? 0 : unusedFiles().length;
    if (!n && !files) return '';
    const text = n ? t('left_bar', { n }) : t('left_bar_files', { n: files });
    return `<div class="facets-leftbar">
        <div class="facets-leftbar-text" title="${esc(text)}">${esc(text)}</div>
        <button type="button" class="facets-btn facets-small" data-act="leftovers">${esc(t('left_open'))}</button>
      </div>`;
}

function leftoverRow(key) {
    const e = getEntity(key);
    const o = e.outfits[0];
    const name = leftoverName(key);
    const count = t('left_count', { n: e.outfits.length });
    return `<div class="facets-hist-row facets-left-row">
        <div class="facets-hist-thumb">${o ? `<img src="${esc(urlOf(o.sq || o.orig))}" alt="" loading="lazy" draggable="false">` : ''}</div>
        <div class="facets-hist-text">
          <div class="facets-hist-name" title="${esc(name)}">${esc(name)}</div>
          <div class="facets-hist-time">${esc(count)}</div>
        </div>
        <button type="button" class="facets-btn facets-small" data-act="left-move" data-key="${esc(key)}">${esc(t('left_move'))}</button>
        <button type="button" class="facets-iconbtn facets-danger-icon" data-act="left-delete" data-key="${esc(key)}" title="${esc(t('left_delete'))}" aria-label="${esc(t('left_delete'))}"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;
}

function viewLeftovers() {
    const head = headTitle(t('left_title'));
    const left = findLeftovers();
    const files = left ? unusedFiles() : [];
    const section = (title, keys) => keys.length
        ? `<div class="facets-stitle">${esc(title)}</div>${keys.map(leftoverRow).join('')}` : '';
    let inner = left ? section(t('left_chars'), left.char) + section(t('left_personas'), left.persona) : '';
    if (inner) inner = `<div class="facets-note">${esc(t('left_intro'))}</div>${inner}`;
    if (files.length) {
        inner += `<div class="facets-stitle">${esc(t('left_files'))}</div>
          <div class="facets-hist-row facets-left-row">
            <div class="facets-hist-text">
              <div class="facets-hist-name">${esc(t('left_files_n', { n: files.length }))}</div>
              <div class="facets-hist-time">${esc(t('left_files_note'))}</div>
            </div>
            <button type="button" class="facets-iconbtn facets-danger-icon" data-act="left-files" title="${esc(t('left_delete'))}" aria-label="${esc(t('left_delete'))}"><i class="fa-solid fa-trash-can"></i></button>
          </div>`;
    }
    const body = `<div class="facets-stack">${inner || `<div class="facets-empty facets-empty-inline"><div class="facets-empty-body">${esc(t('left_none'))}</div></div>`}</div>`;
    const foot = inner
        ? `<div class="facets-row"><button type="button" class="facets-btn facets-danger-solid facets-wide" data-act="left-all">${esc(t('left_delete_all'))}</button></div>`
        : '';
    return [head, body, foot];
}

/** Where a leftover can go: same kind, not itself, and no outfits yet. */
function moveTargets(from) {
    const list = isCharKey(from)
        ? allCharacters().map(c => [charKey(c.avatar), c.name])
        : allPersonas().map(p => [personaKey(p.avatar), p.name]);
    const seen = new Set();
    return list.filter(([k]) => {
        if (k === from || seen.has(k) || getEntity(k)?.outfits?.length) return false;
        seen.add(k);
        return true;
    });
}

function viewMove() {
    const from = state.moveFrom;
    const e = getEntity(from);
    if (!e) { state.screen = 'leftovers'; return viewLeftovers(); }
    const head = headTitle(t('move_title'));
    const targets = moveTargets(from);
    const rows = targets.map(([k, name]) => `<div class="facets-hist-row facets-move-row" role="button" tabindex="0" data-act="move-to" data-key="${esc(k)}">
        <div class="facets-hist-thumb"><img src="${esc(defaultThumb(k))}" alt="" loading="lazy" draggable="false"></div>
        <div class="facets-hist-text"><div class="facets-hist-name" title="${esc(name)}">${esc(name)}</div></div>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </div>`).join('');
    const body = `<div class="facets-stack">
        <div class="facets-hist-row is-base">
          <div class="facets-hist-thumb">${e.outfits[0] ? `<img src="${esc(urlOf(e.outfits[0].sq || e.outfits[0].orig))}" alt="" draggable="false">` : ''}</div>
          <div class="facets-hist-text">
            <div class="facets-hist-name">${esc(leftoverName(from))}</div>
            <div class="facets-hist-time">${esc(t('left_count', { n: e.outfits.length }))}</div>
          </div>
        </div>
        <div class="facets-note">${esc(t('move_note'))}</div>
        ${rows || `<div class="facets-empty facets-empty-inline"><div class="facets-empty-body">${esc(t('move_none'))}</div></div>`}
      </div>`;
    return [head, body, ''];
}

async function moveLeftover(toKey) {
    const from = state.moveFrom;
    if (!from || !toKey || !getEntity(from)) return;
    if (!moveTargets(from).some(([k]) => k === toKey)) { toast('warning', t('move_none')); render(); return; }
    const toName = displayName(toKey);
    if (!(await confirmBox(t('confirm_move', { from: leftoverName(from), to: toName }), t('left_move')))) return;
    if (!moveEntity(from, toKey)) { toast('warning', t('move_none')); render(); return; }
    getEntity(toKey, false, toName);
    save();
    state.moveFrom = '';
    state.tab = isCharKey(toKey) ? 'char' : 'persona';
    state.pick[state.tab] = toKey;
    state.drawer = '';
    state.screen = 'wardrobe';
    applyAllSoon();
    toast('success', t('moved', { name: toName }));
    render();
}

/** keys = leftovers to delete (null = all of them); withFiles = also pictures no outfit uses. */
async function deleteLeftovers(keys, withFiles) {
    const left = findLeftovers();
    if (!left) return;
    const all = [...left.char, ...left.persona, ...left.empty];
    let msg;
    if (keys === null) {
        keys = all;
        msg = t('confirm_left_all');
    } else {
        keys = keys.filter(k => all.includes(k)); // only what is really a leftover right now
        if (keys.length) msg = t('confirm_left_delete', { name: leftoverName(keys[0]), n: getEntity(keys[0]).outfits.length });
        else if (withFiles && unusedFiles().length) msg = t('confirm_left_files', { n: unusedFiles().length });
        else { render(); return; }
    }
    if (!(await confirmBox(msg, t('left_delete')))) return;
    await withBusy(async () => {
        const paths = [];
        for (const k of keys) paths.push(...removeEntity(k));
        if (withFiles) paths.push(...unusedFiles());
        let failed = 0;
        for (const p of new Set(paths)) if (!(await deletePath(p))) failed++;
        save();
        applyAllSoon();
        if (failed) toast('warning', t('left_failed', { n: failed }));
        else toast('success', t('left_deleted'));
    });
    render();
}

function viewDrawers() {
    const key = activeKey();
    const head = headTitle(`${t('drawers')} · ${displayName(key)}`);
    if (!key) return [head, emptyNote('no_character'), ''];
    const e = entityFor(key);
    const rows = e.drawers.map((d, i) => {
        const n = e.outfits.filter(o => o.drawers.includes(d.id)).length;
        return `<div class="facets-drawer-row">
            <input type="text" class="facets-input" data-drawer-name="${esc(d.id)}" maxlength="40" value="${esc(d.name)}" placeholder="${esc(drawerLabel(d, i))}" aria-label="${esc(t('drawer_name'))}" autocomplete="off">
            <span class="facets-drawer-count" title="${esc(t('drawer_count', { n }))}">${esc(t('drawer_count', { n }))}</span>
            <button type="button" class="facets-iconbtn facets-danger-icon" data-act="drawer-delete" data-id="${esc(d.id)}" title="${esc(t('drawer_delete'))}" aria-label="${esc(t('drawer_delete'))}"><i class="fa-solid fa-trash-can"></i></button>
          </div>
          <div class="facets-drawer-kw">
            <span class="facets-drawer-kw-icon" title="${esc(t('kw_label'))}" aria-hidden="true">🔑</span>
            <input type="text" class="facets-input" data-drawer-kw="${esc(d.id)}" maxlength="300" value="${esc(d.kw || '')}" placeholder="${esc(t('drawer_kw_ph'))}" aria-label="${esc(t('kw_label'))}" autocomplete="off">
          </div>`;
    }).join('');
    const body = `<div class="facets-stack">
        ${rows || `<div class="facets-empty facets-empty-inline"><div class="facets-empty-body">${esc(t('drawer_none'))}</div></div>`}
        <div class="facets-drawer-row">
          <input type="text" class="facets-input facets-drawer-new" maxlength="40" placeholder="${esc(t('drawer_new_ph'))}" aria-label="${esc(t('drawer_new_ph'))}" autocomplete="off">
          <button type="button" class="facets-btn facets-small" data-act="drawer-add">${esc(t('drawer_add'))}</button>
        </div>
        <div class="facets-note">${esc(t('drawer_hint'))}</div>
      </div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="drawers-done">${esc(t('done'))}</button></div>`;
    return [head, body, foot];
}

function viewEdit() {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o) { state.screen = 'organize'; return viewOrganize(); }
    if (!state.draft) state.draft = { name: o.name, desc: o.desc, kw: o.kw || '', drawers: [...o.drawers] };
    const e = getEntity(key);
    const head = headTitle(t('edit_outfit'));
    const pair = o.pair && findOutfit(o.pair.key, o.pair.id);
    const pairIdx = pair ? getEntity(o.pair.key).outfits.indexOf(pair) : 0;
    const body = `
      <div class="facets-edit">
        <div class="facets-preview${(o.crop?.aspect || 1) < 1 ? ' is-tall' : ''}" style="aspect-ratio:${o.crop?.aspect || 1}" data-act="full" role="button" tabindex="0">
          <img src="${esc(urlOf(o.sq || o.orig))}" alt="" draggable="false">
        </div>
        <div class="facets-row">
          <button type="button" class="facets-btn" data-act="crop" title="${esc(t('crop'))}">${esc(t('crop'))}</button>
          <label class="facets-btn" role="button" tabindex="0" title="${esc(t('replace_image'))}">${esc(t('replace_image'))}
            <input type="file" accept="image/*" data-act="replace-file" hidden></label>
        </div>
        <label class="facets-field">
          <span class="facets-flabel">${esc(t('name_label'))} <small>${esc(t('name_note'))}</small></span>
          <input type="text" class="facets-input" data-field="name" maxlength="60" value="${esc(state.draft.name)}" placeholder="${esc(t('name_ph'))}" autocomplete="off">
        </label>
        <label class="facets-field">
          <span class="facets-flabel">${esc(t('desc_label'))} <small>${esc(t('desc_note'))}</small></span>
          <textarea class="facets-input facets-textarea" data-field="desc" rows="3" maxlength="1000" placeholder="${esc(t('desc_ph'))}">${esc(state.draft.desc)}</textarea>
        </label>
        <label class="facets-field">
          <span class="facets-flabel">${esc(t('kw_label'))} <small>${esc(t('kw_note'))}</small></span>
          <input type="text" class="facets-input" data-field="kw" maxlength="300" value="${esc(state.draft.kw)}" placeholder="${esc(t('kw_ph'))}" autocomplete="off">
        </label>
        <div class="facets-field">
          <span class="facets-flabel">${esc(t('drawers'))} <small>${esc(t('drawer_multi_note'))}</small></span>
          ${e.drawers.length
              ? `<div class="facets-chips facets-chips-wrap">${e.drawers.map((d, i) => {
                  const on = state.draft.drawers.includes(d.id);
                  return `<button type="button" class="facets-chip${on ? ' on' : ''}" data-act="edit-drawer" data-id="${esc(d.id)}" aria-pressed="${on}" title="${esc(drawerLabel(d, i))}">${on ? '<i class="fa-solid fa-check"></i> ' : ''}${esc(drawerLabel(d, i))}</button>`;
              }).join('')}</div>`
              : `<div class="facets-note">${esc(t('drawer_none_edit'))}</div>`}
        </div>
        <div class="facets-field">
          <span class="facets-flabel">${esc(t('pair_label'))}</span>
          <div class="facets-pair">
            <div class="facets-pair-thumb">${pair ? `<img src="${esc(urlOf(pair.sq || pair.orig))}" alt="">` : '<i class="fa-solid fa-link-slash"></i>'}</div>
            <div class="facets-pair-name">${pair ? `${esc(displayName(o.pair.key))} · ${esc(outfitLabel(pair, pairIdx))}` : esc(t('pair_none'))}</div>
            <button type="button" class="facets-btn facets-small" data-act="pair">${esc(t('pair_change'))}</button>
          </div>
          <div class="facets-note">${esc(t(isCharKey(key) ? 'pair_hint_char' : 'pair_hint_persona'))}</div>
        </div>
        <button type="button" class="facets-btn facets-danger facets-wide" data-act="delete-outfit">${esc(t('delete_outfit'))}</button>
      </div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="save-edit">${esc(t('save'))}</button></div>`;
    return [head, body, foot];
}

function viewPair() {
    const key = activeKey();
    const head = headTitle(t('pair_pick_title'));
    const o = findOutfit(key, state.editId);
    if (!o) { state.screen = 'organize'; return viewOrganize(); }
    const otherIsPersona = isCharKey(key);
    const opts = otherIsPersona
        ? allPersonas().map(p => [personaKey(p.avatar), p.name])
        : allCharacters().map(c => [charKey(c.avatar), c.name]);
    const sc = currentScene();
    if (!opts.some(([k]) => k === state.pairTarget)) {
        const pref = o.pair?.key || (otherIsPersona ? sc.personaKey : sc.charKey);
        state.pairTarget = opts.some(([k]) => k === pref) ? pref : (opts[0]?.[0] || '');
    }
    const target = getEntity(state.pairTarget);
    const select = opts.length ? `<select class="facets-select facets-wide" data-act="pair-target">
        ${opts.map(([k, n]) => `<option value="${esc(k)}"${k === state.pairTarget ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select>` : '';
    let grid;
    if (target?.outfits.length) {
        grid = `<div class="facets-grid">${target.outfits.map((x, i) => {
            const on = o.pair?.key === state.pairTarget && o.pair?.id === x.id;
            return `<div class="facets-tile${on ? ' on' : ''}" data-act="pair-pick" data-id="${esc(x.id)}" role="button" tabindex="0" title="${esc(outfitLabel(x, i))}">
                <div class="facets-thumb"><img src="${esc(urlOf(x.sq || x.orig))}" alt="" loading="lazy" draggable="false"></div>
                ${on ? '<span class="facets-check"><i class="fa-solid fa-check"></i></span>' : ''}
                ${x.pair && !(x.pair.key === key && x.pair.id === o.id) ? '<span class="facets-ring"><i class="fa-solid fa-link"></i></span>' : ''}
                <div class="facets-label">${esc(outfitLabel(x, i))}</div></div>`;
        }).join('')}</div>`;
    } else {
        grid = emptyNote('pair_no_targets');
    }
    const body = `<div class="facets-stack">${select}${grid}</div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-wide" data-act="pair-clear"${o.pair ? '' : ' disabled'}>${esc(t('pair_remove'))}</button></div>`;
    return [head, body, foot];
}

function toggleRow(field, label, note = '') {
    const s = settings();
    return `<label class="facets-toggle">
        <span class="facets-toggle-text"><span>${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ''}</span>
        <input type="checkbox" data-setting="${field}"${s[field] ? ' checked' : ''}>
        <span class="facets-switch" aria-hidden="true"></span>
      </label>`;
}

function themePicker() {
    const cur = settings().theme;
    const opt = (id) => `<button type="button" class="facets-themeopt${cur === id ? ' on' : ''}" data-act="theme" data-v="${id}" aria-pressed="${cur === id}">
        <span class="facets-themeprev is-${id}" aria-hidden="true"><span></span><span></span></span>
        <span class="facets-themename">${esc(t(`theme_${id}`))}</span>
        <span class="facets-themenote">${esc(t(`theme_${id}_note`))}</span>
      </button>`;
    return `<div class="facets-themegrid">${THEMES.map(opt).join('')}</div>`;
}

function viewSettings() {
    const head = headTitle(t('settings_title'));
    const body = `
      <div class="facets-stack">
        <div class="facets-section">
          <div class="facets-stitle">${esc(t('show_where'))}</div>
          ${toggleRow('showInChat', t('show_chat'))}
          ${toggleRow('showInList', t('show_list'))}
          ${toggleRow('showStage', t('show_stage'), t('show_stage_note'))}
          ${toggleRow('stageKbHide', t('stage_kb_hide'))}
        </div>
        <div class="facets-section">
          ${toggleRow('tellAI', t('tell_ai'), t('tell_ai_note'))}
          <label class="facets-field">
            <span class="facets-flabel">${esc(t('tell_count'))}</span>
            <select class="facets-select" data-act="tell-count">
              ${[1, 3, 5, 0].map(n => `<option value="${n}"${settings().tellCount === n ? ' selected' : ''}>${esc(n ? t('tell_count_n', { n }) : t('tell_count_always'))}</option>`).join('')}
            </select>
          </label>
          <div class="facets-note">${esc(t('auto_no_tell'))}</div>
        </div>
        <div class="facets-section">
          ${toggleRow('sinceMode', t('since_label'), t('since_note'))}
        </div>
        <div class="facets-section">
          <div class="facets-stitle">${esc(t('auto_title'))}</div>
          ${toggleRow('autoKeywords', t('auto_kw'), t('auto_kw_note'))}
          <label class="facets-field">
            <span class="facets-flabel facets-flabel-stack">${esc(t('ignore_label'))} <small>${esc(t('ignore_note'))}</small></span>
            <textarea class="facets-input facets-textarea" data-setting-text="ignoreWords" rows="2" maxlength="1000">${esc(settings().ignoreWords)}</textarea>
          </label>
          <button type="button" class="facets-btn facets-small" data-act="ignore-reset">${esc(t('ignore_reset'))}</button>
          ${toggleRow('autoPair', t('auto_pair'), t('auto_pair_note'))}
        </div>
        <div class="facets-section">
          <div class="facets-stitle">${esc(t('theme_title'))}</div>
          ${themePicker()}
          <div class="facets-note">${esc(t('theme_note'))}</div>
          <label class="facets-field">
            <span class="facets-flabel">${esc(t('language'))}</span>
            <select class="facets-select" data-act="lang">
              ${LANGUAGES.map(l => `<option value="${l.id}"${l.id === getLanguage() ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="facets-section">
          <div class="facets-stitle">${esc(t('backup'))}</div>
          ${toggleRow('backupImages', t('backup_images'), t('backup_images_note'))}
          <div class="facets-row">
            <button type="button" class="facets-btn" data-act="backup">${esc(t('backup_download'))}</button>
            <label class="facets-btn" role="button" tabindex="0">${esc(t('backup_import'))}
              <input type="file" accept=".json,application/json" data-act="import-file" hidden></label>
          </div>
        </div>
        <div class="facets-section facets-danger-zone">
          <div class="facets-stitle">${esc(t('danger'))}</div>
          <div class="facets-note">${esc(t('cleanup_note'))}</div>
          <button type="button" class="facets-btn facets-danger-solid facets-wide" data-act="cleanup">${esc(t('cleanup'))}</button>
        </div>
        <div class="facets-version">Facets ${esc(t('version', { v: VERSION }))}</div>
      </div>`;
    return [head, body, ''];
}

// ---------- crop ----------
// state.crop = { img, crop, mode: 'recrop' | 'add' | 'replace', queue?: { key, items, index, added } }

function viewCrop() {
    const c = state.crop;
    const q = c?.queue;
    const count = q && q.items.length > 1 ? ` ${q.index + 1}/${q.items.length}` : '';
    const head = headTitle(t('crop_title') + count);
    const aspect = c?.crop.aspect || 1;
    const guide = avatarStyle();
    const body = `<div class="facets-crop">
        <div class="facets-crop-stage${aspect < 1 ? ' is-tall' : ''}" style="aspect-ratio:${aspect}">
          <img class="facets-crop-img" alt="" draggable="false">
          <div class="facets-crop-frame guide-${guide}"></div>
        </div>
        <div class="facets-note">${esc(t('crop_hint'))}</div>
        <div class="facets-zoom">
          <button type="button" class="facets-iconbtn" data-act="zoom-out" title="${esc(t('zoom_out'))}" aria-label="${esc(t('zoom_out'))}"><i class="fa-solid fa-minus"></i></button>
          <input type="range" class="facets-range" min="0" max="1000" step="1" data-act="zoom" aria-label="${esc(t('zoom'))}">
          <button type="button" class="facets-iconbtn" data-act="zoom-in" title="${esc(t('zoom_in'))}" aria-label="${esc(t('zoom_in'))}"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>`;
    const skip = c?.mode === 'add'
        ? `<button type="button" class="facets-btn" data-act="crop-skip" title="${esc(t('skip'))}">${esc(t('skip'))}</button>` : '';
    const foot = `<div class="facets-row">
        <button type="button" class="facets-btn" data-act="crop-reset" title="${esc(t('reset'))}">${esc(t('reset'))}</button>
        ${skip}
        <button type="button" class="facets-btn facets-primary" data-act="crop-apply" title="${esc(t('apply'))}">${esc(t('apply'))}</button>
      </div>`;
    return [head, body, foot];
}

const ZMIN = 0.5;
function zmax() {
    const c = state.crop;
    if (!c) return 4;
    const cover = coverScale(c.img.naturalWidth, c.img.naturalHeight, c.crop.aspect || 1);
    return Math.max(4, cover * 3);
}
function scaleToRange(s) { return Math.round(Math.log(s / ZMIN) / Math.log(zmax() / ZMIN) * 1000); }
function rangeToScale(v) { return ZMIN * Math.pow(zmax() / ZMIN, v / 1000); }

function mountCrop() {
    const c = state.crop;
    if (!c?.img) return;
    const imgEl = root.querySelector('.facets-crop-img');
    imgEl.src = c.img.src;
    root.querySelector('.facets-range').value = String(scaleToRange(c.crop.scale));
    drawCrop();
}

function stageSize() {
    const stage = root?.querySelector('.facets-crop-stage');
    return stage ? { W: stage.clientWidth || 1, H: stage.clientHeight || 1 } : null;
}

function drawCrop() {
    const c = state.crop;
    const imgEl = root?.querySelector('.facets-crop-img');
    const st = stageSize();
    if (!c || !imgEl || !st) return;
    const { W, H } = st;
    const w = c.img.naturalWidth, h = c.img.naturalHeight;
    const fit = Math.min(W / w, H / h);
    const dw = w * fit * c.crop.scale, dh = h * fit * c.crop.scale;
    imgEl.style.width = `${dw}px`;
    imgEl.style.height = `${dh}px`;
    imgEl.style.left = `${(W - dw) / 2 + c.crop.x * W}px`;
    imgEl.style.top = `${(H - dh) / 2 + c.crop.y * H}px`;
}

function setScale(s) {
    const c = state.crop;
    c.crop.scale = Math.min(zmax(), Math.max(ZMIN, s));
    const r = root.querySelector('.facets-range');
    if (r) r.value = String(scaleToRange(c.crop.scale));
    drawCrop();
}

function freshCrop(img) {
    return autoCrop(img.naturalWidth, img.naturalHeight, avatarAspect());
}

/** Re-crop an outfit that is already saved. */
async function openCrop() {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o) return;
    await withBusy(async () => {
        const img = await loadImage(urlOf(o.orig || o.sq));
        const aspect = avatarAspect();
        // Keep the old position only if the frame shape is the same.
        const crop = o.crop && (o.crop.aspect || 1) === aspect ? { ...o.crop, aspect } : freshCrop(img);
        state.crop = { img, crop, mode: 'recrop' };
        state.screen = 'crop';
    }, () => toast('error', t('load_failed')));
    render();
}

/** Read the chosen files in the browser (nothing is uploaded yet). */
async function readPicked(files) {
    const items = [];
    for (const file of files) {
        if (file.type && !file.type.startsWith('image/')) { toast('warning', t('not_image', { name: file.name })); continue; }
        try {
            const data = await readAsDataURL(file);
            const img = await loadImage(data);
            items.push({ name: (file.name || '').replace(/\.[^.]+$/, '').slice(0, 60), fileName: file.name, data, img });
        } catch {
            toast('error', t('not_image', { name: file.name }));
        }
    }
    return items;
}

/** "Add outfits": crop each picture first, one after another. */
async function addFiles(files) {
    const key = activeKey();
    if (!key || !files?.length) return;
    let items = [];
    await withBusy(async () => { items = await readPicked([...files]); });
    if (!items.length) return;
    const from = state.screen === 'wardrobe' ? 'wardrobe' : 'organize';
    // Added from a drawer tab in the wardrobe: the new outfits go into that drawer.
    const drawer = from === 'wardrobe' ? state.drawer : '';
    state.crop = { img: items[0].img, crop: freshCrop(items[0].img), mode: 'add', queue: { key, items, index: 0, added: 0, from, drawer } };
    state.screen = 'crop';
    render();
}

/** "Replace image": crop the new picture first. Going back cancels; nothing is uploaded. */
async function replaceImage(file) {
    const key = activeKey();
    if (!findOutfit(key, state.editId) || !file) return;
    let items = [];
    await withBusy(async () => { items = await readPicked([file]); });
    if (!items.length) return;
    state.crop = { img: items[0].img, crop: freshCrop(items[0].img), mode: 'replace', queue: { key, items, index: 0, added: 0 } };
    state.screen = 'crop';
    render();
}

async function uploadNewOutfit(key, item, crop, drawer = '') {
    const e = entityFor(key);
    const id = newId();
    const orig = await uploadDataURL(item.data, folderFor(key), id);
    try {
        const sq = await uploadDataURL(renderCrop(item.img, crop), folderFor(key), `${id}_sq`);
        const drawers = drawer && e.drawers.some(d => d.id === drawer) ? [drawer] : [];
        e.outfits.push({ id, name: item.name, desc: '', orig, sq, crop: { ...crop }, pair: null, drawers });
        save();
    } catch (err) {
        await deletePath(orig);
        throw err;
    }
}

/** Add the current picture (with the given crop) and move to the next one. */
async function queueStep(useCrop) {
    const c = state.crop;
    const q = c?.queue;
    if (!q) return;
    const item = q.items[q.index];
    await withBusy(async () => {
        try {
            await uploadNewOutfit(q.key, item, useCrop || freshCrop(item.img), q.drawer);
            q.added++;
        } catch (err) {
            console.error('[Facets]', err);
            toast('error', t('upload_failed', { name: item.fileName || item.name }));
        }
    });
    q.index++;
    if (q.index < q.items.length) {
        const next = q.items[q.index];
        state.crop = { img: next.img, crop: freshCrop(next.img), mode: 'add', queue: q };
    } else {
        finishQueue();
    }
    render();
}

/** Back / close while adding: keep every picture already chosen, using the automatic crop. */
async function finishQueueAuto() {
    const q = state.crop?.queue;
    if (!q || state.crop.mode !== 'add') return;
    await withBusy(async () => {
        while (q.index < q.items.length) {
            const item = q.items[q.index];
            try { await uploadNewOutfit(q.key, item, freshCrop(item.img), q.drawer); q.added++; } catch (err) {
                console.error('[Facets]', err);
                toast('error', t('upload_failed', { name: item.fileName || item.name }));
            }
            q.index++;
        }
    });
    finishQueue();
}

function finishQueue() {
    const q = state.crop?.queue;
    if (q?.added) toast('success', t('added', { n: q.added }));
    state.crop = null;
    state.screen = q?.from || 'organize';
    applyAllSoon();
}

async function applyCrop() {
    const c = state.crop;
    if (!c) return;
    if (c.mode === 'add') return queueStep({ ...c.crop });
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o) return;
    if (c.mode === 'replace') {
        const item = c.queue.items[0];
        await withBusy(async () => {
            const id = newId();
            const orig = await uploadDataURL(item.data, folderFor(key), `${o.id}_${id}`);
            let sq;
            try {
                sq = await uploadDataURL(renderCrop(item.img, c.crop), folderFor(key), `${o.id}_${id}_sq`);
            } catch (err) { await deletePath(orig); throw err; }
            const old = [o.orig, o.sq];
            Object.assign(o, { orig, sq, crop: { ...c.crop } });
            save();
            let failed = false;
            for (const p of old) if (p && !(await deletePath(p))) failed = true;
            save();
            if (failed) toast('warning', t('delete_failed'));
            state.crop = null;
            state.screen = 'edit';
            applyAllSoon();
            toast('success', t('saved'));
        }, () => toast('error', t('upload_failed', { name: item.fileName || item.name })));
        render();
        return;
    }
    await withBusy(async () => {
        const oldSq = o.sq;
        const path = await uploadDataURL(renderCrop(c.img, c.crop), folderFor(key), `${o.id}_sq_${newId()}`);
        o.sq = path;
        o.crop = { ...c.crop };
        save();
        if (oldSq && oldSq !== o.orig && !(await deletePath(oldSq))) toast('warning', t('delete_failed'));
        save();
        state.crop = null;
        state.screen = 'edit';
        applyAllSoon();
        toast('success', t('saved'));
    }, () => toast('error', t('upload_failed', { name: o.name || '' })));
    render();
}

// ---------- drag to reorder (organize mode only, by the handle) ----------

let drag = null;

function onPointerDown(e) {
    const handle = e.target.closest('[data-drag]');
    if (!handle || state.screen !== 'organize') return;
    const tile = handle.closest('.facets-tile');
    if (!tile) return;
    e.preventDefault();
    endDrag();
    drag = { id: handle.dataset.drag, tile, pointerId: e.pointerId };
    tile.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    window.addEventListener('pagehide', endDrag);
    document.addEventListener('visibilitychange', onVisibility);
}

function onVisibility() { if (document.hidden) finishDrag(); }

function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    const grid = drag.tile.parentElement;
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.facets-tile[data-id]');
    if (under && under !== drag.tile && under.parentElement === grid) {
        const tiles = [...grid.children];
        const a = tiles.indexOf(drag.tile), b = tiles.indexOf(under);
        grid.insertBefore(drag.tile, a < b ? under.nextSibling : under);
    }
    // Scroll the list when dragging near the edges.
    const body = root.querySelector('.facets-body');
    const r = body.getBoundingClientRect();
    if (e.clientY < r.top + 40) body.scrollTop -= 12;
    else if (e.clientY > r.bottom - 40) body.scrollTop += 12;
}

function onDragUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    finishDrag();
}

/** Drop wherever it is now and save the order. */
function finishDrag() {
    if (!drag) return;
    const grid = drag.tile.parentElement;
    const ids = grid ? [...grid.querySelectorAll('.facets-tile[data-id]')].map(x => x.dataset.id) : [];
    const key = activeKey();
    const e = getEntity(key);
    if (e && ids.length === e.outfits.length) {
        const map = new Map(e.outfits.map(o => [o.id, o]));
        const next = ids.map(id => map.get(id)).filter(Boolean);
        if (next.length === e.outfits.length) { e.outfits = next; save(); }
    }
    endDrag();
    render();
}

function endDrag() {
    if (drag) drag.tile?.classList.remove('dragging');
    drag = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', endDrag);
    window.removeEventListener('blur', endDrag);
    window.removeEventListener('pagehide', endDrag);
    document.removeEventListener('visibilitychange', onVisibility);
}

// crop dragging/pinch
let cropPointers = new Map();
let cropStart = null;
function attachCropGestures() {
    document.addEventListener('pointerdown', (e) => {
        const stage = e.target.closest?.('#facets_root .facets-crop-stage');
        if (!stage || !state.crop) return;
        e.preventDefault();
        cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        cropStart = snapshotCrop(stage);
    });
    document.addEventListener('pointermove', (e) => {
        if (!cropPointers.has(e.pointerId) || !state.crop) return;
        cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const stage = root.querySelector('.facets-crop-stage');
        if (!stage || !cropStart) return;
        const W = stage.clientWidth || 1, H = stage.clientHeight || 1;
        const pts = [...cropPointers.values()];
        const c = state.crop.crop;
        if (pts.length >= 2 && cropStart.dist) {
            const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            c.scale = Math.min(zmax(), Math.max(ZMIN, cropStart.scale * d / cropStart.dist));
            const r = root.querySelector('.facets-range');
            if (r) r.value = String(scaleToRange(c.scale));
        } else {
            c.x = cropStart.x + (pts[0].x - cropStart.px) / W;
            c.y = cropStart.y + (pts[0].y - cropStart.py) / H;
        }
        drawCrop();
    });
    const up = (e) => {
        if (!cropPointers.delete(e.pointerId)) return;
        const stage = root?.querySelector('.facets-crop-stage');
        cropStart = cropPointers.size && stage ? snapshotCrop(stage) : null;
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => { cropPointers.clear(); cropStart = null; });
    document.addEventListener('wheel', (e) => {
        if (!state.crop || !e.target.closest?.('#facets_root .facets-crop-stage')) return;
        e.preventDefault();
        setScale(state.crop.crop.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });
}

function snapshotCrop() {
    const pts = [...cropPointers.values()];
    const c = state.crop.crop;
    return {
        x: c.x, y: c.y, scale: c.scale,
        px: pts[0]?.x ?? 0, py: pts[0]?.y ?? 0,
        dist: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
    };
}

// ---------- actions ----------

async function withBusy(fn, onError) {
    if (state.busy) { toast('info', t('busy')); return; }
    state.busy = true;
    root?.querySelector('.facets-sheet')?.classList.add('facets-busy');
    try { await fn(); } catch (err) { console.error('[Facets]', err); onError?.(err); } finally {
        state.busy = false;
        root?.querySelector('.facets-sheet')?.classList.remove('facets-busy');
    }
}

async function confirmBox(text, okText) {
    const c = ctx();
    if (c.callGenericPopup && c.POPUP_TYPE) {
        const r = await c.callGenericPopup(esc(text), c.POPUP_TYPE.CONFIRM, '', { okButton: okText || t('delete'), cancelButton: t('cancel') });
        return Number(r) >= 1;
    }
    return globalThis.confirm(text);
}

function wear(outfitId) {
    const key = activeKey();
    if (!key) return;
    const scope = scopeNow();
    choose(key, outfitId, scope, chatAvailable() ? currentScene().chatKey : null,
        { since: scope === 'chat' && settings().sinceMode });
    applyAllSoon();
    render();
}

async function deleteOutfit(id = state.editId) {
    const key = activeKey();
    const e = getEntity(key);
    const o = findOutfit(key, id);
    if (!o || !e) return;
    const name = outfitLabel(o, e.outfits.indexOf(o));
    if (!(await confirmBox(t('confirm_delete_outfit', { name }), t('delete')))) return;
    await withBusy(async () => {
        const files = [o.orig, o.sq].filter(Boolean);
        forgetOutfit(key, o.id);
        save();
        let failed = false;
        for (const p of files) if (!(await deletePath(p))) failed = true;
        save();
        if (failed) toast('warning', t('delete_failed'));
        state.editId = null;
        state.draft = null;
        state.screen = 'organize';
        applyAllSoon();
    });
    render();
}

function showFull() {
    const o = findOutfit(activeKey(), state.editId);
    if (!o) return;
    const div = document.createElement('div');
    div.className = 'facets-full';
    div.dataset.act = 'full-close';
    div.innerHTML = `<img src="${esc(urlOf(o.orig || o.sq))}" alt="" draggable="false">
      <button type="button" class="facets-iconbtn facets-close" data-act="full-close" aria-label="${esc(t('close'))}"><i class="fa-solid fa-xmark"></i></button>`;
    root.appendChild(div);
}

function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    if (e.target.closest('[data-drag]')) return; // the drag handle never opens the editor
    const act = el.dataset.act;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    if (state.busy && act !== 'full-close') { toast('info', t('busy')); return; }
    switch (act) {
        case 'close': requestClose(); break;
        case 'back': back(); break;
        case 'tab': state.tab = el.dataset.tab; state.drawer = ''; state.screen = 'wardrobe'; render(); break;
        case 'drawer': state.drawer = el.dataset.drawer || ''; render(); break;
        case 'history': state.screen = 'history'; state.histMore = false; render(); break;
        case 'leftovers': state.screen = 'leftovers'; render(); break;
        case 'left-move': state.moveFrom = el.dataset.key || ''; state.screen = 'move'; render(); break;
        case 'move-to': moveLeftover(el.dataset.key); break;
        case 'left-delete': deleteLeftovers([el.dataset.key], false); break;
        case 'left-files': deleteLeftovers([], true); break;
        case 'left-all': deleteLeftovers(null, true); break;
        case 'history-more': state.histMore = true; render(); break;
        case 'dice': {
            const key = activeKey();
            const e = key && getEntity(key);
            if (!e) break;
            const o = rollDice(key, currentDrawer(e));
            if (!o) toast('info', t('dice_none'));
            applyAllSoon(); render(); break;
        }
        case 'ignore-reset': settings().ignoreWords = DEFAULT_IGNORE; save(); render(); break;
        case 'history-delete': removePoint(Number(el.dataset.t)); break;
        case 'ai-mute': muteTell(currentScene().chatKey, activeKey()); applyAllSoon(); render(); break;
        case 'more': settings().moreOpen = !settings().moreOpen; save(); render(); break;
        case 'ai-again': tellAgain(currentScene().chatKey, activeKey()); applyAllSoon(); render(); break;
        case 'drawers': state.screen = 'drawers'; render(); break;
        case 'drawers-done': state.screen = 'organize'; render(); break;
        case 'drawer-add': addDrawerFromInput(); break;
        case 'drawer-delete': removeDrawer(el.dataset.id); break;
        case 'edit-drawer': {
            if (!state.draft) break;
            const id = el.dataset.id;
            const list = state.draft.drawers;
            state.draft.drawers = list.includes(id) ? list.filter(x => x !== id) : list.concat(id);
            render(); break;
        }
        case 'settings': state.settingsFrom = state.screen; state.screen = 'settings'; render(); break;
        case 'booth': state.screen = 'booth'; render(); break;
        case 'go-wardrobe': state.screen = 'wardrobe'; render(); break;
        case 'theme': {
            const v = el.dataset.v;
            if (!THEMES.includes(v) || settings().theme === v) break;
            settings().theme = v;
            save();
            render();
            document.dispatchEvent(new CustomEvent('facets:theme'));
            break;
        }
        case 'room': state.roomFrom = 'wardrobe'; state.roomTab = 'outfits'; state.screen = 'room'; render(); break;
        case 'booth-go':
            // 0.10.0: the Stickers card opens "Decorate the chat" on its Stickers tab.
            if (el.dataset.to === 'room' || el.dataset.to === 'stickers') {
                state.roomFrom = 'booth';
                state.roomTab = el.dataset.to === 'stickers' ? 'stickers' : 'outfits';
                state.stickerEdit = false;
            }
            state.screen = el.dataset.to === 'frame' ? 'frame' : 'room';
            render(); break;
        case 'stage-on-btn': case 'stage-off': {
            const key = activeKey();
            if (!key) break;
            entityFor(key);
            const st = stageOf(key, true);
            st.on = act === 'stage-on-btn';
            if (st.on) st.hidden = false; // putting it in always shows it
            save(); applyAllSoon(); render(); break;
        }
        case 'stage-flip-btn': {
            const key = activeKey();
            if (!key) break;
            entityFor(key);
            const st = stageOf(key, true);
            st.flip = !st.flip;
            save(); applyAllSoon(); render(); break;
        }
        case 'booth-who': state.tab = el.dataset.tab === 'persona' ? 'persona' : 'char'; render(); break;
        case 'room-tab': state.roomTab = el.dataset.tab === 'stickers' ? 'stickers' : 'outfits'; state.stickerEdit = false; render(); break;
        case 'border': {
            const pid = el.dataset.pid || '';
            if (pid && !pid.includes('\n')) { entityFor(pid); stageOf(pid, true); }
            if (pid && pieceInfo(pid)) { state.borderPid = pid; state.screen = 'border'; }
            render(); break;
        }
        case 'stk-look': if (LOOKS.includes(el.dataset.v)) { settings().stickerLook = el.dataset.v; save(); } render(); break;
        case 'stk-add': stickHere(el.dataset.kind === 'mine' ? 'mine' : 'basic', el.dataset.ref); break;
        case 'stk-remove': if (chatAvailable()) { removeSticker(currentScene().chatKey, el.dataset.id); applyAllSoon(); } render(); break;
        case 'stk-edit': state.stickerEdit = !state.stickerEdit; render(); break;
        case 'stk-del': deleteMySticker(el.dataset.id); break;
        case 'stk-piece-look': if (LOOKS.includes(el.dataset.v)) setStickerLook({ look: el.dataset.v }); break;
        case 'deco': setDeco({ [el.dataset.k]: el.dataset.v }); break;
        case 'deco-color': setDeco({ color: el.dataset.v }); break;
        case 'deco-none': setDeco(null); break;
        case 'deco-zoom-step': {
            const z = borderInfo()?.st.deco?.zoom || 1;
            setDeco({ zoom: Math.round((z + Number(el.dataset.dir) * 0.15) * 100) / 100 });
            break;
        }
        case 'deco-center': setDeco({ fx: 50, fy: 50, zoom: 1 }); break;
        case 'deco-face': setDeco(faceSpot(previewAr())); break;
        case 'frame-kind': setFrameHere({ kind: el.dataset.v }); break;
        case 'frame-color': setFrameHere({ color: el.dataset.v }); break;
        case 'stage-turn': {
            const key = activeKey();
            if (key) { stageOf(key, true); turnPiece(key, Number(el.dataset.dir) || 1); applyAllSoon(); }
            render(); break;
        }
        case 'pin-turn': {
            const key = activeKey();
            if (key && chatAvailable()) { turnPiece(`${key}\n${el.dataset.pin}`, 1); applyAllSoon(); }
            render(); break;
        }
        case 'stage-show': case 'stage-unlock': {
            const st = stageOf(activeKey());
            if (st) { if (act === 'stage-show') st.hidden = false; else st.locked = false; save(); applyAllSoon(); }
            render(); break;
        }
        case 'pin-add': {
            const key = activeKey();
            if (key && chatAvailable()) {
                if (!addPin(currentScene().chatKey, key, el.dataset.id)) toast('warning', t('pin_full', { max: MAX_PINS }));
                applyAllSoon();
            }
            render(); break;
        }
        case 'pin-remove': case 'pin-flip': {
            const key = activeKey();
            if (key && chatAvailable()) {
                const chatKey = currentScene().chatKey;
                if (act === 'pin-remove') removePin(chatKey, key, el.dataset.pin, true);
                else {
                    const pin = pinsOf(chatKey, key).find(p => p.id === el.dataset.pin);
                    if (pin) { pin.flip = !pin.flip; save(); }
                }
                applyAllSoon();
            }
            render(); break;
        }
        case 'layout-save': saveLayoutFromInput(); break;
        case 'layout-load': loadLayoutHere(el.dataset.id); break;
        case 'layout-delete': {
            const key = activeKey();
            const l = layoutsOf(key).find(x => x.id === el.dataset.id);
            if (l) {
                const i = layoutsOf(key).indexOf(l);
                confirmBox(t('confirm_layout_delete', { name: l.name || t('layout_n', { n: i + 1 }) }), t('delete'))
                    .then(ok => { if (ok) { deleteLayout(key, l.id); render(); } });
            }
            break;
        }
        case 'stage-reset': {
            const key = activeKey();
            if (key) { resetPlace(key); applyAllSoon(); toast('success', t('stage_reset_done')); }
            break;
        }
        case 'scope': state.scope = el.dataset.scope; render(); break;
        case 'wear': wear(el.dataset.id); break;
        case 'wear-default': wear(null); toast('success', t('reverted')); break;
        case 'organize': state.screen = 'organize'; render(); break;
        case 'done': state.screen = 'wardrobe'; render(); break;
        case 'edit': state.editId = el.dataset.id; state.draft = null; state.screen = 'edit'; render(); break;
        case 'full': showFull(); break;
        case 'full-close': root.querySelector('.facets-full')?.remove(); break;
        case 'crop': openCrop(); break;
        case 'crop-apply': applyCrop(); break;
        case 'crop-reset': if (state.crop) { state.crop.crop = freshCrop(state.crop.img); setScale(state.crop.crop.scale); } break;
        case 'crop-skip': queueStep(null); break;
        case 'zoom-in': if (state.crop) setScale(state.crop.crop.scale * 1.15); break;
        case 'zoom-out': if (state.crop) setScale(state.crop.crop.scale / 1.15); break;
        case 'pair': state.pairTarget = ''; state.screen = 'pair'; render(); break;
        case 'pair-pick': {
            setPair(activeKey(), state.editId, state.pairTarget, el.dataset.id);
            save(); state.screen = 'edit'; render(); break;
        }
        case 'pair-clear': setPair(activeKey(), state.editId, null, null); save(); state.screen = 'edit'; render(); break;
        case 'save-edit': {
            const o = findOutfit(activeKey(), state.editId);
            if (o && state.draft) {
                o.name = state.draft.name.trim();
                o.desc = state.draft.desc.trim();
                o.kw = cleanKeywords(state.draft.kw);
                const ids = new Set((getEntity(activeKey())?.drawers || []).map(d => d.id));
                o.drawers = (state.draft.drawers || []).filter(id => ids.has(id));
                save();
                applyAllSoon();
                toast('success', t('saved'));
            }
            state.draft = null; state.screen = 'organize'; render(); break;
        }
        case 'delete-outfit': deleteOutfit(); break;
        case 'delete-tile': deleteOutfit(el.dataset.id); break;
        case 'backup': withBusy(() => exportBackup(toast)); break;
        case 'cleanup': runCleanup(); break;
    }
}

async function removePoint(time) {
    const key = activeKey();
    const chatKey = currentScene().chatKey;
    const p = timelineOf(chatKey, key)?.points.find(x => x.t === time);
    if (!p) return;
    if (!(await confirmBox(t('confirm_history_delete', { name: markLabel(key, p.id), time: timeLabel(p.t) }), t('delete')))) return;
    deletePoint(chatKey, key, time);
    applyAllSoon();
    render();
}

function addDrawerFromInput() {
    const key = activeKey();
    const input = root.querySelector('.facets-drawer-new');
    if (!key || !input) return;
    // An empty name is fine: it shows as "Drawer N" until renamed.
    addDrawer(key, input.value);
    save();
    render();
    root.querySelector('.facets-drawer-new')?.focus();
}

async function removeDrawer(id) {
    const key = activeKey();
    const e = getEntity(key);
    const i = e?.drawers.findIndex(d => d.id === id) ?? -1;
    if (i < 0) return;
    if (!(await confirmBox(t('confirm_drawer_delete', { name: drawerLabel(e.drawers[i], i) }), t('delete')))) return;
    deleteDrawer(key, id);
    if (state.drawer === id) state.drawer = '';
    save();
    render();
}

async function runCleanup() {
    if (!(await confirmBox(t('confirm_cleanup'), t('cleanup')))) return;
    await withBusy(async () => {
        await cleanupAll(toast);
        applyAllSoon();
    });
    render();
}

function onChange(e) {
    const el = e.target;
    const act = el.dataset.act;
    if (el.dataset.drawerKw) {
        setDrawerKeywords(activeKey(), el.dataset.drawerKw, el.value);
        save();
        return;
    }
    if (el.dataset.settingText) {
        settings()[el.dataset.settingText] = String(el.value || '').slice(0, 1000);
        save();
        return;
    }
    if (act === 'deco-glitter' || act === 'deco-blink') {
        setDeco(act === 'deco-glitter' ? { glitter: el.checked } : { blink: el.checked });
        return;
    }
    if (act === 'deco-color' && el.type === 'color') { setDeco({ color: el.value }); return; }
    if (act === 'stk-spark') { settings().stickerSpark = el.checked; save(); render(); return; }
    if (act === 'stk-piece-spark') { setStickerLook({ spark: el.checked }); return; }
    if (act === 'stk-upload') { const f = el.files; uploadStickers(f).finally(() => { el.value = ''; }); return; }
    if (act === 'deco-zoom') { save(); applyAllSoon(); return; }
    if (act === 'frame-color' && el.type === 'color') { setFrameHere({ color: cleanColor(el.value) }); return; }
    if (act === 'frame-blink') { setFrameHere({ blink: el.checked }); return; }
    if (act === 'stage-on' || act === 'stage-flip') {
        const key = activeKey();
        if (!key) return;
        entityFor(key);
        const st = stageOf(key, true);
        if (act === 'stage-on') {
            st.on = el.checked;
            if (st.on) st.hidden = false; // turning it on always shows it
        } else st.flip = el.checked;
        save();
        applyAllSoon();
        render();
        return;
    }
    if (act === 'random') {
        const key = activeKey();
        const e = key && getEntity(key);
        const chatKey = currentScene().chatKey;
        if (e && chatKey) setRandom(chatKey, key, el.checked ? currentDrawer(e) : null);
        render();
        return;
    }
    if (el.dataset.layoutName) {
        renameLayout(activeKey(), el.dataset.layoutName, el.value);
        return;
    }
    if (el.dataset.drawerName) {
        renameDrawer(activeKey(), el.dataset.drawerName, el.value);
        save();
        return;
    }
    if (el.dataset.setting) {
        settings()[el.dataset.setting] = el.checked;
        save();
        applyAllSoon();
        if (state.screen === 'wardrobe') render();
        return;
    }
    switch (act) {
        case 'entity':
            if (state.tab === 'char') state.pick.char = el.value; else state.pick.persona = el.value;
            state.drawer = '';
            render(); break;
        case 'pair-target': state.pairTarget = el.value; render(); break;
        case 'tell-count': settings().tellCount = Number(el.value); save(); applyAllSoon(); break;
        case 'lang':
            chooseLang(el.value); setLanguage(el.value); render();
            document.dispatchEvent(new CustomEvent('facets:lang'));
            break;
        case 'add-files': { const f = el.files; addFiles(f).finally(() => { el.value = ''; }); break; }
        case 'replace-file': { const f = el.files?.[0]; replaceImage(f).finally(() => { el.value = ''; }); break; }
        case 'import-file': {
            const f = el.files?.[0];
            el.value = '';
            if (!f) break;
            (async () => {
                if (!(await confirmBox(t('confirm_import'), t('backup_import')))) return;
                await withBusy(() => importBackup(f, toast));
                applyAllSoon();
                render();
            })();
            break;
        }
    }
}

function onInput(e) {
    const el = e.target;
    if (el.dataset.field && state.draft) state.draft[el.dataset.field] = el.value;
    if (el.dataset.act === 'zoom' && state.crop) setScale(rangeToScale(Number(el.value)));
    if (el.dataset.act === 'deco-zoom') {
        const info = borderInfo();
        const f = previewPiece;
        if (info?.st.deco && f) nudgeDeco(info, () => paintPiece(f, info.st.deco, { size: parseFloat(f.fig.style.width), src: info.src }), { zoom: Number(el.value) / 100 });
    }
}

// keyboard: Enter/Space on role=button tiles and labels
document.addEventListener('keydown', (e) => {
    if (!state.open || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target;
    if (e.key === 'Enter' && el?.classList?.contains('facets-drawer-new')) { e.preventDefault(); addDrawerFromInput(); return; }
    if (e.key === 'Enter' && el?.classList?.contains('facets-layout-new')) { e.preventDefault(); saveLayoutFromInput(); return; }
    if (e.key === 'Enter' && el?.dataset?.layoutName) { e.preventDefault(); el.blur(); return; }
    if (e.key === 'Enter' && (el?.dataset?.drawerName || el?.dataset?.drawerKw)) { e.preventDefault(); el.blur(); return; }
    if (!root?.contains(el) || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    if (el.getAttribute('role') === 'button') { e.preventDefault(); el.click(); }
});

attachCropGestures();
document.addEventListener('facets:stage', () => { if (state.open && !state.busy && ['room', 'border'].includes(state.screen)) render(); });

export function _stateForTest() { return state; }
export { currentPersonaAvatar };
