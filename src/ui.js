// The wardrobe window: ① wardrobe ② organize ③ edit one outfit ④ settings, plus crop and pair pickers.

import { t, LANGUAGES, setLanguage, getLanguage } from './i18n.js';
import {
    ctx, settings, save, getEntity, findOutfit, choose, chatChoice, effectiveOutfit,
    forgetOutfit, setPair, newId, charKey, personaKey, isCharKey, avatarOfKey, DEFAULT_MARK,
} from './store.js';
import {
    urlOf, folderFor, readAsDataURL, loadImage, uploadDataURL, deletePath, autoCrop, renderCrop,
} from './images.js';
import { currentScene, personaName, applyAllSoon, currentPersonaAvatar } from './apply.js';
import { exportBackup, importBackup, cleanupAll } from './backup.js';
import { syncTheme } from './theme.js';
import { startViewport, stopViewport } from './viewport.js';

let VERSION = '';
export function setVersion(v) { VERSION = v; }

const state = {
    open: false,
    screen: 'wardrobe', // wardrobe | organize | edit | crop | settings | pair
    tab: 'char',
    fromSettings: false,
    scope: 'chat',
    pick: { char: '', persona: '' }, // chosen entity when opened from settings
    editId: null,
    draft: null,
    crop: null,
    busy: false,
    pairTarget: '',
};

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

function outfitLabel(o, i) {
    return o?.name?.trim() || t('outfit_n', { n: i + 1 });
}

// ---------- open / close ----------

