// Shows the chosen outfits on avatars and passes look descriptions to the AI.
// Only reads/changes <img> elements on screen; chat data is never modified.

import {
    ctx, settings, charKey, personaKey, effectiveOutfit, chatOnlyOutfit, chatKeyFor, findOutfit, chatChoice,
    outfitAt, tellOf, setupBranch, DEFAULT_MARK, frameOf, timelineOf,
} from './store.js';
import { urlOf } from './images.js';
import { frameCss } from './deco.js';

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

/** A branch or checkpoint chat starts with the outfits of the chat it came from (read-only look at chat metadata). */
export function checkBranch() {
    const scene = currentScene();
    if (!scene.chatKey || !scene.character) return false;
    let parent = '';
    try { parent = String(ctx().chatMetadata?.main_chat || ''); } catch { /* ignore */ }
    if (!parent) return false;
    return setupBranch(scene.chatKey, chatKeyFor(scene.character.avatar, parent.replace(/\.jsonl$/i, '')));
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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * When a message was sent, in ms. SillyTavern uses ISO times; very old chats use "January 1, 2026 9:05am".
 * Unknown → Infinity (shown with the current outfit).
 */
export function messageTime(mes) {
    const v = mes?.send_date;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'string' || !v.trim()) return Infinity;
    const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(v.trim());
    if (m) {
        const month = MONTHS.indexOf(m[1].toLowerCase());
        if (month >= 0) {
            let h = Number(m[4]) % 12;
            if (!m[7]) h = Number(m[4]);
            else if (m[7].toLowerCase() === 'pm') h += 12;
            return new Date(Number(m[3]), month, Number(m[2]), h, Number(m[5]), Number(m[6] || 0)).getTime();
        }
    }
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : Infinity;
}

