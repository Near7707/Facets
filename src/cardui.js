// 0.11.0: Photo Booth → Photocard. "My photocards" list and the workbench (background, pictures, stickers),
// saving (a file in Facets_cards), downloading as PNG and sticking a copy in the chat as one of your own stickers.
// Lives beside ui.js, which hands over its small helpers (setCardHelpers) and calls the views below.

import { t } from './i18n.js';
import {
    settings, save, getEntity, newId, cardsOf, findCard, cardDraftOf, setCardDraft, dropCardDraft,
    commitCardDraft, removeCard, addMySticker, addSticker,
} from './store.js';
import {
    CARD_W, CARD_H, MAX_CARD_PICS, MAX_CARD_STICKERS, CARD_FOLDER, CARD_PIC_MAX, CARD_PATS, CARD_FIXED, CARD_COLORS,
    ITEM_W_MIN, ITEM_W_MAX, OPACITY_MIN, cleanCard, newCard, bgUrl, patSample, itemSrc, renderCard, canvasData,
    normRot, CARD_PAD, TAPE_PATS, TAPE_FIXED, TAPE_COLORS, TAPE_BANDS, TAPE_LEN_MIN, FRAME_WIDTHS, FRAME_COLORS, FRAME_RADII,
    cleanTapeLook, tapeSample, tapeSize, frameUrl, frameRadius, itemReach, cardOverflow, cardPad, MAX_CARDS,
} from './cards.js';
import { BASIC_IDS, LOOKS, MAX_STICKERS, basicUrl } from './stickers.js';
import { urlOf, uploadDataURL, deletePath, loadImage } from './images.js';
import { applyAllSoon } from './apply.js';

let H = null;
/** ui.js passes: esc, toast, render, kicker, headTitle, settingsButton, whoPicker, activeKey, chatAvailable,
 *  currentScene, withBusy, confirmBox, readPicked, root(), state. */
export function setCardHelpers(h) { H = h; }

const ed = {
    card: null, // the card on the workbench (a working copy of the draft)
    base: null, // id of the saved card being changed (null = new)
    uploads: [], // files uploaded while making it
    sel: null, // selected item id
    undo: [],
    redo: [],
    tab: 'pic', // bg | pic | stk | tape
    organize: false, // [Organize] on the list (tap = delete)
    sheet: null, // after saving: { url, canvas, n, stuck }
};
const UNDO_MAX = 60;
const SNAP = 4;
const STICKER_FOLDER = 'Facets_stickers';

const esc = (s) => H.esc(s);
// 0.11.3: one handle turns and resizes.
const TURN_SIZE_ICON = '<svg class="facets-turnsize-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3.5v4h-4"/><path d="M9.5 14.5l5-5"/><path d="M11 9.5h3.5V13"/><path d="M9.5 11v3.5H13"/></svg>';
const icon = (name) => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
const TABS = ['bg', 'pic', 'stk', 'tape'];
// Where each new tape goes: across the top, then over the corners (card share, angle).
const TAPE_SPOTS = [[0.5, 0.012, -4], [0.07, 0.045, -45], [0.93, 0.045, 45], [0.07, 0.955, 45], [0.93, 0.955, -45], [0.5, 0.988, 3]];

// ---------- entering and leaving ----------

function loadDraft() {
    const d = cardDraftOf();
    if (!d) return false;
    ed.card = structuredClone(d.card);
    ed.base = d.base;
    ed.uploads = [...d.uploads];
    ed.sel = null;
    ed.undo = [];
    ed.redo = [];
    ed.sheet = null;
    return true;
}

function persist() {
    if (!ed.card) return;
    setCardDraft({ base: ed.base, card: ed.card, uploads: ed.uploads });
}

const draftHasWork = (d) => !!d && (d.base || d.card.items.length || d.uploads.length || d.card.bg.kind !== 'pat' || d.card.bg.pat !== 'holo'
    || d.card.frame.w !== 'none' || d.card.frame.r !== 'sq' || d.card.cardOnly);

/** Throw the draft away (and its own files nobody else uses). */
async function discardDraft() {
    const files = dropCardDraft();
    for (const p of files) await deletePath(p);
    save();
}

async function startCard(baseId) {
    const d = cardDraftOf();
    // The same card again (or an untouched new one): carry on with it.
    if (d && baseId && d.base === baseId) { enterEditor(); return; }
    if (d && !baseId && !draftHasWork(d)) { enterEditor(); return; }
    if (draftHasWork(d)) {
        if (!(await H.confirmBox(t('confirm_draft_replace'), t('draft_discard')))) return;
        await discardDraft();
    } else if (d) await discardDraft();
    const from = baseId ? findCard(baseId) : null;
    const card = from ? cleanCard({ ...structuredClone(from), out: '' }) : newCard();
    setCardDraft({ base: from ? from.id : null, card, uploads: [] });
    enterEditor();
}

function enterEditor() {
    if (!loadDraft()) return;
    H.state.stickerEdit = false;
    H.state.screen = 'card';
    H.render();
}

export function openCards() {
    ed.organize = false;
    ed.sheet = null;
    H.state.screen = 'cards';
    H.render();
}

/** Back from the card screens. Returns true when handled. */
export function cardBack() {
    const st = H.state;
    if (st.screen === 'card') { ed.sheet = null; ed.sel = null; st.screen = 'cards'; return true; }
    if (st.screen === 'cards' && ed.sheet) { ed.sheet = null; return true; }
    if (st.screen === 'cards') { ed.organize = false; st.screen = 'booth'; return true; }
    return false;
}

// ---------- list ----------

function cardName(id) {
    const list = cardsOf();
    const i = list.findIndex(c => c.id === id);
    return t('card_title_n', { n: i < 0 ? list.length + 1 : list.length - i });
}

export function viewCards() {
    const list = cardsOf();
    const d = cardDraftOf();
    let banner = '';
    if (draftHasWork(d)) {
        banner = `<div class="facets-card facets-cb-draft">
            <div class="facets-cb-draft-title">${esc(t('draft_title'))}</div>
            <div class="facets-note">${esc(t('draft_note'))}</div>
            <div class="facets-row"><button type="button" class="facets-btn facets-primary" data-act="card-continue">${esc(t('draft_continue'))}</button>
              <button type="button" class="facets-btn" data-act="card-discard">${esc(t('draft_discard'))}</button></div>
          </div>`;
    }
    const tiles = list.map((c) => {
        const name = cardName(c.id);
        const act = ed.organize ? 'card-delete' : 'card-view'; // 0.12.1: tap opens the view (download, stick, edit)
        const label = ed.organize ? `${t('delete')} · ${name}` : name;
        return `<button type="button" class="facets-cb-tile${ed.organize ? ' is-edit' : ''}" data-act="${act}" data-id="${esc(c.id)}" title="${esc(label)}" aria-label="${esc(label)}">
            <img src="${esc(urlOf(c.out))}" alt="" draggable="false" loading="lazy" onerror="this.parentNode.classList.add('broken')">
            ${ed.organize ? `<em class="facets-stk-del" aria-hidden="true">${icon('fa-trash-can')}</em>` : ''}</button>`;
    }).join('');
    const add = ed.organize ? '' : `<button type="button" class="facets-cb-tile facets-cb-new" data-act="card-new">
        <span class="facets-add-plus">${icon('fa-plus')}</span><span>${esc(t('card_new'))}</span></button>`;
    const edit = list.length
        ? `<button type="button" class="facets-btn facets-small${ed.organize ? ' facets-primary' : ''}" data-act="card-organize">${esc(t(ed.organize ? 'done' : 'stk_organize'))}</button>` : '';
    const count = `<span class="facets-count">${esc(t('cards_count', { n: list.length }))}</span>`;
    const body = `${banner}<div class="facets-card facets-closet">
        <div class="facets-closet-head">${H.kicker(t('cards_label'))}${count}${edit}</div>
        <div class="facets-cb-grid">${add}${tiles}</div>
        <div class="facets-note">${esc(t(ed.organize ? 'cards_delete_note' : 'cards_note'))}</div>
      </div>`;
    // 0.12.1: a saved photocard opens as its own page (download / stick in chat / edit).
    if (ed.sheet?.list) return [`${H.headTitle(cardName(ed.sheet.id))}${H.settingsButton()}`, sheetHtml(), ''];
    return [`${H.headTitle(t('booth_card'))}${H.settingsButton()}`, body, ''];
}

