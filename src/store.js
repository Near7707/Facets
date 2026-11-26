// Facets data lives only in extension settings (never in cards, chat files or chat metadata).

export const MODULE = 'facets';
export const FORMAT = 1;
export const DEFAULT_MARK = '__default__';

const DEFAULTS = Object.freeze({
    format: FORMAT,
    lang: 'en',
    langChosen: false, // false = follow SillyTavern's language
    showInChat: true,
    showInList: true,
    tellAI: false, // off until the user turns it on
    tellCount: 3, // after a change, describe the look for this many AI replies (0 = every time)
    sinceMode: false, // "From now on": a change keeps older messages in the older outfit
    backupImages: true,
    // key -> { name, outfits: Outfit[], drawers: Drawer[], global: outfitId|null }
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

export function migrate(s) {
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    if (typeof s.format !== 'number') s.format = FORMAT;
    // Future format upgrades go here: if (s.format < 2) { ...; s.format = 2; }
    if (!Array.isArray(s.files)) s.files = [];
    for (const k of ['chats', 'timelines', 'tells', 'branchDone']) {
        if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
    }
    if (![0, 1, 3, 5].includes(s.tellCount)) s.tellCount = 3;
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
        for (const d of e.drawers) if (typeof d.name !== 'string') d.name = '';
        const drawerIds = new Set(e.drawers.map(d => d.id));
        for (const o of e.outfits) {
            if (o.pair === undefined) o.pair = null;
            if (typeof o.desc !== 'string') o.desc = '';
            if (typeof o.name !== 'string') o.name = '';
            if (!Array.isArray(o.drawers)) o.drawers = [];
            o.drawers = [...new Set(o.drawers.filter(id => drawerIds.has(id)))];
        }
    }
    return s;
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
    const d = { id: newId(), name: String(name || '').trim().slice(0, 40) };
    e.drawers.push(d);
    return d;
}

export function renameDrawer(entityKey, drawerId, name) {
    const d = getEntity(entityKey)?.drawers.find(x => x.id === drawerId);
    if (d) d.name = String(name || '').trim().slice(0, 40);
}

/** Removes the drawer only. The outfits inside stay in the wardrobe. */
export function deleteDrawer(entityKey, drawerId) {
    const e = getEntity(entityKey);
    if (!e) return;
    e.drawers = e.drawers.filter(d => d.id !== drawerId);
    for (const o of e.outfits) o.drawers = o.drawers.filter(id => id !== drawerId);
}

// Tables keyed by chat, each row keyed by entity.
const CHAT_TABLES = ['chats', 'timelines', 'tells'];

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
        for (const table of CHAT_TABLES) {
            for (const k of Object.keys(s[table])) dropCell(table, k, entityKey);
        }
    }
}

/** Remove one change from a chat's history. */
export function deletePoint(chatKey, entityKey, t) {
    const tl = timelineOf(chatKey, entityKey);
    if (!tl) return;
    tl.points = tl.points.filter(p => p.t !== t);
    const row = rowOf('chats', chatKey, true);
    if (tl.points.length) {
        row[entityKey] = tl.points[tl.points.length - 1].id;
    } else {
        if (tl.base === null) dropCell('chats', chatKey, entityKey);
        else row[entityKey] = tl.base;
        dropCell('timelines', chatKey, entityKey);
    }
    if (!descNow(entityKey, chatKey)) dropCell('tells', chatKey, entityKey);
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
