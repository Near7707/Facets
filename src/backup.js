// Backup / import / clean up. Only Facets' own settings and Facets' own uploaded files are touched.

import { t } from './i18n.js';
import { settings, save, resetAll, migrate, FORMAT, MODULE, ctx } from './store.js';
import { fetchAsDataURL, uploadDataURL, deletePath, folderFor } from './images.js';

const PREF_KEYS = ['showInChat', 'showInList', 'tellAI', 'tellCount', 'sinceMode', 'backupImages', 'autoKeywords', 'autoPair', 'ignoreWords', 'showStage', 'stageKbHide'];
const CHAT_TABLES = ['chats', 'timelines', 'tells', 'branchDone', 'randoms'];

export async function exportBackup(toast) {
    const s = settings();
    const out = {
        app: 'Facets',
        format: FORMAT,
        exported: new Date().toISOString(),
        prefs: Object.fromEntries(PREF_KEYS.map(k => [k, s[k]])),
        entities: structuredClone(s.entities),
        chats: structuredClone(s.chats),
        timelines: structuredClone(s.timelines),
        tells: structuredClone(s.tells),
        branchDone: structuredClone(s.branchDone),
        randoms: structuredClone(s.randoms),
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
        if (failed) toast?.('warning', t('backup_img_failed', { n: failed }));
    }
    const files = s.files; // keep the full list so cleanup can still find older uploads
    s.entities = entities;
    for (const k of CHAT_TABLES) s[k] = tables[k];
    for (const k of PREF_KEYS) {
        const v = data.prefs?.[k];
        if (typeof v === 'boolean' || (k === 'tellCount' && typeof v === 'number') || (k === 'ignoreWords' && typeof v === 'string')) s[k] = v;
    }
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