/** 0.12.1: open a saved photocard in the same window as after saving (download / stick in chat / edit). */
async function viewSaved(id) {
    const c = findCard(id);
    if (!c?.out) { startCard(id); return; }
    let ok = false;
    await H.withBusy(async () => {
        const img = await loadImage(urlOf(c.out));
        if (!img?.naturalWidth) throw new Error('no picture');
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        ed.sheet = { url: urlOf(c.out), canvas: cv, id, stuck: false, pad: cv.width > CARD_W ? CARD_PAD : 0, over: false, list: true };
        prepBlob(ed.sheet);
        ok = true;
    }, () => {});
    if (!ok) { startCard(id); return; }
    H.render();
}

// ---------- workbench ----------

const findItem = (id) => ed.card?.items.find(it => it.id === id) || null;
const count = (kind) => ed.card.items.filter(it => it.kind === kind).length;
const stkCount = () => ed.card.items.filter(it => it.kind !== 'pic').length; // stickers and tape share 12

function itemHtml(it) {
    const sel = it.id === ed.sel;
    const src = itemSrc(it, urlOf);
    const tape = it.kind === 'tape';
    const end = (k) => `<button type="button" class="facets-cb-end" data-end="${k}" title="${esc(t('tape_end_drag'))}" aria-label="${esc(t('tape_end_drag'))}"></button>`;
    const handles = !sel ? '' : tape ? `<span class="facets-cb-selbox" aria-hidden="true"></span>${end('a')}${end('b')}`
        : `<span class="facets-cb-selbox" aria-hidden="true"></span>
        <button type="button" class="facets-cb-size" title="${esc(t('stage_turnsize_drag'))}" aria-label="${esc(t('stage_turnsize_drag'))}">${TURN_SIZE_ICON}</button>`;
    return `<div class="facets-cb-item${tape ? ' is-tape' : ''}${sel ? ' is-sel' : ''}" data-id="${esc(it.id)}" style="${itemStyle(it)}">
        <img src="${esc(src)}" alt="" draggable="false" style="aspect-ratio:${it.ar};opacity:${it.opacity};${it.flip ? 'transform:scaleX(-1);' : ''}" onerror="this.parentNode.classList.add('is-broken')">
        <span class="facets-cb-missing">${esc(t('card_deleted'))}</span>${handles}</div>`;
}

function itemStyle(it) {
    return `left:${(it.x * 100).toFixed(3)}%;top:${(it.y * 100).toFixed(3)}%;width:${(it.w * 100).toFixed(3)}%;transform:translate(-50%,-50%) rotate(${it.rot}deg)`;
}

function boardBg() {
    const bg = ed.card.bg;
    const r = frameRadius(ed.card.frame);
    const round = `border-radius:${(r / CARD_W * 100).toFixed(3)}% / ${(r / CARD_H * 100).toFixed(3)}%;`;
    if (bg.kind === 'img' && bg.path) return `${round}background-image:url('${esc(urlOf(bg.path).replace(/'/g, '%27'))}');background-size:cover;background-position:center`;
    if (bg.kind === 'clear' || bg.kind === 'img') return round;
    return `${round}background-image:url('${bgUrl(bg)}');background-size:100% 100%`;
}

/** The dotted line round the card: how far things can go, and what gets saved. */
function areaHtml() {
    const x = (CARD_PAD / CARD_W * 100).toFixed(3), y = (CARD_PAD / CARD_H * 100).toFixed(3);
    const key = ed.card.cardOnly ? 'card_area_only' : cardOverflow(ed.card) ? 'card_area_out' : 'card_area_card';
    return `<div class="facets-cb-area${cardPad(ed.card) ? ' is-out' : ''}" style="left:-${x}%;right:-${x}%;top:-${y}%;bottom:-${y}%" aria-hidden="true">
        <span class="facets-cb-area-label">${esc(t(key))}</span></div>`;
}

function toolsHtml() {
    const it = findItem(ed.sel);
    if (!it) return '';
    const tape = it.kind === 'tape';
    const b = (act, ic, key, extra = '') => `<button type="button" class="facets-cb-tbtn${extra}" data-act="${act}" title="${esc(t(key))}" aria-label="${esc(t(key))}">${icon(ic)}</button>`;
    const i = ed.card.items.indexOf(it);
    const front = i < ed.card.items.length - 1 ? '' : ' is-off';
    const back = i > 0 ? '' : ' is-off';
    if (tape) {
        return `<div class="facets-cb-tools" role="toolbar" aria-label="${esc(t('card_tape_tools'))}">
        <div class="facets-cb-trow">${b('card-front', 'fa-angles-up', 'card_front', front)}${b('card-back', 'fa-angles-down', 'card_back', back)}<span class="facets-stage-sep" aria-hidden="true"></span>${b('card-remove', 'fa-trash-can', 'card_remove', ' is-danger')}</div>
      </div>`;
    }
    return `<div class="facets-cb-tools" role="toolbar" aria-label="${esc(t('card_tools'))}">
        <label class="facets-cb-op"><span>${esc(t('card_opacity'))}</span><input type="range" min="${Math.round(OPACITY_MIN * 100)}" max="100" value="${Math.round(it.opacity * 100)}" data-act="card-opacity" aria-label="${esc(t('card_opacity'))}"></label>
        <div class="facets-cb-trow">${b('card-front', 'fa-angles-up', 'card_front', front)}${b('card-back', 'fa-angles-down', 'card_back', back)}<span class="facets-stage-sep" aria-hidden="true"></span>${b('card-flip', 'fa-arrows-left-right', 'card_flip', it.flip ? ' on' : '')}${b('card-remove', 'fa-trash-can', 'card_remove', ' is-danger')}</div>
      </div>`;
}