export function openWardrobe({ fromSettings = false } = {}) {
    ensureRoot();
    state.open = true;
    state.fromSettings = fromSettings;
    state.screen = 'wardrobe';
    state.editId = null;
    state.draft = null;
    if (!chatAvailable()) state.scope = 'all';
    else state.scope = 'chat';
    root.hidden = false;
    document.documentElement.classList.add('facets-open');
    syncTheme(root);
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
        case 'crop': state.screen = 'edit'; state.crop = null; break;
        case 'pair': state.screen = 'edit'; break;
        case 'settings': case 'organize': state.screen = 'wardrobe'; break;
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
    }
    const lang = getLanguage();
    root.innerHTML = `
      <div class="facets-backdrop" data-act="close"></div>
      <div class="facets-sheet" role="dialog" aria-modal="true" aria-label="${esc(t('ext_name'))}" lang="${lang}">
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
    if (state.busy) root.querySelector('.facets-sheet')?.classList.add('facets-busy');
}

function headTitle(title) {
    return `<button type="button" class="facets-iconbtn" data-act="back" title="${esc(t('back'))}" aria-label="${esc(t('back'))}"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="facets-title">${esc(title)}</div>`;
}

function headWardrobe() {
    const key = activeKey();
    let nameHtml;
    if (state.fromSettings) {
        const opts = state.tab === 'char'
            ? allCharacters().map(c => [charKey(c.avatar), c.name])
            : allPersonas().map(p => [personaKey(p.avatar), p.name]);
        nameHtml = opts.length
            ? `<select class="facets-select facets-entity" data-act="entity" aria-label="${esc(t(state.tab === 'char' ? 'pick_character' : 'pick_persona'))}">
                ${opts.map(([k, n]) => `<option value="${esc(k)}"${k === key ? ' selected' : ''}>${esc(n)}</option>`).join('')}
              </select>`
            : '';
    } else {
        nameHtml = `<div class="facets-name" title="${esc(displayName(key))}">${esc(displayName(key))}</div>`;
    }
    return `<div class="facets-tabs" role="tablist">
        <button type="button" role="tab" class="facets-tab${state.tab === 'char' ? ' on' : ''}" data-act="tab" data-tab="char" aria-selected="${state.tab === 'char'}">${esc(t('tab_character'))}</button>
        <button type="button" role="tab" class="facets-tab${state.tab === 'persona' ? ' on' : ''}" data-act="tab" data-tab="persona" aria-selected="${state.tab === 'persona'}">${esc(t('tab_persona'))}</button>
      </div>
      ${nameHtml}
      <button type="button" class="facets-iconbtn" data-act="settings" title="${esc(t('settings'))}" aria-label="${esc(t('settings'))}"><i class="fa-solid fa-gear"></i></button>`;
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
        return [head, emptyNote(msg), ''];
    }
    const e = entityFor(key);
    const chatKey = chatAvailable() ? sc.chatKey : null;
    const shown = effectiveOutfit(key, chatKey);
    const globalO = findOutfit(key, e.global);
    const idx = (o) => e.outfits.indexOf(o);
    const globalName = globalO ? outfitLabel(globalO, idx(globalO)) : t('default_look');
    let status;
    if (chatKey) {
        const c = chatChoice(chatKey, key);
        const chatName = c === undefined ? t('status_follow')
            : c === DEFAULT_MARK ? t('default_look')
                : (findOutfit(key, c) ? outfitLabel(findOutfit(key, c), idx(findOutfit(key, c))) : t('status_follow'));
        status = `${t('status_chat', { a: chatName })} · ${t('status_all', { b: globalName })}`;
    } else {
        status = t('status_all', { b: globalName });
    }
    const tiles = [tileHtml({ key, outfit: null, selected: !shown, mode: 'wear' })]
        .concat(e.outfits.map((o, i) => tileHtml({ key, outfit: o, index: i, selected: shown?.id === o.id, mode: 'wear' })));
    let body = `<div class="facets-status" title="${esc(status)}">${esc(status)}</div>
        <div class="facets-grid">${tiles.join('')}</div>`;
    if (!e.outfits.length) {
        body += `<div class="facets-empty facets-empty-inline"><div class="facets-empty-title">${esc(t('empty_title'))}</div><div class="facets-empty-body">${esc(t('empty_body'))}</div></div>`;
    }
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
    const foot = `${seg}
      <div class="facets-row">
        <button type="button" class="facets-btn" data-act="wear-default" title="${esc(t('default_look'))}">${esc(t('default_look'))}</button>
        <button type="button" class="facets-btn facets-primary" data-act="organize" title="${esc(t('organize'))}">${esc(t('organize'))}</button>
      </div>`;
    return [head, body, foot];
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
    return `<div class="facets-tile${selected ? ' on' : ''}${isDefault ? ' is-default' : ''}${mode === 'organize' && isDefault ? ' is-locked' : ''}"
        ${outfit ? `data-id="${esc(outfit.id)}"` : ''} ${act ? `data-act="${act}" role="button" tabindex="0"` : ''}
        title="${esc(label)}">
        <div class="facets-thumb"><img src="${esc(src)}" alt="" loading="lazy" draggable="false" onerror="this.closest('.facets-thumb').classList.add('broken')"></div>
        ${isDefault ? `<span class="facets-badge">${esc(t('badge_default'))}</span>` : ''}
        ${selected && mode === 'wear' ? `<span class="facets-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>` : ''}
        ${paired ? `<span class="facets-ring" aria-hidden="true"><i class="fa-solid fa-link"></i></span>` : ''}
        ${handle}${pen}
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
    tiles.push(`<label class="facets-tile facets-add" role="button" tabindex="0" title="${esc(t('add_outfit'))}">
        <div class="facets-thumb"><i class="fa-solid fa-plus"></i></div>
        <div class="facets-label">${esc(t('add_outfit'))}</div>
        <input type="file" accept="image/*" multiple class="facets-file" data-act="add-files" hidden>
      </label>`);
    const body = `<div class="facets-grid facets-organize">${tiles.join('')}</div>`;
    const foot = `<div class="facets-row"><button type="button" class="facets-btn facets-primary facets-wide" data-act="done">${esc(t('done'))}</button></div>`;
    return [head, body, foot];
}

function viewEdit() {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o) { state.screen = 'organize'; return viewOrganize(); }
    if (!state.draft) state.draft = { name: o.name, desc: o.desc };
    const head = headTitle(t('edit_outfit'));
    const pair = o.pair && findOutfit(o.pair.key, o.pair.id);
    const pairIdx = pair ? getEntity(o.pair.key).outfits.indexOf(pair) : 0;
    const body = `
      <div class="facets-edit">
        <div class="facets-preview" data-act="full" role="button" tabindex="0">
          <img src="${esc(urlOf(o.sq || o.orig))}" alt="" draggable="false">
        </div>
        <div class="facets-row">
          <button type="button" class="facets-btn" data-act="crop" title="${esc(t('fit_square'))}">${esc(t('fit_square'))}</button>
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

function viewSettings() {
    const head = headTitle(t('settings_title'));
    const body = `
      <div class="facets-stack">
        <div class="facets-section">
          <div class="facets-stitle">${esc(t('show_where'))}</div>
          ${toggleRow('showInChat', t('show_chat'))}
          ${toggleRow('showInList', t('show_list'))}
        </div>
        <div class="facets-section">
          ${toggleRow('tellAI', t('tell_ai'), t('tell_ai_note'))}
        </div>
        <div class="facets-section">
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

