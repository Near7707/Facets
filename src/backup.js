// Backup / import / clean up. Only Facets' own settings and Facets' own uploaded files are touched.

import { t } from './i18n.js';
import { settings, save, resetAll, migrate, FORMAT, MODULE, ctx, CHAT_TABLES as STORE_TABLES } from './store.js';
import { fetchAsDataURL, uploadDataURL, deletePath, folderFor } from './images.js';
import { cardFiles, CARD_FOLDER } from './cards.js';

const PREF_KEYS = ['showInChat', 'showInList', 'tellAI', 'tellCount', 'sinceMode', 'backupImages', 'autoKeywords', 'autoPair', 'ignoreWords', 'showStage', 'stageKbHide', 'theme', 'stickerLook', 'stickerSpark'];
// Every table keyed by chat (the same list the store moves on renames), plus branch marks.
const CHAT_TABLES = [...STORE_TABLES, 'branchDone'];

export async function exportBackup(toast) {
    const s = settings();
    const out = {
        app: 'Facets',
        format: FORMAT,
        exported: new Date().toISOString(),
        prefs: Object.fromEntries(PREF_KEYS.map(k => [k, s[k]])),
        entities: structuredClone(s.entities),
        myStickers: structuredClone(s.myStickers || []), // 0.10.0
        cards: structuredClone(s.cards || []), // 0.11.0
        cardDraft: structuredClone(s.cardDraft || null),
        ...Object.fromEntries(CHAT_TABLES.map(k => [k, structuredClone(s[k] || {})])),
        images: null,
    };
    if (s.backupImages) {
        toast?.('info', t('backup_building'));
        out.images = {};
        let failed = 0;
        for (const e of Object.values(s.entities)) {
            for (const o of e.outfits) {
                for (const p of [o.orig, o.sq]) {
                    if (!p || out.images[p]) continue;
                    try { out.images[p] = await fetchAsDataURL(p); } catch { failed++; }
                }
            }
        }
        for (const m of s.myStickers || []) {
            if (!m.path || out.images[m.path]) continue;
            try { out.images[m.path] = await fetchAsDataURL(m.path); } catch { failed++; }
        }
        // 0.11.0: photocard files (finished pictures, backgrounds, pictures uploaded for a card).
        for (const c of [...(s.cards || []), ...(s.cardDraft ? [s.cardDraft.card] : [])]) {
            for (const p of cardFiles(c)) {
                if (!p || out.images[p]) continue;
                try { out.images[p] = await fetchAsDataURL(p); } catch { failed++; }
            }
        }
        if (failed) toast?.('warning', t('backup_img_failed', { n: failed }));
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = URL.createObjectURL(blob);
    a.download = `facets-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast?.('success', t('backup_saved'));
    return out;
}

export async function importBackup(file, toast) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (!data || data.app !== 'Facets' || typeof data.entities !== 'object') {
        toast?.('error', t('import_bad'));
        return false;
    }
    if (Number(data.format) > FORMAT) {
        toast?.('error', t('import_newer'));
        return false;
    }
    toast?.('info', t('importing'));
    const s = settings();
    const entities = structuredClone(data.entities);
    const tables = Object.fromEntries(CHAT_TABLES.map(k => [k, structuredClone(data[k] || {})]));
    // 0.10.0: your own stickers. Older backups have none; then the ones you have stay.
    const myStickers = Array.isArray(data.myStickers) ? structuredClone(data.myStickers) : null;
    // 0.11.0: photocards. Older backups have none; then the ones you have stay.
    const cards = Array.isArray(data.cards) ? structuredClone(data.cards) : null;
    const cardDraft = cards ? structuredClone(data.cardDraft || null) : undefined;
    if (data.images && typeof data.images === 'object') {
        const moved = new Map();
        let failed = 0;
        for (const [key, e] of Object.entries(entities)) {
            for (const o of e.outfits || []) {
                for (const field of ['orig', 'sq']) {
                    const p = o[field];
                    const img = p && data.images[p];
                    if (!img) continue;
                    if (moved.has(p)) { o[field] = moved.get(p); continue; }
                    try {
                        const stem = String(p).split('/').pop().replace(/\.[^.]+$/, '');
                        const np = await uploadDataURL(img, folderFor(key), stem);
                        moved.set(p, np);
                        o[field] = np;
                    } catch { failed++; }
                }
            }
        }
        for (const m of myStickers || []) {
            const p = m?.path;
            const img = p && data.images[p];
            if (!img) continue;
            if (moved.has(p)) { m.path = moved.get(p); continue; }
            try {
                const stem = String(p).split('/').pop().replace(/\.[^.]+$/, '');
                const np = await uploadDataURL(img, 'Facets_stickers', stem);
                moved.set(p, np);
                m.path = np;
            } catch { failed++; }
        }
        // Photocards: their own files go back into the card folder; pictures they borrow from outfits
        // or stickers follow those (already moved above).
        const cardSets = [...(cards || []), ...(cardDraft?.card ? [cardDraft.card] : [])];
        const own = new Set(cardSets.flatMap(c => cardFiles(c)));
        const remap = async (p) => {
            if (!p) return p;
            if (moved.has(p)) return moved.get(p);
            const img = own.has(p) && data.images[p];
            if (!img) return p;
            try {
                const stem = String(p).split('/').pop().replace(/\.[^.]+$/, '');
                const np = await uploadDataURL(img, CARD_FOLDER, stem);
                moved.set(p, np);
                return np;
            } catch { failed++; return p; }
        };
        for (const c of cardSets) {
            if (!c || typeof c !== 'object') continue;
            c.out = await remap(c.out);
            if (c.bg && typeof c.bg === 'object') c.bg.path = await remap(c.bg.path);
            for (const it of Array.isArray(c.items) ? c.items : []) if (it && typeof it.src === 'string') it.src = await remap(it.src);
        }
        if (cardDraft && Array.isArray(cardDraft.uploads)) {
            cardDraft.uploads = cardDraft.uploads.map(p => moved.get(p) || p);
        }
        if (failed) toast?.('warning', t('backup_img_failed', { n: failed }));
    }
    const files = s.files; // keep the full list so cleanup can still find older uploads
    s.entities = entities;
    for (const k of CHAT_TABLES) s[k] = tables[k];
    if (myStickers) s.myStickers = myStickers;
    if (cards) { s.cards = cards; s.cardDraft = cardDraft; }
    for (const k of PREF_KEYS) {
        const v = data.prefs?.[k];
        if (typeof v === 'boolean' || (k === 'tellCount' && typeof v === 'number') || (['ignoreWords', 'theme', 'stickerLook'].includes(k) && typeof v === 'string')) s[k] = v;
    }
    // 0.9.0-0.9.1 backups have followTheme instead of theme.
    if (typeof data.prefs?.theme !== 'string' && typeof data.prefs?.followTheme === 'boolean') s.theme = data.prefs.followTheme ? 'st' : 'holo';
    s.files = files;
    migrate(s);
    save();
    toast?.('success', t('import_done'));
    return true;
}

export async function cleanupAll(toast) {
    const s = settings();
    const files = [...s.files];
    const failed = [];
    let done = 0;
    for (const p of files) {
        if (await deletePath(p)) done++; else failed.push(p);
    }
    resetAll();
    // Keep only what could not be deleted, so the next cleanup can try again.
    ctx().extensionSettings[MODULE].files = failed;
    save();
    if (failed.length) toast?.('warning', t('cleanup_partial', { n: failed.length }));
    else toast?.('success', t('cleanup_done', { n: done }));
}
