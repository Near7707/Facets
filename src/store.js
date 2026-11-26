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
    backupImages: true,
    // key -> { name, outfits: Outfit[], drawers: Drawer[], global: outfitId|null }
    // key is "char:<avatar file>" or "persona:<avatar file>"
    entities: {},
    // "<character avatar>::<chat file name>" -> { entityKey: outfitId | DEFAULT_MARK }
    chats: {},
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

/**
 * Change one entity (and its matching-set partner).
 * @param {string} entityKey
 * @param {string|null} outfitId null = default look
 * @param {'chat'|'all'} scope
 * @param {string|null} chatKey
 */
export function choose(entityKey, outfitId, scope, chatKey) {
    setOne(entityKey, outfitId, scope, chatKey);
    const o = findOutfit(entityKey, outfitId);
    if (o?.pair && findOutfit(o.pair.key, o.pair.id)) {
        setOne(o.pair.key, o.pair.id, scope, chatKey);
    }
    save();
}

function setOne(entityKey, outfitId, scope, chatKey) {
    const s = settings();
    const e = getEntity(entityKey, true);
    if (scope === 'chat' && chatKey) {
        const row = s.chats[chatKey] || (s.chats[chatKey] = {});
        row[entityKey] = outfitId || DEFAULT_MARK;
    } else {
        e.global = outfitId || null;
        // "Whole character" applies to every chat: drop per-chat picks for this entity.
        for (const [k, row] of Object.entries(s.chats)) {
            if (entityKey in row) {
                delete row[entityKey];
                if (!Object.keys(row).length) delete s.chats[k];
            }
        }
    }
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
    for (const [k, row] of Object.entries(s.chats)) {
        if (oldKey in row) { row[newKey] = row[oldKey]; delete row[oldKey]; }
        if (k.startsWith(oldAvatar + '::')) {
            const nk = newAvatar + k.slice(oldAvatar.length);
            if (!s.chats[nk]) s.chats[nk] = row;
            delete s.chats[k];
        }
    }
    save();
}

export function onChatRenamed(avatar, oldFile, newFile) {
    const strip = (f) => String(f || '').replace(/\.jsonl$/i, '');
    const oldKey = chatKeyFor(avatar, strip(oldFile));
    const newKey = chatKeyFor(avatar, strip(newFile));
    const s = settings();
    if (!oldKey || !newKey || !s.chats[oldKey]) return;
    // If something is already stored under the new name we can't tell which is right: keep both as they are.
    if (s.chats[newKey]) return;
    s.chats[newKey] = s.chats[oldKey];
    delete s.chats[oldKey];
    save();
}

export function onChatDeleted(avatar, chatName) {
    const key = chatKeyFor(avatar, chatName);
    const s = settings();
    if (key && s.chats[key]) {
        delete s.chats[key];
        save();
    }
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
    for (const [k, row] of Object.entries(s.chats)) {
        delete row[key];
        if (isCharKey(key) && k.startsWith(avatar + '::')) delete s.chats[k];
        else if (!Object.keys(row).length) delete s.chats[k];
    }
    save();
    return files.filter(Boolean);
}
