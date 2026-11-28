// Picture files: upload/delete through SillyTavern's own image API, and square crops.
// Facets never patches window.fetch; it only makes its own normal requests.

import { ctx, addFile, dropFile } from './store.js';

export const SQ_SIZE = 512;
const OK_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

/** Turn a stored path ("user/images/...") into a URL the browser can load. */
export function urlOf(path) {
    if (!path) return '';
    if (/^(data:|blob:|https?:)/.test(path)) return path;
    // SillyTavern hands back "#" and "?" already as %23 / %3F (0.12.2: don't encode them twice).
    return '/' + String(path).replace(/^\/+/, '').split('/')
        .map(seg => encodeURIComponent(seg.replace(/%23/gi, '#').replace(/%3F/gi, '?'))).join('/');
}

export function folderFor(entityKey) {
    const [kind, avatar] = [entityKey.slice(0, entityKey.indexOf(':')), entityKey.slice(entityKey.indexOf(':') + 1)];
    const stem = avatar.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#%]/g, '_').slice(0, 60) || 'unnamed';
    return kind === 'persona' ? `Facets_persona_${stem}` : `Facets_${stem}`;
}

export function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });
}

function splitDataURL(dataURL) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataURL);
    if (!m) return null;
    let format = (m[1].split('/')[1] || '').toLowerCase();
    if (format === 'jpeg') format = 'jpg';
    return { mime: m[1], format, base64: m[3] };
}

/**
 * Upload a data URL. Returns the stored path. Throws on failure.
 * @param {string} dataURL
 * @param {string} folder
 * @param {string} filename without extension
 */
export async function uploadDataURL(dataURL, folder, filename) {
    let parts = splitDataURL(dataURL);
    if (!parts || !OK_FORMATS.includes(parts.format)) {
        // Unknown format (e.g. heic): convert to png in the browser.
        const img = await loadImage(dataURL);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        parts = splitDataURL(c.toDataURL('image/png'));
    }
    const res = await fetch('/api/images/upload', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ image: parts.base64, format: parts.format, ch_name: folder, filename }),
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const data = await res.json();
    if (!data?.path) throw new Error('upload: no path');
    const path = String(data.path).replace(/\\/g, '/');
    addFile(path);
    return path;
}

/**
 * 0.12.2: whether a stored path is one of Facets' own files (user/images/Facets_…/file).
 * Facets never asks to delete anything else, even if a (broken or edited) backup points there.
 */
export function isOwnPath(path) {
    const n = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (n.split('/').some(seg => seg === '..' || seg === '.' || /^%2e%2e$/i.test(seg))) return false;
    return /^user\/images\/Facets_[^/]+\/[^/]+$/.test(n);
}

/** Delete a file Facets uploaded. Returns true when it is gone. */
export async function deletePath(path) {
    if (!path) return true;
    if (!isOwnPath(path)) { dropFile(path); return true; } // not ours: forget it, leave the file alone
    try {
        const res = await fetch('/api/images/delete', {
            method: 'POST',
            headers: ctx().getRequestHeaders(),
            body: JSON.stringify({ path }),
        });
        if (res.ok || res.status === 404) {
            dropFile(path);
            return true;
        }
    } catch { /* reported by caller */ }
    return false;
}

/**
 * Crop settings. The frame has an aspect (width / height): 1 = square, 2/3 = tall.
 * The picture is drawn at `scale` (1 = whole picture fits inside the frame) and moved by
 * (x, y) as fractions of the frame width / height from the centre.
 * @typedef {{ scale: number, x: number, y: number, aspect: number }} Crop
 */

/** Frame shape that matches SillyTavern's avatar style: tall for "Rectangle", square otherwise. */
export function avatarAspect() {
    return document.body?.classList.contains('big-avatars') ? 2 / 3 : 1;
}

/** Avatar style name, used only for the guide drawn on the crop frame. */
export function avatarStyle() {
    const b = document.body?.classList;
    if (b?.contains('big-avatars')) return 'rect';
    if (b?.contains('square-avatars')) return 'square';
    if (b?.contains('rounded-avatars')) return 'rounded';
    return 'round';
}

/** Scale at which the picture just fills the frame. */
export function coverScale(w, h, aspect = 1) {
    const FW = 1, FH = 1 / aspect;
    const fit = Math.min(FW / w, FH / h);
    return Math.max(FW / (w * fit), FH / (h * fit));
}

/** A first guess: fill the frame, keep the top (faces are usually near the top). */
export function autoCrop(w, h, aspect = 1) {
    const FW = 1, FH = 1 / aspect;
    const fit = Math.min(FW / w, FH / h);
    const scale = coverScale(w, h, aspect);
    const dh = h * fit * scale;
    const y = Math.max(0, (dh - FH) / (2 * FH));
    return { scale, x: 0, y, aspect };
}

/** Render a crop to a data URL (webp, transparent outside the picture). */
export function renderCrop(img, crop, base = SQ_SIZE) {
    const aspect = crop.aspect || 1;
    const OW = Math.round(aspect >= 1 ? base : base * aspect * 1.2);
    const OH = Math.round(OW / aspect);
    const c = document.createElement('canvas');
    c.width = OW; c.height = OH;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const w = img.naturalWidth, h = img.naturalHeight;
    const fit = Math.min(OW / w, OH / h);
    const dw = w * fit * crop.scale, dh = h * fit * crop.scale;
    const dx = (OW - dw) / 2 + crop.x * OW;
    const dy = (OH - dh) / 2 + crop.y * OH;
    g.drawImage(img, dx, dy, dw, dh);
    let out = c.toDataURL('image/webp', 0.9);
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
    return out;
}

export async function fetchAsDataURL(path) {
    const res = await fetch(urlOf(path), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`get ${res.status}`);
    return readAsDataURL(await res.blob());
}