function panelBg() {
    const bg = ed.card.bg;
    const kinds = ['solid', 'pat', 'img', 'clear'].map(k => `<button type="button" role="radio" class="facets-chip${bg.kind === k ? ' on' : ''}" data-act="card-bg" data-v="${k}" aria-checked="${bg.kind === k}">${esc(t(`card_bg_${k}`))}</button>`).join('');
    let inner = '';
    if (bg.kind === 'pat') {
        inner += `<div class="facets-cb-pats">${CARD_PATS.map(p => `<button type="button" class="facets-cb-pat${bg.pat === p ? ' on' : ''}" data-act="card-pat" data-v="${p}" aria-pressed="${bg.pat === p}">
            <span class="facets-cb-patimg" style="background-image:url(&quot;${patSample(p, bg.color)}&quot;)"></span><span>${esc(t(`card_pat_${p}`))}</span></button>`).join('')}</div>`;
    }
    if (bg.kind === 'solid' || bg.kind === 'pat') {
        const fixed = bg.kind === 'pat' && CARD_FIXED.has(bg.pat);
        inner += swatches(bg.color, fixed);
        if (fixed) inner += `<div class="facets-note">${esc(t('border_fixed_color'))}</div>`;
    }
    if (bg.kind === 'img') {
        inner += `<div class="facets-cb-bgimg">${bg.path ? `<img src="${esc(urlOf(bg.path))}" alt="" draggable="false">` : ''}
            <label class="facets-btn" role="button" tabindex="0">${esc(t('card_bg_pick'))}<input type="file" accept="image/*" data-act="card-bg-file" hidden></label></div>
          <div class="facets-note">${esc(t('card_bg_img_note'))}</div>`;
    }
    if (bg.kind === 'clear') inner += `<div class="facets-note">${esc(t('card_bg_clear_note'))}</div>`;
    return `<div class="facets-chips" role="radiogroup">${kinds}</div>${inner}${frameSection()}`;
}

const chip = (act, v, on, label) => `<button type="button" role="radio" class="facets-chip${on ? ' on' : ''}" data-act="${act}" data-v="${v}" aria-checked="${on}">${esc(label)}</button>`;
const seg = (act, v, on, label) => `<button type="button" role="radio" class="facets-segbtn${on ? ' on' : ''}" data-act="${act}" data-v="${v}" aria-checked="${on}">${esc(label)}</button>`;

/** 0.12.0: the card border (thickness, colour, corners), under the background. */
function frameSection() {
    const f = ed.card.frame;
    const widths = Object.keys(FRAME_WIDTHS).map(k => chip('card-frame-w', k, f.w === k, t(`card_frame_${k}`))).join('');
    const corners = Object.keys(FRAME_RADII).map(k => chip('card-frame-r', k, f.r === k, t(`card_corner_${k}`))).join('');
    return `<div class="facets-cb-sub">
        <div class="facets-cb-subtitle">${esc(t('card_frame_title'))}</div>
        <div class="facets-chips" role="radiogroup" aria-label="${esc(t('card_frame_title'))}">${widths}</div>
        ${swatches(f.color, f.w === 'none', 'card-frame-color', FRAME_COLORS)}
        <div class="facets-cb-subtitle is-small">${esc(t('card_corner'))}</div>
        <div class="facets-chips" role="radiogroup" aria-label="${esc(t('card_corner'))}">${corners}</div>
        <div class="facets-note">${esc(t('card_frame_note'))}</div>
      </div>`;
}

function swatches(value, disabled, act = 'card-color', colors = CARD_COLORS) {
    const v = String(value || '').toLowerCase();
    const custom = v && !colors.includes(v);
    const sws = colors.map((c, i) => `<button type="button" class="facets-swatch${v === c ? ' on' : ''}" data-act="${act}" data-v="${c}" style="--sw:${c}" title="${esc(t('color_n', { n: i + 1 }))}" aria-label="${esc(t('color_n', { n: i + 1 }))}" aria-pressed="${v === c}"${disabled ? ' disabled' : ''}></button>`).join('');
    return `<div class="facets-swatches${disabled ? ' is-off' : ''}">${sws}
        <label class="facets-swatch facets-swatch-custom${custom ? ' on' : ''}" title="${esc(t('color_custom'))}" style="--sw:${custom ? v : '#ffffff'}">
          ${icon('fa-eye-dropper')}<input type="color" data-act="${act}" value="${custom ? v : '#ffffff'}" aria-label="${esc(t('color_custom'))}"${disabled ? ' disabled' : ''}>
        </label></div>`;
}

/** 0.12.0: the tape tab. With a tape picked, changes go to it; otherwise they are remembered for the next one. */
function panelTape() {
    const sel = findItem(ed.sel);
    const tp = sel?.kind === 'tape' ? sel : null;
    const look = tp ? cleanTapeLook(tp) : cleanTapeLook(settings().tapeLook);
    const n = stkCount();
    const full = n >= MAX_CARD_STICKERS;
    const pats = TAPE_PATS.map(p => `<button type="button" class="facets-cb-pat facets-cb-tpat${look.pat === p ? ' on' : ''}" data-act="card-tape" data-k="pat" data-v="${p}" aria-pressed="${look.pat === p}">
        <span class="facets-cb-patimg" style="background-image:url(&quot;${tapeSample({ ...look, pat: p, torn: false })}&quot;)"></span><span>${esc(t(`tape_pat_${p}`))}</span></button>`).join('');
    const fixed = TAPE_FIXED.has(look.pat);
    const bands = Object.keys(TAPE_BANDS).map(k => seg('card-tape', k, look.band === k, t(`tape_band_${k}`)).replace('data-act="card-tape"', 'data-act="card-tape" data-k="band"')).join('');
    const ends = [['torn', true], ['straight', false]].map(([k, v]) => seg('card-tape', k, look.torn === v, t(`tape_end_${k}`)).replace('data-act="card-tape"', 'data-act="card-tape" data-k="torn"')).join('');
    return `<div class="facets-cb-pats facets-cb-tpats">${pats}</div>
      ${swatches(look.color, fixed, 'card-tape-color', TAPE_COLORS)}
      ${fixed ? `<div class="facets-note">${esc(t('border_fixed_color'))}</div>` : ''}
      <div class="facets-cb-trow2"><span class="facets-cb-subtitle is-small">${esc(t('tape_band'))}</span><div class="facets-seg" role="radiogroup" aria-label="${esc(t('tape_band'))}">${bands}</div></div>
      <div class="facets-cb-trow2"><span class="facets-cb-subtitle is-small">${esc(t('tape_end'))}</span><div class="facets-seg" role="radiogroup" aria-label="${esc(t('tape_end'))}">${ends}</div></div>
      <div class="facets-cb-tapeadd">
        <button type="button" class="facets-btn facets-primary" data-act="card-tape-add"${full ? ' disabled' : ''}>${icon('fa-plus')} ${esc(t('tape_add'))}</button>
        <span class="facets-count">${esc(t('tape_count', { n, max: MAX_CARD_STICKERS }))}</span>
      </div>
      <div class="facets-note">${esc(t(tp ? 'tape_note_sel' : 'tape_note_next'))} ${esc(t('tape_ends_note'))}</div>
      ${full ? `<div class="facets-note">${esc(t('card_stk_full', { max: MAX_CARD_STICKERS }))}</div>` : ''}`;
}

