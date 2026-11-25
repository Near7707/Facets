// Shows the chosen outfits on avatars and passes look descriptions to the AI.
// Only reads/changes <img> elements on screen; chat data is never modified.

import { ctx, settings, charKey, personaKey, effectiveOutfit, chatKeyFor, findOutfit } from './store.js';
import { urlOf } from './images.js';

const PROMPT_KEY = 'facets_appearance';
let personaModule = null;
let lastPersona = '';

export async function initPersonaSource() {
    try {
        // Read-only live value of the selected persona.
        personaModule = await import('../../../../personas.js');
    } catch {
        personaModule = null;
    }
}

export function setPersonaHint(avatar) {
    if (avatar) lastPersona = String(avatar);
}

/** Avatar file of the persona in use, or ''. */
export function currentPersonaAvatar() {
    const fromModule = personaModule?.user_avatar;
    if (fromModule) return String(fromModule);
    if (lastPersona) return lastPersona;
    const sel = document.querySelector('#user_avatar_block .avatar-container.selected');
    return sel?.getAttribute('data-avatar-id') || '';
}

export function personaName(avatar) {
    const c = ctx();
    return c.powerUserSettings?.personas?.[avatar] || c.name1 || avatar;
}

export function currentCharacter() {
    const c = ctx();
    if (c.groupId) return null;
    const ch = c.characters?.[c.characterId];
    return ch && ch.avatar && ch.avatar !== 'none' ? ch : null;
}

/** The chat being shown, as Facets sees it. */
export function currentScene() {
    const c = ctx();
    const ch = currentCharacter();
    const chatId = c.groupId ? null : c.getCurrentChatId?.();
    const persona = currentPersonaAvatar();
    return {
        inGroup: !!c.groupId,
        character: ch,
        charKey: ch ? charKey(ch.avatar) : null,
        personaAvatar: persona,
        personaKey: persona ? personaKey(persona) : null,
        chatKey: ch && chatId ? chatKeyFor(ch.avatar, chatId) : null,
    };
}

/** Parse "/thumbnail?type=avatar&file=X" style URLs into an entity key. */
function keyFromSrc(src) {
    if (!src) return null;
    try {
        const u = new URL(src, location.origin);
        const file = u.searchParams.get('file') || u.searchParams.get('facets');
        if (!file) {
            // Thumbnails turned off: plain file paths.
            const p = decodeURIComponent(u.pathname);
            let m = /\/characters\/([^/]+)$/.exec(p);
            if (m) return charKey(m[1]);
            m = /\/User Avatars\/([^/]+)$/.exec(p);
            return m ? personaKey(m[1]) : null;
        }
        const type = u.searchParams.get('type');
        if (type === 'persona') return personaKey(file);
        if (type === 'avatar') return charKey(file);
        // Our own URL carries ?facets=<file>&kind=<char|persona>
        const kind = u.searchParams.get('kind');
        if (kind === 'persona') return personaKey(file);
        if (kind === 'char') return charKey(file);
    } catch { /* ignore */ }
    return null;
}

/** URL we put on the avatar. The ?facets= part keeps SillyTavern's zoom working. */
function shownUrl(outfit, entityKey) {
    const file = entityKey.slice(entityKey.indexOf(':') + 1);
    const kind = entityKey.startsWith('persona:') ? 'persona' : 'char';
    return `${urlOf(outfit.sq || outfit.orig)}?kind=${kind}&facets=${encodeURIComponent(file)}`;
}

function setImg(img, entityKey, outfit) {
    const applied = img.dataset.facetsApplied;
    const now = img.getAttribute('src') || '';
    if (applied && now !== applied) {
        // SillyTavern re-drew this avatar; take its value as the new original.
        delete img.dataset.facetsApplied;
        img.dataset.facetsOrig = now;
    } else if (!applied) {
        img.dataset.facetsOrig = now;
    }
    if (outfit) {
        const url = shownUrl(outfit, entityKey);
        img.dataset.facetsKey = entityKey;
        img.dataset.facetsOutfit = outfit.id;
        if (img.getAttribute('src') !== url) img.setAttribute('src', url);
        img.dataset.facetsApplied = url;
        img.classList.add('facets-avatar');
    } else if (img.dataset.facetsApplied || img.classList.contains('facets-avatar')) {
        restoreImg(img);
    }
}

