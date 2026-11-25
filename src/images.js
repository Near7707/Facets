// Picture files: upload/delete through SillyTavern's own image API, and square crops.
// Facets never patches window.fetch; it only makes its own normal requests.

import { ctx, addFile, dropFile } from './store.js';

export const SQ_SIZE = 512;
const OK_FORMATS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

/** Turn a stored path ("user/images/...") into a URL the browser can load. */
export function urlOf(path) {
    if (!path) return '';
    if (/^(data:|blob:|https?:)/.test(path)) return path;
    return '/' + String(path).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
}

export function folderFor(entityKey) {
    const [kind, avatar] = [entityKey.slice(0, entityKey.indexOf(':')), entityKey.slice(entityKey.indexOf(':') + 1)];
    const stem = avatar.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'unnamed';
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

/** Delete a file Facets uploaded. Returns true when it is gone. */
export async function deletePath(path) {
    if (!path) return true;
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
 * Crop settings: the picture is drawn at `scale` (1 = whole picture fits inside the square)
 * and moved by (x, y) as a fraction of the square size from the centre.
 * @typedef {{ scale: number, x: number, y: number }} Crop
 */

/** A first guess: fill the square, keep the top (faces are usually near the top). */
export function autoCrop(w, h) {
    const cover = Math.max(w, h) / Math.min(w, h); // scale that fills the square
    const drawnH = (h / Math.max(w, h)) * cover;    // picture height in square units
    const y = h > w ? (drawnH - 1) / 2 : 0;         // align top edge with the square
    return { scale: cover, x: 0, y };
}

/** Render a crop to a square data URL (webp, transparent outside the picture). */
export function renderCrop(img, crop, size = SQ_SIZE) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const w = img.naturalWidth, h = img.naturalHeight;
    const fit = size / Math.max(w, h);
    const dw = w * fit * crop.scale, dh = h * fit * crop.scale;
    const dx = (size - dw) / 2 + crop.x * size;
    const dy = (size - dh) / 2 + crop.y * size;
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