function panelPics() {
    const key = H.activeKey();
    const e = key ? getEntity(key) : null;
    const n = count('pic');
    const full = n >= MAX_CARD_PICS;
    const lock = full ? ' disabled' : '';
    const outfits = (e?.outfits || []).map((o, i) => {
        const name = o.name?.trim() || t('outfit_n', { n: i + 1 });
        return `<button type="button" class="facets-cb-otile" data-act="card-add-outfit" data-id="${esc(o.id)}" title="${esc(name)}" aria-label="${esc(t('card_add', { name }))}"${lock}>
            <img src="${esc(urlOf(o.sq || o.orig))}" alt="" draggable="false" loading="lazy"><span>${esc(name)}</span></button>`;
    }).join('');
    const upload = `<label class="facets-cb-otile facets-cb-up${full ? ' is-off' : ''}" role="button" tabindex="0" title="${esc(t('card_upload'))}">
        <span class="facets-add-plus">${icon('fa-plus')}</span><span>${esc(t('card_upload'))}</span>
        <input type="file" accept="image/*" multiple data-act="card-pic-file" hidden${lock}></label>`;
    const none = key && !(e?.outfits || []).length ? `<div class="facets-note">${esc(t('card_no_outfits'))}</div>` : '';
    return `${H.whoPicker()}
      <div class="facets-cb-pichead"><span class="facets-count">${esc(t('card_pics_count', { n, max: MAX_CARD_PICS }))}</span></div>
      <div class="facets-cb-orow">${upload}${outfits}</div>${none}
      <div class="facets-note">${esc(t(full ? 'card_pics_full' : 'card_pics_note', { max: MAX_CARD_PICS }))}</div>`;
}

function panelStickers() {
    const s = settings();
    const n = stkCount();
    const lock = n >= MAX_CARD_STICKERS ? ' disabled' : '';
    const looks = LOOKS.map(v => `<button type="button" role="radio" class="facets-segbtn${s.stickerLook === v ? ' on' : ''}" data-act="stk-look" data-v="${v}" aria-checked="${s.stickerLook === v}">${esc(t(`stk_look_${v}`))}</button>`).join('');
    const spark = `<label class="facets-toggle facets-stk-spark" title="${esc(t('stk_spark_note'))}">
        <span class="facets-toggle-text"><span>✦ ${esc(t('stk_spark'))}</span></span>
        <input type="checkbox" data-act="stk-spark"${s.stickerSpark ? ' checked' : ''}>
        <span class="facets-switch" aria-hidden="true"></span></label>`;
    const basic = BASIC_IDS.map(id => {
        const name = t(`stk_${id}`);
        return `<button type="button" class="facets-stk-tile" data-act="card-add-stk" data-kind="basic" data-ref="${id}" title="${esc(name)}" aria-label="${esc(t('stk_add', { name }))}"${lock}>
            <img src="${esc(basicUrl(id, s.stickerLook, s.stickerSpark, false))}" alt="" draggable="false"><span>${esc(name)}</span></button>`;
    }).join('');
    // 0.12.1: copies of photocards stay out of here (no photocard inside a photocard); [Organize] deletes.
    const edit = H.state.stickerEdit === true;
    const mine = s.myStickers.map((m, i) => [m, i]).filter(([m]) => !m.card).map(([m, i]) => {
        const name = m.name || t('stk_mine_n', { n: i + 1 });
        if (edit) {
            return `<button type="button" class="facets-stk-tile is-mine is-edit" data-act="stk-del" data-id="${esc(m.id)}" title="${esc(t('stk_delete'))}" aria-label="${esc(`${t('stk_delete')} · ${name}`)}">
            <img src="${esc(urlOf(m.path))}" alt="" draggable="false" loading="lazy"><span>${esc(name)}</span><em class="facets-stk-del" aria-hidden="true">${icon('fa-trash-can')}</em></button>`;
        }
        return `<button type="button" class="facets-stk-tile is-mine" data-act="card-add-stk" data-kind="mine" data-ref="${esc(m.id)}" title="${esc(name)}" aria-label="${esc(t('stk_add', { name }))}"${lock}>
            <img src="${esc(urlOf(m.path))}" alt="" draggable="false" loading="lazy"><span>${esc(name)}</span></button>`;
    }).join('');
    const editBtn = `<button type="button" class="facets-btn facets-small${edit ? ' facets-primary' : ''}" data-act="stk-edit">${esc(t(edit ? 'done' : 'stk_organize'))}</button>`;
    return `<div class="facets-stk-lookrow"><div class="facets-seg" role="radiogroup" aria-label="${esc(t('stk_look'))}">${looks}</div>${spark}</div>
      <div class="facets-cb-pichead"><span class="facets-count">${esc(t('tape_count', { n, max: MAX_CARD_STICKERS }))}</span></div>
      <div class="facets-stk-grid">${basic}</div>
      ${mine ? `<div class="facets-closet-head">${H.kicker(t('stk_mine_label'))}${editBtn}</div><div class="facets-stk-grid">${mine}</div>
      <div class="facets-note">${esc(t(edit ? 'stk_delete_note' : 'card_mine_note'))}</div>` : ''}
      ${lock ? `<div class="facets-note">${esc(t('card_stk_full', { max: MAX_CARD_STICKERS }))}</div>` : ''}`;
}