function chatMessage(img) {
    const id = img.closest('.mes')?.getAttribute('mesid');
    if (id === null || id === undefined) return null;
    return ctx().chat?.[Number(id)] || null;
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
        // With a "from now on" history each message shows the outfit of its own time.
        setImg(img, key, outfitAt(key, scene.chatKey, messageTime(chatMessage(img))));
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

/** Welcome screen "recent chats": each row shows the look of that chat. */
export function applyRecent() {
    const s = settings();
    for (const row of document.querySelectorAll('#chat .recentChat')) {
        const img = row.querySelector('.avatar img');
        if (!img) continue;
        const avatar = row.getAttribute('data-avatar');
        if (!s.showInList || row.classList.contains('group') || !avatar) {
            if (img.dataset.facetsApplied) restoreImg(img);
            continue;
        }
        const file = String(row.getAttribute('data-file') || '').replace(/\.jsonl$/, '');
        const key = charKey(avatar);
        setImg(img, key, effectiveOutfit(key, chatKeyFor(avatar, file)));
    }
}

/** The big picture on the character's info page shows the "whole character" look. */
export function applyPreview() {
    const img = document.getElementById('avatar_load_preview');
    if (!img) return;
    const now = img.getAttribute('src') || '';
    if (img.dataset.facetsApplied && now !== img.dataset.facetsApplied) {
        // SillyTavern put a new picture here (another character, or a new avatar being uploaded).
        delete img.dataset.facetsApplied;
        delete img.dataset.facetsKey;
        delete img.dataset.facetsOutfit;
        img.classList.remove('facets-avatar');
    }
    const key = settings().showInList ? keyFromSrc(originalSrc(img)) : null;
    if (!key || !key.startsWith('char:')) {
        if (img.dataset.facetsApplied) restoreImg(img);
        return;
    }
    setImg(img, key, effectiveOutfit(key, null));
}

export function restoreEverything() {
    document.querySelectorAll('img.facets-avatar').forEach(restoreImg);
    document.querySelectorAll('img[data-facets-frame]').forEach(img => delete img.dataset.facetsFrame);
    document.getElementById('facets_frames')?.remove();
    lastFrameCss = '';
}

// ---- Avatar frames (0.8.0) ----
// Decoration only: a mark on the chat's avatar pictures and one <style> of our own.
// The rings and ribbons are drawn around the avatar with ::before / ::after; nothing is moved or resized.
// 0.9.2: they hang on the box AROUND the avatar (.mesAvatarWrapper), because themes or other extensions
// can give .avatar "overflow: hidden", which cut off everything drawn outside the picture.

let lastFrameCss = '';

const holderSel = (wrap, tag) => wrap
    ? [`#chat .mes .mesAvatarWrapper:has(img[data-facets-frame="${tag}"])`, `#chat .mes .mesAvatarWrapper:has(img[data-facets-frame="${tag}"]) .avatar`]
    : [`#chat .mes .avatar:has(img[data-facets-frame="${tag}"])`, `#chat .mes .avatar img[data-facets-frame="${tag}"]`];

export function applyFrames() {
    const sc = currentScene();
    const want = { c: null, p: null };
    if (sc.chatKey && !sc.inGroup) {
        want.c = frameOf(sc.chatKey, sc.charKey);
        want.p = sc.personaKey ? frameOf(sc.chatKey, sc.personaKey) : null;
    }
    let radius = '';
    let box = null;
    let wrap = true;
    for (const img of document.querySelectorAll('#chat .mes .avatar img')) {
        const key = (want.c || want.p) ? keyFromSrc(originalSrc(img)) : null;
        const tag = key && key === sc.charKey && want.c ? 'c' : key && key === sc.personaKey && want.p ? 'p' : '';
        if (tag) {
            if (img.dataset.facetsFrame !== tag) img.dataset.facetsFrame = tag;
            if (!box) {
                // Where the picture sits in its holder box (every chat avatar has the same size).
                const holder = img.closest('.mesAvatarWrapper') || img.closest('.avatar');
                wrap = !!holder?.classList.contains('mesAvatarWrapper');
                const r = img.getBoundingClientRect();
                const o = holder?.getBoundingClientRect();
                if (o && r.width > 0 && r.height > 0) {
                    box = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
                    radius = getComputedStyle(img).borderRadius;
                }
            }
        } else if (img.dataset.facetsFrame) delete img.dataset.facetsFrame;
    }
    // The ring follows the avatar's own corner radius (round, square, rounded or tall rectangle).
    const r = /^[\d.]+(px|%)$/.test(radius) ? radius : '50%';
    const C = holderSel(wrap, 'c'), P = holderSel(wrap, 'p');
    const css = frameCss(C[0], C[1], want.c, r, box) + frameCss(P[0], P[1], want.p, r, box);
    if (css === lastFrameCss) return;
    lastFrameCss = css;
    let el = document.getElementById('facets_frames');
    if (!css) { el?.remove(); return; }
    if (!el) {
        el = document.createElement('style');
        el.id = 'facets_frames';
        document.head.appendChild(el);
    }
    el.textContent = css;
}

// Other parts (the "in the chat" pictures) that redraw with the avatars.
const extraAppliers = [];
export function onApply(fn) { extraAppliers.push(fn); }

let raf = 0;
export function applyAllSoon() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        try { applyChat(); applyFrames(); applyList(); applyRecent(); applyPreview(); updatePrompt(); } catch (e) { console.error('[Facets]', e); }
        for (const fn of extraAppliers) {
            try { fn(); } catch (e) { console.error('[Facets]', e); }
        }
    });
}

/** AI replies in this chat sent after `since`. While regenerating, the reply being replaced is not counted. */
function repliesSince(since, skipLast) {
    const chat = ctx().chat || [];
    let end = chat.length;
    if (skipLast && end && !chat[end - 1]?.is_user) end--;
    let n = 0;
    for (let i = 0; i < end; i++) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system) continue;
        if (messageTime(m) > since) n++;
    }
    return n;
}

/**
 * Whether the look of one entity is being described to the AI in the open chat.
 * kind: off | nochat | notchat | default | empty | always | sending | muted | done | none
 */
function isAutoNow(entityKey, chatKey) {
    const tl = timelineOf(chatKey, entityKey);
    const last = tl?.points[tl.points.length - 1];
    return !!last?.src;
}

export function tellStatus(entityKey, chatKey, skipLast = false) {
    const s = settings();
    if (!s.tellAI) return { kind: 'off' };
    if (!chatKey || !entityKey) return { kind: 'nochat' };
    const pick = chatChoice(chatKey, entityKey);
    if (pick === undefined) return { kind: 'notchat' };
    if (pick === DEFAULT_MARK) return { kind: 'default' };
    const o = chatOnlyOutfit(entityKey, chatKey);
    const desc = o?.desc?.trim() || '';
    if (!desc) return { kind: 'empty' };
    const cell = tellOf(chatKey, entityKey);
    // 0.9.1: an outfit put on by 🎲 or 🔑 is never told (not even with "every time"),
    // unless the user pressed [Tell again] afterwards.
    if (isAutoNow(entityKey, chatKey) && !cell) return { kind: 'auto' };
    if (!s.tellCount) return { kind: 'always', desc };
    if (!cell) return { kind: 'none', desc };
    if (cell.muted) return { kind: 'muted', desc };
    const left = s.tellCount - repliesSince(cell.t, skipLast);
    return left > 0 ? { kind: 'sending', left, desc } : { kind: 'done', desc };
}