function viewCrop() {
    const head = headTitle(t('crop_title'));
    const body = `<div class="facets-crop">
        <div class="facets-crop-stage"><img class="facets-crop-img" alt="" draggable="false"><div class="facets-crop-frame"></div></div>
        <div class="facets-note">${esc(t('crop_hint'))}</div>
        <div class="facets-zoom">
          <button type="button" class="facets-iconbtn" data-act="zoom-out" title="${esc(t('zoom_out'))}" aria-label="${esc(t('zoom_out'))}"><i class="fa-solid fa-minus"></i></button>
          <input type="range" class="facets-range" min="0" max="1000" step="1" data-act="zoom" aria-label="${esc(t('zoom'))}">
          <button type="button" class="facets-iconbtn" data-act="zoom-in" title="${esc(t('zoom_in'))}" aria-label="${esc(t('zoom_in'))}"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>`;
    const foot = `<div class="facets-row">
        <button type="button" class="facets-btn" data-act="crop-reset">${esc(t('reset'))}</button>
        <button type="button" class="facets-btn facets-primary" data-act="crop-apply">${esc(t('apply'))}</button>
      </div>`;
    return [head, body, foot];
}

const ZMIN = 0.5;
function zmax() { const c = state.crop; return c ? Math.max(4, c.cover * 3) : 4; }
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

function drawCrop() {
    const c = state.crop;
    const stage = root?.querySelector('.facets-crop-stage');
    const imgEl = root?.querySelector('.facets-crop-img');
    if (!c || !stage || !imgEl) return;
    const S = stage.clientWidth;
    const w = c.img.naturalWidth, h = c.img.naturalHeight;
    const fit = S / Math.max(w, h);
    const dw = w * fit * c.crop.scale, dh = h * fit * c.crop.scale;
    imgEl.style.width = `${dw}px`;
    imgEl.style.height = `${dh}px`;
    imgEl.style.left = `${(S - dw) / 2 + c.crop.x * S}px`;
    imgEl.style.top = `${(S - dh) / 2 + c.crop.y * S}px`;
}

function setScale(s) {
    const c = state.crop;
    c.crop.scale = Math.min(zmax(), Math.max(ZMIN, s));
    const r = root.querySelector('.facets-range');
    if (r) r.value = String(scaleToRange(c.crop.scale));
    drawCrop();
}

async function openCrop() {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o) return;
    await withBusy(async () => {
        const img = await loadImage(urlOf(o.orig || o.sq));
        const cover = Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight);
        state.crop = { img, cover, crop: o.crop ? { ...o.crop } : autoCrop(img.naturalWidth, img.naturalHeight) };
        state.screen = 'crop';
    }, () => toast('error', t('load_failed')));
    render();
}

