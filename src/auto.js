// Automatic changes: keywords in AI replies, and random picks (each reply or the 🎲 button).
// Always "from that reply on" in the open chat. Picture only: nothing is told to the AI.

import {
    ctx, settings, save, getEntity, findOutfit, autoChange, dropAutoAt, randomOf, splitWords, outfitAt,
} from './store.js';
import { currentScene, messageTime } from './apply.js';

const ASCII = /^[\x20-\x7e]+$/;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words of the ignore list, split into Korean-style (checked after) and English-style (checked around). */
function ignoreLists(text) {
    const all = splitWords(text).map(w => w.toLowerCase());
    return { latin: all.filter(w => ASCII.test(w)), other: all.filter(w => !ASCII.test(w)) };
}

function wordsAround(text, start, end) {
    const before = text.slice(Math.max(0, start - 60), start).split(/[^a-z0-9']+/).filter(Boolean).slice(-4);
    const after = text.slice(end, end + 30).split(/[^a-z0-9']+/).filter(Boolean).slice(0, 2);
    return { before: ` ${before.join(' ')} `, after: ` ${after.join(' ')} ` };
}

/** True when a "not putting it on" word sits right next to this match. */
function ignored(text, start, end, ign) {
    if (ign.other.length) {
        const next = text.slice(end, end + 8);
        if (ign.other.some(w => next.includes(w))) return true;
    }
    if (ign.latin.length) {
        const { before, after } = wordsAround(text, start, end);
        if (ign.latin.some(w => before.includes(` ${w} `) || after.includes(` ${w} `))) return true;
    }
    return false;
}

/** Every place a keyword appears: [start, end]. English matches whole words (a plural "s"/"es" is fine). */
function matches(text, term) {
    const out = [];
    if (ASCII.test(term)) {
        const re = new RegExp(`(^|[^a-z0-9])(${escRe(term)}(?:e?s)?)(?![a-z0-9])`, 'g');
        let m;
        while ((m = re.exec(text))) {
            const start = m.index + m[1].length;
            out.push([start, start + m[2].length]);
            re.lastIndex = start + 1;
        }
    } else {
        let i = text.indexOf(term);
        while (i >= 0) { out.push([i, i + term.length]); i = text.indexOf(term, i + 1); }
    }
    return out;
}

/**
 * The outfit or drawer whose keyword appears last in the reply (usually the end state of the scene).
 * @returns {{ outfit?: object, drawer?: object } | null}
 */
export function findKeyword(entity, replyText, ignoreText = settings().ignoreWords) {
    const text = String(replyText || '').toLowerCase();
    if (!text || !entity) return null;
    const ign = ignoreLists(ignoreText);
    const cands = [];
    for (const o of entity.outfits) for (const w of splitWords(o.kw)) cands.push({ term: w.toLowerCase(), outfit: o });
    for (const d of entity.drawers) for (const w of splitWords(d.kw)) cands.push({ term: w.toLowerCase(), drawer: d });
    let best = null;
    for (const c of cands) {
        for (const [start, end] of matches(text, c.term)) {
            if (ignored(text, start, end, ign)) continue;
            const better = !best || end > best.end
                || (end === best.end && c.outfit && !best.c.outfit)
                || (end === best.end && !!c.outfit === !!best.c.outfit && c.term.length > best.c.term.length);
            if (better) best = { end, c };
        }
    }
    if (!best) return null;
    return best.c.outfit ? { outfit: best.c.outfit } : { drawer: best.c.drawer };
}

/** Pick one outfit at random from a drawer ('' = all), never the one worn now. */
export function pickRandom(entity, drawerId, currentId) {
    const useDrawer = drawerId && entity.drawers.some(d => d.id === drawerId);
    const pool = entity.outfits.filter(o => (!useDrawer || o.drawers.includes(drawerId)) && o.id !== currentId);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/** What one entity should change into because of this reply, or null. */
function decide(key, text, chatKey, t, allowRandom) {
    const s = settings();
    const e = getEntity(key);
    if (!e?.outfits.length) return null;
    const cur = outfitAt(key, chatKey, t)?.id || null;
    const hit = s.autoKeywords ? findKeyword(e, text) : null;
    if (hit?.outfit) return hit.outfit.id !== cur ? { id: hit.outfit.id, src: 'kw' } : null;
    if (hit?.drawer) {
        // Already wearing something from that drawer: keep it.
        if (cur && findOutfit(key, cur)?.drawers.includes(hit.drawer.id)) return null;
        const o = pickRandom(e, hit.drawer.id, cur);
        return o ? { id: o.id, src: 'kw' } : null;
    }
    const range = allowRandom ? randomOf(chatKey, key) : undefined;
    if (range === undefined) return null;
    const o = pickRandom(e, range, cur);
    return o ? { id: o.id, src: 'rnd' } : null;
}

/** Add the partner of each changed outfit (only when the setting says so and the partner did not change itself). */
function withPartners(changes) {
    if (!settings().autoPair) return changes;
    const out = [...changes];
    for (const c of changes) {
        const o = findOutfit(c.key, c.id);
        if (!o?.pair || !findOutfit(o.pair.key, o.pair.id)) continue;
        if (out.some(x => x.key === o.pair.key)) continue;
        out.push({ key: o.pair.key, id: o.pair.id, src: c.src, partner: true });
    }
    return out;
}

/**
 * A finished AI reply in the open one-on-one chat.
 * @param {number} mesId
 * @param {string} type SillyTavern's type: normal, swipe, regenerate, continue, first_message, …
 * @returns {{ key: string, id: string, src: string, t: number, partner?: boolean }[]} what changed
 */
export function onReply(mesId, type = 'normal') {
    const sc = currentScene();
    if (!sc.chatKey || sc.inGroup || !sc.charKey) return [];
    if (['first_message', 'impersonate', 'quiet'].includes(String(type))) return [];
    const chat = ctx().chat || [];
    const mi = Number(mesId);
    const m = chat[mi];
    // Only the newest reply, made by the AI.
    if (!m || m.is_user || m.is_system || mi !== chat.length - 1) return [];
    const sent = messageTime(m);
    const t = Number.isFinite(sent) ? sent : Date.now();
    const text = String(m.mes || '');
    const keys = [sc.charKey, sc.personaKey].filter(Boolean);
    // 0.12.2: without streaming, a continue arrives as "appendFinal".
    const isContinue = ['continue', 'append', 'appendFinal'].includes(String(type));
    let dropped = false;
    if (!isContinue) {
        // A swipe or regenerate replaces this reply's earlier automatic changes.
        for (const k of keys) if (dropAutoAt(sc.chatKey, k, mi)) dropped = true;
    }
    const own = [];
    for (const k of keys) {
        const d = decide(k, text, sc.chatKey, t, !isContinue);
        if (!d) continue;
        if (isContinue && d.src !== 'kw') continue;
        own.push({ key: k, ...d });
    }
    const all = withPartners(own);
    for (const c of all) {
        if (isContinue) dropAutoAt(sc.chatKey, c.key, mi, 'kw');
        autoChange(sc.chatKey, c.key, c.id, { t, mi, src: c.src });
    }
    if (all.length || dropped) save(); // 0.12.2: also when an old change was only taken away
    return all.map(c => ({ ...c, t }));
}

/** The 🎲 button: a random outfit from the drawer tab, from now on in this chat. */
export function rollDice(key, drawerId, now = Date.now()) {
    const sc = currentScene();
    const e = getEntity(key);
    if (!sc.chatKey || !e) return null;
    const cur = outfitAt(key, sc.chatKey, now)?.id || null;
    const o = pickRandom(e, drawerId, cur);
    if (!o) return null;
    const all = withPartners([{ key, id: o.id, src: 'rnd' }]);
    for (const c of all) autoChange(sc.chatKey, c.key, c.id, { t: now, src: 'rnd' });
    save();
    return o;
}