function restoreImg(img) {
    const orig = img.dataset.facetsOrig;
    if (orig != null && img.dataset.facetsApplied) img.setAttribute('src', orig);
    delete img.dataset.facetsApplied;
    delete img.dataset.facetsKey;
    delete img.dataset.facetsOutfit;
    img.classList.remove('facets-avatar');
}

function originalSrc(img) {
    const applied = img.dataset.facetsApplied;
    const now = img.getAttribute('src') || '';
    if (applied && now === applied) return img.dataset.facetsOrig || '';
    return now;
}

export function applyChat() {
    const s = settings();
    const scene = currentScene();
    const imgs = document.querySelectorAll('#chat .mes .avatar img');
    for (const img of imgs) {
        if (!s.showInChat || scene.inGroup) { if (img.dataset.facetsApplied) restoreImg(img); continue; }
        const key = keyFromSrc(originalSrc(img));
        // In a one-on-one chat only the open character and personas are handled.
        if (!key || (key.startsWith('char:') && key !== scene.charKey)) {
            if (img.dataset.facetsApplied) restoreImg(img);
            continue;
        }
        setImg(img, key, effectiveOutfit(key, scene.chatKey));
    }
}

export function applyList() {
    const s = settings();
    const c = ctx();
    const blocks = document.querySelectorAll('#rm_print_characters_block [data-chid]');
    for (const block of blocks) {
        const img = block.querySelector('.avatar img');
        if (!img) continue;
        const ch = c.characters?.[block.getAttribute('data-chid')];
        if (!s.showInList || !ch?.avatar) { if (img.dataset.facetsApplied) restoreImg(img); continue; }
        const key = charKey(ch.avatar);
        setImg(img, key, effectiveOutfit(key, null));
    }
}

export function restoreEverything() {
    document.querySelectorAll('img.facets-avatar').forEach(restoreImg);
}

let raf = 0;
export function applyAllSoon() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        try { applyChat(); applyList(); updatePrompt(); } catch (e) { console.error('[Facets]', e); }
    });
}

export function updatePrompt() {
    const c = ctx();
    const s = settings();
    const scene = currentScene();
    const lines = [];
    if (s.tellAI && scene.character && !scene.inGroup) {
        const co = effectiveOutfit(scene.charKey, scene.chatKey);
        if (co?.desc?.trim()) lines.push(`${scene.character.name}: ${co.desc.trim()}`);
        if (scene.personaKey) {
            const po = effectiveOutfit(scene.personaKey, scene.chatKey);
            if (po?.desc?.trim()) lines.push(`${personaName(scene.personaAvatar)}: ${po.desc.trim()}`);
        }
    }
    const text = lines.length ? `[Current appearance]\n${lines.join('\n')}` : '';
    // 0 = in prompt (after the story string), depth 0, no world-info scan, system role.
    c.setExtensionPrompt(PROMPT_KEY, text, 0, 0, false, 0);
}

/** After SillyTavern opens its zoomed avatar, show the outfit's full picture instead. */
export function fixZoom(avatarEl) {
    const img = avatarEl?.querySelector('img');
    if (!img?.dataset.facetsApplied) return;
    const outfit = findOutfit(img.dataset.facetsKey, img.dataset.facetsOutfit);
    if (!outfit) return;
    const full = urlOf(outfit.orig || outfit.sq);
    const zooms = document.querySelectorAll('.zoomed_avatar img');
    const target = zooms[zooms.length - 1];
    if (target) {
        target.setAttribute('src', full);
        target.setAttribute('data-izoomify-url', full);
    }
}

let observers = [];
export function startObservers() {
    stopObservers();
    const watch = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const mo = new MutationObserver((list) => {
            // Ignore changes we caused ourselves.
            // Streaming text changes are ignored: only new avatars or changed avatar pictures matter.
            for (const m of list) {
                if (m.type === 'attributes') {
                    const img = m.target;
                    if (!(img instanceof HTMLImageElement) || !img.closest('.avatar')) continue;
                    if (img.dataset.facetsApplied === img.getAttribute('src')) continue;
                    applyAllSoon();
                    return;
                }
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1 && (n.matches('.mes, .avatar, [data-chid]') || n.querySelector('.avatar img'))) {
                        applyAllSoon();
                        return;
                    }
                }
            }
        });
        mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        observers.push(mo);
    };
    watch('#chat');
    watch('#rm_print_characters_block');
}

export function stopObservers() {
    observers.forEach(o => o.disconnect());
    observers = [];
}