function sheetHtml() {
    const sh = ed.sheet;
    if (!sh) return '';
    const inChat = H.chatAvailable();
    const btn = (act, ic, title, sub, dis = '') => `<button type="button" class="facets-btn facets-cb-bigbtn" data-act="${act}"${dis}>${icon(ic)}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
    const w = sh.canvas?.width || CARD_W, h = sh.canvas?.height || CARD_H;
    const size = t(sh.pad ? 'card_size_out' : 'card_size_card', { w, h });
    // "Card only" matters only when something hangs over the edge (or it is already on).
    const only = !sh.list && (sh.over || ed.card?.cardOnly) ? `<label class="facets-toggle facets-cb-only">
        <span class="facets-toggle-text"><span>${esc(t('card_only'))}</span><small>${esc(t('card_only_note'))}</small></span>
        <input type="checkbox" data-act="card-only"${ed.card?.cardOnly ? ' checked' : ''}>
        <span class="facets-switch" aria-hidden="true"></span></label>` : '';
    const open = sh.list ? '<div class="facets-cb-sheet is-page">' : `<div class="facets-cb-sheetwrap"><div class="facets-cb-sheet" role="dialog" aria-label="${esc(t('card_saved_title'))}">`;
    return `${open}
        <div class="facets-cb-sheettop"><span class="facets-cb-sheetimg${sh.pad ? ' is-pad' : ''}"><img src="${esc(sh.url)}" alt="" draggable="false"></span><div><div class="facets-cb-sheettitle">${esc(sh.list ? cardName(sh.id) : t('card_saved_title'))}</div><div class="facets-note">${esc(t(sh.list ? 'card_view_note' : 'card_saved_note'))}</div><div class="facets-note facets-cb-size-note">${esc(size)}</div></div></div>
        ${only}
        ${btn('card-download', 'fa-download', t('card_download'), `${w} × ${h}`)}
        ${btn('card-stick', sh.stuck ? 'fa-check' : 'fa-thumbtack', t(sh.stuck ? 'card_stuck' : 'card_stick'), t(inChat ? 'card_stick_note' : 'card_stick_need_chat'), inChat && !sh.stuck ? '' : ' disabled')}
        ${sh.list ? btn('card-edit', 'fa-pen', t('card_edit'), t('card_edit_sub')) : ''}
        <div class="facets-note">${esc(t('card_ios_note'))}</div>
        <div class="facets-note">${esc(t('card_keep_note'))}</div>
        <button type="button" class="facets-btn facets-primary facets-wide" data-act="card-sheet-done">${esc(t('done'))}</button>
      </div>${sh.list ? '' : '</div>'}`;
}

export function viewCard() {
    if (!ed.card && !loadDraft()) { H.state.screen = 'cards'; return viewCards(); }
    const title = ed.base ? cardName(ed.base) : t('card_title_new');
    const head = `${H.headTitle(title)}<button type="button" class="facets-btn facets-primary facets-small facets-cb-save" data-act="card-save">${esc(t('card_save'))}</button>`;
    const tabs = TABS.map(k => `<button type="button" role="tab" class="facets-segbtn${ed.tab === k ? ' on' : ''}" data-act="card-tab" data-tab="${k}" aria-selected="${ed.tab === k}">${esc(t(`card_tab_${k}`))}</button>`).join('');
    const panel = ed.tab === 'bg' ? panelBg() : ed.tab === 'stk' ? panelStickers() : ed.tab === 'tape' ? panelTape() : panelPics();
    const fu = frameUrl(ed.card.frame);
    const body = `<div class="facets-cb-work">
        <div class="facets-cb-bench">
          <div class="facets-cb-side">
            <button type="button" class="facets-iconbtn" data-act="card-undo" title="${esc(t('card_undo'))}" aria-label="${esc(t('card_undo'))}"${ed.undo.length ? '' : ' disabled'}>${icon('fa-rotate-left')}</button>
            <button type="button" class="facets-iconbtn" data-act="card-redo" title="${esc(t('card_redo'))}" aria-label="${esc(t('card_redo'))}"${ed.redo.length ? '' : ' disabled'}>${icon('fa-rotate-right')}</button>
          </div>
          <div class="facets-cb-board" aria-label="${esc(t('booth_card'))}">
            ${areaHtml()}
            <div class="facets-cb-face${ed.card.bg.kind === 'clear' || (ed.card.bg.kind === 'img' && !ed.card.bg.path) ? ' is-clear' : ''}" style="${boardBg()}" aria-hidden="true">${fu ? `<span class="facets-cb-frame" style="background-image:url('${fu}')"></span>` : ''}</div>
            ${ed.card.items.map(itemHtml).join('')}
          </div>
          ${toolsHtml()}
        </div>
        <div class="facets-cb-panel">
          <div class="facets-seg facets-cb-tabs" role="tablist">${tabs}</div>
          <div class="facets-card facets-cb-pcard">${panel}</div>
        </div>
        ${sheetHtml()}
      </div>`;
    return [head, body, ''];
}

// ---------- after render: size the board, place the tool bar, hook up the hands ----------

let ro = null;
export function mountCard() {
    const root = H.root();
    const bench = root?.querySelector('.facets-cb-bench');
    if (!bench) return;
    sizeBoard();
    ro?.disconnect();
    ro = new ResizeObserver(() => sizeBoard());
    ro.observe(bench);
    const board = bench.querySelector('.facets-cb-board');
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
    board.addEventListener('lostpointercapture', onUp);
    board.addEventListener('wheel', onWheel, { passive: false });
    // A sticker or picture whose real shape differs from what was kept: fix the shape once it loads.
    for (const img of board.querySelectorAll('.facets-cb-item img')) {
        img.addEventListener('load', () => {
            const it = findItem(img.parentNode.dataset.id);
            if (!it || !img.naturalWidth || !img.naturalHeight) return;
            const ar = img.naturalWidth / img.naturalHeight;
            if (Math.abs(ar - it.ar) > 0.01) { it.ar = ar; img.style.aspectRatio = String(ar); persist(); placeTools(); }
        }, { once: true });
    }
}

function sizeBoard() {
    const root = H.root();
    const bench = root?.querySelector('.facets-cb-bench');
    const board = bench?.querySelector('.facets-cb-board');
    if (!board) return;
    const side = bench.querySelector('.facets-cb-side');
    const sideW = side ? side.offsetWidth + 16 : 0;
    // 0.12.0: the dotted save area round the card has to fit too.
    const kx = 1 + 2 * CARD_PAD / CARD_W, ky = 1 + 2 * CARD_PAD / CARD_H;
    const W = (bench.clientWidth - sideW * 2) / kx;
    const Hh = (bench.clientHeight - 44) / ky; // room for the label under the dotted line
    const w = Math.max(80, Math.min(W, Hh * CARD_W / CARD_H));
    board.style.width = `${Math.round(w)}px`;
    board.style.height = `${Math.round(w * CARD_H / CARD_W)}px`;
    placeTools();
}

function placeTools() {
    const root = H.root();
    const bench = root?.querySelector('.facets-cb-bench');
    const tools = bench?.querySelector('.facets-cb-tools');
    if (!tools) return;
    const el = bench.querySelector('.facets-cb-item.is-sel');
    if (!el) { tools.hidden = true; return; }
    const b = bench.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const tw = tools.offsetWidth, th = tools.offsetHeight;
    let x = r.left + r.width / 2 - b.left - tw / 2;
    x = Math.max(6, Math.min(b.width - tw - 6, x));
    let y = r.top - b.top - th - 10;
    if (y < 6) y = r.bottom - b.top + 26;
    if (y + th > b.height - 6) y = 6;
    tools.style.left = `${Math.round(x)}px`;
    tools.style.top = `${Math.round(y)}px`;
    tools.hidden = false;
}

// ---------- changes ----------

function change(fn, { render = true } = {}) {
    const before = JSON.stringify(ed.card);
    fn(ed.card);
    ed.card = cleanCard(ed.card);
    if (JSON.stringify(ed.card) === before) { if (render) H.render(); return; }
    ed.undo.push(before);
    if (ed.undo.length > UNDO_MAX) ed.undo.shift();
    ed.redo = [];
    persist();
    if (render) H.render();
}

function undo(dir) {
    const from = dir > 0 ? ed.redo : ed.undo;
    const to = dir > 0 ? ed.undo : ed.redo;
    if (!from.length) return;
    to.push(JSON.stringify(ed.card));
    ed.card = cleanCard(JSON.parse(from.pop()));
    if (ed.sel && !findItem(ed.sel)) ed.sel = null;
    persist();
    H.render();
}

/** Where a new item goes: the middle, a little to one side for each new one so they don't sit exactly on top. */
function spot() {
    const n = ed.card.items.length;
    const off = [0, -0.14, 0.14, -0.07, 0.07][n % 5];
    return { x: 0.5 + off, y: 0.55 + (n % 3 - 1) * 0.04 };
}

async function sizeOf(src) {
    try {
        const img = await loadImage(src);
        return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    } catch { return 1; }
}

function picWidth(ar) {
    // About two-thirds of the card tall, never wider than 90% of it.
    return Math.min(0.9, Math.max(ITEM_W_MIN, 0.64 * CARD_H * ar / CARD_W));
}

async function addOutfit(id) {
    const key = H.activeKey();
    const o = key ? getEntity(key)?.outfits.find(x => x.id === id) : null;
    if (!o?.orig) return;
    if (count('pic') >= MAX_CARD_PICS) { H.toast('warning', t('card_pics_full', { max: MAX_CARD_PICS })); return; }
    const ar = await sizeOf(urlOf(o.orig));
    const it = { id: newId(), kind: 'pic', src: o.orig, own: false, ar, w: picWidth(ar), ...spot() };
    ed.sel = it.id;
    change(c => { c.items.push(it); });
}

/** Read the picked files, make big ones smaller (see-through parts kept) and upload them for this card. */
async function uploadForCard(files, max = CARD_PIC_MAX) {
    const items = await H.readPicked([...files]);
    const out = [];
    for (const it of items) {
        let data = it.data;
        const w = it.img.naturalWidth || 1, h = it.img.naturalHeight || 1;
        // 0.12.2: camera photos (JPG / HEIC) have no see-through parts, so they go up as JPG — as PNG
        // (iPhone Safari can't make webp) one photo was several MB and slow to upload.
        const photo = /^data:image\/(jpe?g|hei[cf])/i.test(data) || /\.(jpe?g|hei[cf])$/i.test(it.fileName || it.name || '');
        if (Math.max(w, h) > max || !/^data:image\/(png|webp|jpe?g|gif)/i.test(data)) {
            const c = document.createElement('canvas');
            const k = Math.min(1, max / Math.max(w, h));
            c.width = Math.max(1, Math.round(w * k));
            c.height = Math.max(1, Math.round(h * k));
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(it.img, 0, 0, c.width, c.height);
            data = photo ? c.toDataURL('image/jpeg', 0.9) : canvasData(c);
        }
        try {
            const path = await uploadDataURL(data, CARD_FOLDER, `cp_${newId()}`);
            ed.uploads.push(path);
            out.push({ path, ar: w / h, name: it.name });
        } catch (err) {
            console.error('[Facets]', err);
            H.toast('error', t('upload_failed', { name: it.fileName || it.name }));
        }
    }
    persist();
    return out;
}

async function addUploads(files) {
    if (!files?.length) return;
    const room = MAX_CARD_PICS - count('pic');
    if (room <= 0) { H.toast('warning', t('card_pics_full', { max: MAX_CARD_PICS })); return; }
    const picked = [...files].slice(0, room);
    if (files.length > room) H.toast('warning', t('card_pics_full', { max: MAX_CARD_PICS }));
    await H.withBusy(async () => {
        const up = await uploadForCard(picked);
        if (!up.length) return;
        change(c => {
            for (const u of up) {
                const it = { id: newId(), kind: 'pic', src: u.path, own: true, ar: u.ar, w: picWidth(u.ar), ...spot() };
                c.items.push(it);
                ed.sel = it.id;
            }
        }, { render: false });
    });
    H.render();
}

async function setBgFile(file) {
    if (!file) return;
    await H.withBusy(async () => {
        const up = await uploadForCard([file]);
        if (up[0]) change(c => { c.bg = { ...c.bg, kind: 'img', path: up[0].path }; }, { render: false });
    });
    H.render();
}

async function addSticker2(kind, ref) {
    if (stkCount() >= MAX_CARD_STICKERS) { H.toast('warning', t('card_stk_full', { max: MAX_CARD_STICKERS })); return; }
    const s = settings();
    let src = '', ar = 1;
    if (kind === 'mine') {
        const m = s.myStickers.find(x => x.id === ref);
        if (!m) return;
        src = m.path;
        ar = await sizeOf(urlOf(m.path));
    }
    const it = { id: newId(), kind: 'stk', skind: kind, ref, src, look: s.stickerLook, spark: s.stickerSpark, ar, w: 0.24, ...spot() };
    ed.sel = it.id;
    change(c => { c.items.push(it); });
}

function addTape() {
    if (stkCount() >= MAX_CARD_STICKERS) { H.toast('warning', t('card_stk_full', { max: MAX_CARD_STICKERS })); return; }
    const [x, y, rot] = TAPE_SPOTS[count('tape') % TAPE_SPOTS.length];
    const it = { id: newId(), kind: 'tape', ...cleanTapeLook(settings().tapeLook), x, y, rot, w: x === 0.5 ? 0.42 : 0.3 };
    keepInArea(it);
    ed.sel = it.id;
    change(c => { c.items.push(it); });
}

/** A tape look picked in the tape tab: to the picked tape, or remembered for the next one. */
function setTape(k, v) {
    const val = k === 'torn' ? v === 'torn' : v;
    const it = findItem(ed.sel);
    if (it?.kind === 'tape') { change(c => { const x = c.items.find(y => y.id === it.id); if (x) x[k] = val; }); return; }
    const s = settings();
    s.tapeLook = cleanTapeLook({ ...s.tapeLook, [k]: val });
    save();
    H.render();
}

/** Keep a dragged item's edges inside the dotted save area (when it fits; a very big one only keeps its middle near). */
function keepInArea(it) {
    const { ex, ey } = it.kind === 'tape' ? tapeReach(it) : itemReach(it);
    const fit = (v, e, size) => {
        const lo = -CARD_PAD + e, hi = size + CARD_PAD - e;
        return lo <= hi ? Math.min(hi, Math.max(lo, v)) : Math.min(lo, Math.max(hi, v));
    };
    it.x = fit(it.x * CARD_W, ex, CARD_W) / CARD_W;
    it.y = fit(it.y * CARD_H, ey, CARD_H) / CARD_H;
}

/** For tape only its two ends count (the band is thin). */
function tapeReach(it) {
    const L = it.w * CARD_W, a = it.rot * Math.PI / 180;
    return { ex: Math.abs(Math.cos(a)) * L / 2, ey: Math.abs(Math.sin(a)) * L / 2 };
}

function moveLayer(dir) {
    change(c => {
        const i = c.items.findIndex(it => it.id === ed.sel);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= c.items.length) return;
        [c.items[i], c.items[j]] = [c.items[j], c.items[i]];
    });
}

// ---------- saving ----------

async function saveCard() {
    if (!ed.card) return;
    // 0.12.2: a new card when the list is full would push the oldest one out without a word.
    if (!(ed.base && findCard(ed.base)) && cardsOf().length >= MAX_CARDS) {
        H.toast('warning', t('card_full', { n: MAX_CARDS }));
        return;
    }
    let ok = false;
    await H.withBusy(async () => {
        persist();
        H.toast('info', t('card_saving'));
        const { canvas, missing, pad } = await renderCard(ed.card, urlOf);
        const path = await uploadDataURL(canvasData(canvas), CARD_FOLDER, `card_${ed.card.id}_${Date.now().toString(36)}`);
        const res = commitCardDraft(path);
        if (!res) throw new Error('no draft');
        for (const p of res.gone) await deletePath(p);
        save();
        if (missing) H.toast('warning', t('card_missing_saved', { n: missing }));
        ed.sheet = { url: urlOf(path), canvas, id: res.card.id, stuck: false, pad, over: cardOverflow(ed.card) };
        prepBlob(ed.sheet);
        ed.base = res.card.id;
        ed.sel = null;
        ok = true;
    }, () => H.toast('error', t('card_save_failed')));
    if (ok) ed.card = cleanCard({ ...ed.card, id: ed.base });
    H.render();
}

/** 0.12.2: iPhone / iPad (also iPads that call themselves a Mac). */
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Make the PNG ahead of time, so on an iPhone the share sheet can open right on the tap
 * (Safari only allows it straight after a tap, and making the PNG takes a moment).
 */
function prepBlob(sh) {
    if (!IOS || !sh?.canvas || !navigator.canShare) return;
    sh.canvas.toBlob((blob) => { if (blob) sh.blob = blob; }, 'image/png');
}

function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function download() {
    const sh = ed.sheet;
    if (!sh?.canvas) return;
    const name = `${cardName(sh.id).replace(/\s+/g, '-')}.png`;
    // 0.12.2: on an iPhone, open the share sheet ("Save Image" puts it in Photos). Anything else: a normal download.
    if (IOS && sh.blob && navigator.canShare) {
        const file = new File([sh.blob], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] }).catch((err) => {
                if (err?.name !== 'AbortError') saveBlob(sh.blob, name); // closing the sheet is not an error
            });
            return;
        }
    }
    sh.canvas.toBlob((blob) => {
        if (!blob) { H.toast('error', t('card_save_failed')); return; }
        saveBlob(blob, name);
    }, 'image/png');
}

async function stickInChat() {
    const sh = ed.sheet;
    if (!sh?.canvas || sh.stuck || !H.chatAvailable()) return;
    await H.withBusy(async () => {
        // 0.12.1: the same save of the same photocard reuses its copy instead of piling up new ones.
        const card = findCard(sh.id);
        let m = card ? settings().myStickers.find(x => x.card === card.id && x.cardT === card.t) : null;
        if (m) H.toast('info', t('card_stick_again'));
        else {
            // 0.11.3: full size (it used to be cut down to 512px and looked blurry in the chat).
            const path = await uploadDataURL(canvasData(sh.canvas), STICKER_FOLDER, `stk_${newId()}`);
            m = addMySticker(path, cardName(sh.id), card ? { card: card.id, cardT: card.t } : null);
        }
        // Its own copy: deleting the photocard later leaves this sticker alone.
        if (!addSticker(H.currentScene().chatKey, 'mine', m.id, 'cut', false)) H.toast('warning', t('stk_full', { max: MAX_STICKERS }));
        else H.toast('success', t('card_stuck'));
        save();
        applyAllSoon();
        sh.stuck = true;
    }, () => H.toast('error', t('stk_upload_failed')));
    H.render();
}

async function deleteCard(id) {
    if (!(await H.confirmBox(t('confirm_card_delete', { name: cardName(id) }), t('delete')))) return;
    await H.withBusy(async () => {
        const files = removeCard(id);
        let failed = false;
        for (const p of files) if (!(await deletePath(p))) failed = true;
        save();
        if (failed) H.toast('warning', t('delete_failed'));
        if (!cardsOf().length) ed.organize = false;
    });
    H.render();
}

// ---------- hands on the board ----------

const pointers = new Map();
let gesture = null;
let wheelTimer = 0, wheelSnap = '';

function boardRect() { return H.root()?.querySelector('.facets-cb-board')?.getBoundingClientRect(); }
function centerOf(it) {
    const r = boardRect();
    return r ? { x: r.left + it.x * r.width, y: r.top + it.y * r.height, W: r.width, H: r.height } : { x: 0, y: 0, W: 1, H: 1 };
}
function two() {
    const p = [...pointers.values()];
    if (p.length < 2) return null;
    return { d: Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), ang: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI };
}
function snapRot(r) {
    const n = normRot(r);
    for (const a of [-180, -90, 0, 90, 180]) if (Math.abs(n - a) <= SNAP) return normRot(a);
    return n;
}
const clampW = (w, it) => Math.min(ITEM_W_MAX, Math.max(it?.kind === 'tape' ? TAPE_LEN_MIN : ITEM_W_MIN, w));

function paintItem(it) {
    const el = H.root()?.querySelector(`.facets-cb-item[data-id="${CSS.escape(it.id)}"]`);
    if (!el) return;
    el.setAttribute('style', itemStyle(it));
    if (it.kind === 'tape') {
        // A new drawing, so the pattern carries on instead of stretching.
        const img = el.querySelector('img');
        const { w, h } = tapeSize(it);
        if (img) { img.src = itemSrc(it, urlOf); img.style.aspectRatio = String(w / h); }
    }
}

function onDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    const itemEl = e.target.closest('.facets-cb-item');
    if (!itemEl) {
        if (!pointers.size && ed.sel) { ed.sel = null; H.render(); }
        return;
    }
    const it = findItem(itemEl.dataset.id);
    if (!it) return;
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (gesture && gesture.id !== it.id) { pointers.clear(); gesture = null; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) {
        const c = centerOf(it);
        const endEl = e.target.closest('.facets-cb-end');
        const kind = endEl ? 'end' : e.target.closest('.facets-cb-rot') ? 'rot' : e.target.closest('.facets-cb-size') ? 'size' : 'move';
        gesture = {
            id: it.id, kind, start: { ...it }, snap: JSON.stringify(ed.card), x0: e.clientX, y0: e.clientY, moved: false, multi: false,
            a0: Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI, d0: Math.hypot(e.clientX - c.x, e.clientY - c.y),
            wasSel: ed.sel === it.id, end: endEl?.dataset.end || '',
        };
        // Picking a tape opens the tape tab, where its look can be changed.
        if (it.kind === 'tape' && ed.sel !== it.id && ed.tab !== 'tape') { ed.tab = 'tape'; gesture.wasSel = false; }
        if (ed.sel !== it.id) {
            // Select without redrawing (the hand is still down); the handles come with the redraw at the end.
            ed.sel = it.id;
            H.root().querySelectorAll('.facets-cb-item.is-sel').forEach(x => x.classList.remove('is-sel'));
            itemEl.classList.add('is-sel');
        }
    }
    if (pointers.size >= 2 && gesture.kind === 'move') {
        const tw = two();
        gesture.multi = true;
        gesture.start = { ...it };
        gesture.d0 = tw?.d || 0;
        gesture.a0 = tw?.ang || 0;
    }
    H.root().querySelector('.facets-cb-bench')?.classList.add('is-moving');
}

function onMove(e) {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    const it = findItem(gesture.id);
    if (!it) return;
    const s = gesture.start;
    if (gesture.kind === 'end') {
        // Drag one end of a tape: the other end stays put; length and angle follow.
        const r = boardRect();
        if (!r) return;
        const px = Math.min(CARD_W + CARD_PAD, Math.max(-CARD_PAD, (e.clientX - r.left) / r.width * CARD_W));
        const py = Math.min(CARD_H + CARD_PAD, Math.max(-CARD_PAD, (e.clientY - r.top) / r.height * CARD_H));
        const L0 = s.w * CARD_W, a0 = s.rot * Math.PI / 180;
        const dx = Math.cos(a0) * L0 / 2, dy = Math.sin(a0) * L0 / 2;
        const cx = s.x * CARD_W, cy = s.y * CARD_H;
        const isA = gesture.end === 'a';
        const fx = isA ? cx + dx : cx - dx, fy = isA ? cy + dy : cy - dy; // the end that stays
        const vx = isA ? fx - px : px - fx, vy = isA ? fy - py : py - fy; // from end a to end b
        const len = Math.max(TAPE_LEN_MIN * CARD_W, Math.hypot(vx, vy));
        const rot = snapRot(Math.atan2(vy, vx) * 180 / Math.PI);
        const ux = Math.cos(rot * Math.PI / 180), uy = Math.sin(rot * Math.PI / 180);
        const mx = isA ? fx - ux * len / 2 : fx + ux * len / 2, my = isA ? fy - uy * len / 2 : fy + uy * len / 2;
        it.w = Math.min(ITEM_W_MAX, len / CARD_W);
        it.rot = rot;
        it.x = mx / CARD_W;
        it.y = my / CARD_H;
        gesture.moved = true;
    } else if (gesture.kind === 'rot') {
        const c = centerOf(it);
        const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
        it.rot = snapRot(s.rot + a - gesture.a0);
        gesture.moved = true;
    } else if (gesture.kind === 'size') {
        const c = centerOf(it);
        const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
        if (gesture.d0 > 4 && d > 0) { it.w = clampW(s.w * d / gesture.d0, it); it.rot = snapRot(s.rot + a - gesture.a0); gesture.moved = true; }
    } else if (pointers.size >= 2) {
        const tw = two();
        if (gesture.d0 > 0 && tw?.d > 0) {
            it.w = clampW(s.w * tw.d / gesture.d0, it);
            it.rot = snapRot(s.rot + tw.ang - gesture.a0);
            gesture.moved = true;
        }
    } else if (!gesture.multi) {
        const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
        if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
        const r = boardRect();
        if (!r) return;
        it.x = Math.min(1.5, Math.max(-0.5, s.x + dx / r.width));
        it.y = Math.min(1.5, Math.max(-0.5, s.y + dy / r.height));
        keepInArea(it); // 0.12.0: not past the dotted line
        gesture.moved = true;
    }
    paintItem(it);
}

function onUp(e) {
    if (!gesture) return;
    pointers.delete(e.pointerId);
    if (pointers.size) return;
    const g = gesture;
    gesture = null;
    H.root()?.querySelector('.facets-cb-bench')?.classList.remove('is-moving');
    if (g.moved) {
        ed.undo.push(g.snap);
        if (ed.undo.length > UNDO_MAX) ed.undo.shift();
        ed.redo = [];
        persist();
    }
    if (g.moved || !g.wasSel) H.render();
}

function onWheel(e) {
    const el = e.target.closest('.facets-cb-item');
    const it = findItem(el?.dataset.id || ed.sel);
    if (!it) return;
    e.preventDefault();
    if (!wheelSnap) wheelSnap = JSON.stringify(ed.card);
    if (e.shiftKey) it.rot = snapRot(it.rot + (e.deltaY > 0 ? 5 : -5));
    else it.w = clampW(it.w * (e.deltaY < 0 ? 1.06 : 1 / 1.06), it);
    paintItem(it);
    placeTools();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
        if (wheelSnap) { ed.undo.push(wheelSnap); ed.redo = []; wheelSnap = ''; persist(); H.render(); }
    }, 350);
}

// ---------- events from ui.js ----------

/** Clicks. Returns true when it was one of ours. */
export function cardClick(act, el) {
    switch (act) {
        case 'card-new': startCard(null); return true;
        case 'card-open': startCard(el.dataset.id); return true;
        case 'card-continue': enterEditor(); return true;
        case 'card-discard':
            H.confirmBox(t('confirm_draft_discard'), t('draft_discard')).then(async (yes) => {
                if (!yes) return;
                await H.withBusy(discardDraft);
                ed.card = null;
                H.render();
            });
            return true;
        case 'card-organize': ed.organize = !ed.organize; H.render(); return true;
        case 'card-delete': deleteCard(el.dataset.id); return true;
        case 'card-tab': H.state.stickerEdit = false; ed.tab = TABS.includes(el.dataset.tab) ? el.dataset.tab : 'pic'; H.render(); return true;
        case 'card-tape': if (['pat', 'band', 'torn'].includes(el.dataset.k)) setTape(el.dataset.k, el.dataset.v); return true;
        case 'card-tape-color': if (el.tagName === 'BUTTON') setTape('color', el.dataset.v); return true;
        case 'card-tape-add': addTape(); return true;
        case 'card-frame-w': change(c => { c.frame = { ...c.frame, w: el.dataset.v }; }); return true;
        case 'card-frame-r': change(c => { c.frame = { ...c.frame, r: el.dataset.v }; }); return true;
        case 'card-frame-color': if (el.tagName === 'BUTTON') change(c => { c.frame = { ...c.frame, color: el.dataset.v }; }); return true;
        case 'card-undo': undo(-1); return true;
        case 'card-redo': undo(1); return true;
        case 'card-bg': {
            const v = el.dataset.v;
            change(c => { c.bg = { ...c.bg, kind: v }; });
            return true;
        }
        case 'card-pat': change(c => { c.bg = { ...c.bg, kind: 'pat', pat: el.dataset.v }; }); return true;
        case 'card-color': if (el.tagName === 'BUTTON') change(c => { c.bg = { ...c.bg, color: el.dataset.v }; }); return true;
        case 'card-add-outfit': addOutfit(el.dataset.id); return true;
        case 'card-add-stk': addSticker2(el.dataset.kind === 'mine' ? 'mine' : 'basic', el.dataset.ref); return true;
        case 'card-front': moveLayer(1); return true;
        case 'card-back': moveLayer(-1); return true;
        case 'card-flip': change(c => { const it = c.items.find(x => x.id === ed.sel); if (it) it.flip = !it.flip; }); return true;
        case 'card-remove': change(c => { c.items = c.items.filter(x => x.id !== ed.sel); ed.sel = null; }); return true;
        case 'card-save': saveCard(); return true;
        case 'card-download': download(); return true;
        case 'card-stick': stickInChat(); return true;
        case 'card-sheet-done':
            if (ed.sheet?.list) { ed.sheet = null; H.render(); return true; }
            ed.sheet = null; ed.card = null; H.state.screen = 'cards'; H.render(); return true;
        case 'card-view': viewSaved(el.dataset.id); return true;
        case 'card-edit': { const id = ed.sheet?.id; ed.sheet = null; if (id) startCard(id); return true; }
        default: return false;
    }
}

/** change events (files, colour picker, opacity). Returns true when handled. */
export function cardChange(act, el) {
    switch (act) {
        case 'card-pic-file': { const f = el.files; addUploads(f).finally(() => { el.value = ''; }); return true; }
        case 'card-bg-file': { const f = el.files?.[0]; setBgFile(f).finally(() => { el.value = ''; }); return true; }
        case 'card-color': if (el.type === 'color') change(c => { c.bg = { ...c.bg, color: String(el.value).toLowerCase() }; }); return true;
        case 'card-tape-color': if (el.type === 'color') setTape('color', String(el.value).toLowerCase()); return true;
        case 'card-frame-color': if (el.type === 'color') change(c => { c.frame = { ...c.frame, color: String(el.value).toLowerCase() }; }); return true;
        case 'card-only': {
            // Save again with the new setting (the old file is replaced).
            const on = el.checked;
            change(c => { c.cardOnly = on; }, { render: false });
            saveCard();
            return true;
        }
        case 'card-opacity': {
            const it = findItem(ed.sel);
            if (!it) return true;
            const v = Math.min(1, Math.max(OPACITY_MIN, Number(el.value) / 100));
            const snap = JSON.stringify({ ...ed.card, items: ed.card.items.map(x => (x.id === it.id ? { ...x, opacity: el._facetsOp0 ?? x.opacity } : x)) });
            it.opacity = v;
            el._facetsOp0 = undefined;
            ed.undo.push(snap);
            ed.redo = [];
            persist();
            H.render();
            return true;
        }
        default: return false;
    }
}

/** input events: live opacity while the slider moves. */
export function cardInput(act, el) {
    if (act !== 'card-opacity') return false;
    const it = findItem(ed.sel);
    if (!it) return true;
    if (el._facetsOp0 === undefined) el._facetsOp0 = it.opacity;
    it.opacity = Math.min(1, Math.max(OPACITY_MIN, Number(el.value) / 100));
    const img = H.root()?.querySelector(`.facets-cb-item[data-id="${CSS.escape(it.id)}"] img`);
    if (img) img.style.opacity = String(it.opacity);
    return true;
}

/** For the outfit delete box: how many photocards draw this picture. */
export { cardsUsing } from './store.js';

export function _cardForTest() { return ed; }