async function applyCrop() {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    const c = state.crop;
    if (!o || !c) return;
    await withBusy(async () => {
        const data = renderCrop(c.img, c.crop);
        const oldSq = o.sq;
        const path = await uploadDataURL(data, folderFor(key), `${o.id}_sq_${newId()}`);
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
        const S = stage.clientWidth || 1;
        const pts = [...cropPointers.values()];
        const c = state.crop.crop;
        if (pts.length >= 2 && cropStart.dist) {
            const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            c.scale = Math.min(zmax(), Math.max(ZMIN, cropStart.scale * d / cropStart.dist));
            const r = root.querySelector('.facets-range');
            if (r) r.value = String(scaleToRange(c.scale));
        } else {
            c.x = cropStart.x + (pts[0].x - cropStart.px) / S;
            c.y = cropStart.y + (pts[0].y - cropStart.py) / S;
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
    choose(key, outfitId, scopeNow(), chatAvailable() ? currentScene().chatKey : null);
    applyAllSoon();
    render();
}

async function addFiles(files) {
    const key = activeKey();
    if (!key || !files?.length) return;
    const list = [...files];
    await withBusy(async () => {
        if (list.length > 3) toast('info', t('uploading', { n: list.length }));
        const e = entityFor(key);
        let added = 0;
        for (const file of list) {
            const stem = (file.name || '').replace(/\.[^.]+$/, '').slice(0, 60);
            if (file.type && !file.type.startsWith('image/')) { toast('warning', t('not_image', { name: file.name })); continue; }
            const id = newId();
            let orig = null;
            try {
                const data = await readAsDataURL(file);
                const img = await loadImage(data);
                const crop = autoCrop(img.naturalWidth, img.naturalHeight);
                orig = await uploadDataURL(data, folderFor(key), id);
                const sq = await uploadDataURL(renderCrop(img, crop), folderFor(key), `${id}_sq`);
                e.outfits.push({ id, name: stem, desc: '', orig, sq, crop, pair: null });
                added++;
                save();
                render();
            } catch (err) {
                console.error('[Facets]', err);
                if (orig) await deletePath(orig);
                toast('error', t('upload_failed', { name: file.name }));
            }
        }
        save();
        if (added) toast('success', t('added', { n: added }));
        applyAllSoon();
    });
    render();
}

async function replaceImage(file) {
    const key = activeKey();
    const o = findOutfit(key, state.editId);
    if (!o || !file) return;
    await withBusy(async () => {
        const data = await readAsDataURL(file);
        const img = await loadImage(data);
        const crop = autoCrop(img.naturalWidth, img.naturalHeight);
        const id = newId();
        const orig = await uploadDataURL(data, folderFor(key), `${o.id}_${id}`);
        let sq;
        try {
            sq = await uploadDataURL(renderCrop(img, crop), folderFor(key), `${o.id}_${id}_sq`);
        } catch (err) { await deletePath(orig); throw err; }
        const old = [o.orig, o.sq];
        Object.assign(o, { orig, sq, crop });
        save();
        let failed = false;
        for (const p of old) if (p && !(await deletePath(p))) failed = true;
        save();
        if (failed) toast('warning', t('delete_failed'));
        applyAllSoon();
        toast('success', t('saved'));
    }, () => toast('error', t('upload_failed', { name: file.name })));
    render();
}

async function deleteOutfit() {
    const key = activeKey();
    const e = getEntity(key);
    const o = findOutfit(key, state.editId);
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
    if (state.busy && !['close', 'full-close'].includes(act)) { toast('info', t('busy')); return; }
    switch (act) {
        case 'close': closeWardrobe(); break;
        case 'back': back(); break;
        case 'tab': state.tab = el.dataset.tab; state.screen = 'wardrobe'; render(); break;
        case 'settings': state.screen = 'settings'; render(); break;
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
        case 'crop-reset': if (state.crop) { state.crop.crop = autoCrop(state.crop.img.naturalWidth, state.crop.img.naturalHeight); setScale(state.crop.crop.scale); } break;
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
                save();
                applyAllSoon();
                toast('success', t('saved'));
            }
            state.draft = null; state.screen = 'organize'; render(); break;
        }
        case 'delete-outfit': deleteOutfit(); break;
        case 'backup': withBusy(() => exportBackup(toast)); break;
        case 'cleanup': runCleanup(); break;
    }
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
    if (el.dataset.setting) {
        settings()[el.dataset.setting] = el.checked;
        save();
        applyAllSoon();
        return;
    }
    switch (act) {
        case 'entity':
            if (state.tab === 'char') state.pick.char = el.value; else state.pick.persona = el.value;
            render(); break;
        case 'pair-target': state.pairTarget = el.value; render(); break;
        case 'lang':
            settings().lang = el.value; setLanguage(el.value); save(); render();
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
}

// keyboard: Enter/Space on role=button tiles and labels
document.addEventListener('keydown', (e) => {
    if (!state.open || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = e.target;
    if (!root?.contains(el) || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    if (el.getAttribute('role') === 'button') { e.preventDefault(); el.click(); }
});

attachCropGestures();

export function _stateForTest() { return state; }
export { currentPersonaAvatar };