// Generation type while a reply is being made, so redraws during it keep the same count.
let pendingGen = '';
export function setPendingGeneration(type) { pendingGen = String(type || ''); }

// How many messages from the end the "just changed" note goes.
const UPDATE_DEPTH = 2;

/** @param {string} [genType] SillyTavern's generation type ("swipe", "regenerate", "continue", …) */
export function updatePrompt(genType = pendingGen) {
    const c = ctx();
    const s = settings();
    const scene = currentScene();
    const lines = [];
    const skipLast = ['swipe', 'regenerate', 'continue'].includes(String(genType || ''));
    // Only "This chat only" picks are described; a whole-character pick changes the picture only.
    if (s.tellAI && scene.character && !scene.inGroup && scene.chatKey) {
        const who = [[scene.charKey, scene.character.name]];
        if (scene.personaKey) who.push([scene.personaKey, personaName(scene.personaAvatar)]);
        for (const [key, name] of who) {
            const st = tellStatus(key, scene.chatKey, skipLast);
            if (st.kind === 'always' || st.kind === 'sending') lines.push(`${name}: ${st.desc}`);
        }
    }
    let text = '';
    if (lines.length && !s.tellCount) {
        text = `[Appearance reference]\n${lines.join('\n')}\n`
          + '(Default look for reference only. If the story has shown a change of clothes or appearance, follow the story. '
          + 'Mention the look only when it matters to the scene; do not bring it up on its own.)';
    } else if (lines.length) {
        text = `[Appearance update]\n${lines.join('\n')}\n`
          + '(This is how they look now; the look has just changed. Do not write a scene of changing clothes. '
          + 'Mention the look only when it matters to the scene. If the story has since shown a different look, follow the story.)';
    }
    // "Always" text stays fixed, so it sits high in the prompt (0 = after the story string).
    // The short "just changed" note comes and goes, so it goes into the chat near the end
    // (1 = in chat, depth 2) to keep the cached part of the prompt unchanged.
    // No world-info scan, system role.
    const inChat = !!s.tellCount;
    c.setExtensionPrompt(PROMPT_KEY, text, inChat ? 1 : 0, inChat ? UPDATE_DEPTH : 0, false, 0);
}

/** After SillyTavern opens its zoomed avatar, show the outfit's full picture instead. */
export function fixZoom(avatarEl) {
    const img = avatarEl?.querySelector('img');
    if (!img?.dataset.facetsApplied) return;
    const outfit = findOutfit(img.dataset.facetsKey, img.dataset.facetsOutfit);
    if (!outfit) return;
    const full = urlOf(outfit.orig || outfit.sq);
    // The hidden template also has a .zoomed_avatar; the newest real one is last.
    const boxes = [...document.querySelectorAll('.zoomed_avatar')].filter(z => !z.closest('.template_element'));
    const target = boxes[boxes.length - 1]?.querySelector('img');
    if (!target) return;
    const $ = globalThis.jQuery;
    const box = target.closest('.zoomed_avatar_container');
    // The magnifier remembers the picture it started with and puts it back on mouse-out.
    // Turn it off, swap the picture, and turn it on again so it remembers the outfit.
    const magnifier = !!(ctx().powerUserSettings?.zoomed_avatar_magnification && $ && box && $.fn?.izoomify);
    if (magnifier) $(box).trigger('izoomify.destroy');
    target.setAttribute('src', full);
    target.setAttribute('data-izoomify-url', full);
    if (magnifier) $(box).izoomify();
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
                    if (!(img instanceof HTMLImageElement) || !(img.closest('.avatar') || img.id === 'avatar_load_preview')) continue;
                    if (img.dataset.facetsApplied === img.getAttribute('src')) continue;
                    applyAllSoon();
                    return;
                }
                for (const n of m.addedNodes) {
                    if (n.nodeType === 1 && (n.matches('.mes, .avatar, [data-chid], .recentChat') || n.querySelector('.avatar img'))) {
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
    watch('#avatar_load_preview');
}

export function stopObservers() {
    observers.forEach(o => o.disconnect());
    observers = [];
}
