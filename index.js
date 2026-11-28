// Facets — keep several looks ("outfits") per character and persona, and change them per chat.
// Uses only SillyTavern's public paths: getContext, events, extension prompts and the image API.
// It never patches window.fetch and never writes to character cards, chat files or chat metadata.

import { t, setLanguage, getLanguage, LANGUAGES } from './src/i18n.js';
import {
    ctx, settings, save, uiLang, chooseLang, charKey, personaKey, removeEntity,
    onCharacterRenamed, onChatRenamed, onChatDeleted, THEMES,
} from './src/store.js';
import { deletePath } from './src/images.js';
import {
    initPersonaSource, setPersonaHint, applyAllSoon, updatePrompt, fixZoom,
    startObservers, currentScene, checkBranch, setPendingGeneration,
} from './src/apply.js';
import { openWardrobe, refreshIfOpen, setVersion, isOpen, requestClose, rerender, notifyAuto } from './src/ui.js';
import { onReply } from './src/auto.js';
import { initStage } from './src/stage.js';

export const VERSION = '0.12.1';
setVersion(VERSION);

function themeOptions() {
    const cur = settings().theme;
    return THEMES.map(id => `<option value="${id}"${id === cur ? ' selected' : ''}>${t(`theme_${id}`)}</option>`).join('');
}

function langOptions() {
    return LANGUAGES.map(l => `<option value="${l.id}"${l.id === getLanguage() ? ' selected' : ''}>${l.label}</option>`).join('');
}

function settingsPanelHtml() {
    return `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>${t('ext_name')}</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="facets-panel-hint">${t('settings_hint')}</div>
          <button type="button" class="menu_button facets-panel-open" data-facets-open>
            <i class="fa-solid fa-shirt"></i><span>${t('open_wardrobe')}</span>
          </button>
          <label class="facets-panel-lang">
            <span>${t('language')}</span>
            <select class="text_pole facets-panel-select" data-facets-lang>${langOptions()}</select>
          </label>
          <label class="facets-panel-lang facets-panel-theme">
            <span>${t('theme_title')}</span>
            <select class="text_pole facets-panel-select" data-facets-theme>${themeOptions()}</select>
          </label>
          <div class="facets-panel-version">${t('version', { v: VERSION })}</div>
        </div>
      </div>`;
}

function mountSettingsPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    let panel = document.getElementById('facets_settings');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'facets_settings';
        panel.className = 'facets-panel';
        panel.innerHTML = settingsPanelHtml();
        host.appendChild(panel);
        panel.addEventListener('click', (e) => {
            if (e.target.closest('[data-facets-open]')) openWardrobe({ fromSettings: true });
        });
        panel.addEventListener('change', (e) => {
            const box = e.target.closest('[data-facets-theme]');
            if (box) {
                if (THEMES.includes(box.value)) settings().theme = box.value;
                save();
                rerender();
                return;
            }
            const sel = e.target.closest('[data-facets-lang]');
            if (!sel) return;
            chooseLang(sel.value);
            setLanguage(sel.value);
            document.dispatchEvent(new CustomEvent('facets:lang'));
            rerender();
        });
    } else {
        // Language change: refresh only the text, keep the drawer open/closed as it is.
        panel.querySelector('.inline-drawer-header b').textContent = t('ext_name');
        panel.querySelector('.facets-panel-hint').textContent = t('settings_hint');
        panel.querySelector('.facets-panel-open span').textContent = t('open_wardrobe');
        panel.querySelector('.facets-panel-lang span').textContent = t('language');
        panel.querySelector('[data-facets-lang]').innerHTML = langOptions();
        panel.querySelector('.facets-panel-version').textContent = t('version', { v: VERSION });
        const theme = panel.querySelector('.facets-panel-theme span');
        if (theme) theme.textContent = t('theme_title');
        const tsel = panel.querySelector('[data-facets-theme]');
        if (tsel) tsel.innerHTML = themeOptions();
    }
}

function mountWand() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;
    let item = document.getElementById('facets_wand');
    if (!item) {
        item = document.createElement('div');
        item.id = 'facets_wand';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-shirt extensionsMenuExtensionButton"></div><span></span>';
        // Inside a one-on-one chat it opens for that chat; anywhere else it opens with the pickers.
        item.addEventListener('click', () => openWardrobe({ fromSettings: !currentScene().chatKey }));
        menu.appendChild(item);
    }
    item.querySelector('span').textContent = t('ext_name');
    item.title = t('open_wardrobe');
}

async function removeFiles(paths) {
    for (const p of paths) await deletePath(p);
    save();
}

function registerEvents() {
    const { eventSource, eventTypes } = ctx();
    const ev = eventTypes || ctx().event_types;
    const on = (name, fn) => { if (name) eventSource.on(name, fn); };

    on(ev.CHAT_CHANGED, () => {
        try { checkBranch(); } catch (e) { console.error('[Facets]', e); }
        applyAllSoon();
        if (isOpen()) refreshIfOpen();
    });
    for (const name of [ev.CHARACTER_MESSAGE_RENDERED, ev.USER_MESSAGE_RENDERED, ev.MORE_MESSAGES_LOADED,
        ev.MESSAGE_UPDATED, ev.MESSAGE_SWIPED, ev.MESSAGE_EDITED, ev.CHAT_LOADED, ev.CHARACTER_PAGE_LOADED]) {
        on(name, applyAllSoon);
    }
    // New replies change "N left" in the wardrobe.
    for (const name of [ev.CHARACTER_MESSAGE_RENDERED, ev.MESSAGE_SWIPED, ev.MESSAGE_DELETED]) {
        on(name, () => refreshIfOpen());
    }
    // A finished AI reply: keywords and "random each reply" (from that reply on).
    on(ev.MESSAGE_RECEIVED, (mesId, type) => {
        try {
            const changes = onReply(mesId, type);
            if (changes.length) {
                applyAllSoon();
                refreshIfOpen();
                notifyAuto(changes);
            }
        } catch (e) { console.error('[Facets]', e); }
    });
    on(ev.PERSONA_CHANGED, (avatar) => {
        setPersonaHint(avatar);
        applyAllSoon();
        refreshIfOpen();
    });
    on(ev.GENERATION_STARTED, (type, _opts, dryRun) => {
        try {
            if (!dryRun) setPendingGeneration(type);
            updatePrompt(dryRun ? type : undefined);
        } catch (e) { console.error('[Facets]', e); }
    });
    for (const name of [ev.GENERATION_ENDED, ev.GENERATION_STOPPED]) {
        on(name, () => { setPendingGeneration(''); applyAllSoon(); });
    }
    on(ev.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
        onCharacterRenamed(oldAvatar, newAvatar);
        applyAllSoon();
    });
    on(ev.CHARACTER_DELETED, (data) => {
        const avatar = data?.character?.avatar;
        if (avatar) removeFiles(removeEntity(charKey(avatar)));
        applyAllSoon();
    });
    on(ev.PERSONA_DELETED, (data) => {
        const avatar = data?.avatarId;
        if (avatar) removeFiles(removeEntity(personaKey(avatar)));
        applyAllSoon();
    });
    on(ev.CHAT_RENAMED, (data) => {
        if (data?.groupId) return;
        onChatRenamed(data?.avatarId, data?.oldFileName, data?.newFileName);
        applyAllSoon();
    });
    on(ev.CHAT_DELETED, (name) => {
        const ch = currentScene().character;
        if (ch) onChatDeleted(ch.avatar, name);
    });
    on(ev.APP_READY, () => {
        mountWand();
        startObservers();
        applyAllSoon();
    });
}

function registerZoomFix() {
    // Runs after SillyTavern's own zoom handler (registered earlier), then swaps in the full picture.
    const $ = globalThis.jQuery;
    if ($) {
        $(document).on('click', '.mes .avatar', function () {
            const el = this;
            setTimeout(() => fixZoom(el), 0);
        });
    }
}

async function init() {
    settings();
    setLanguage(uiLang());
    await initPersonaSource();
    mountSettingsPanel();
    mountWand();
    registerEvents();
    registerZoomFix();
    initStage();
    startObservers();
    applyAllSoon();
    document.addEventListener('facets:lang', () => { mountSettingsPanel(); mountWand(); });
    // The theme picker lives in both places; keep the drawer one in step with ⚙.
    document.addEventListener('facets:theme', () => {
        const box = document.querySelector('#facets_settings [data-facets-theme]');
        if (box) box.value = settings().theme;
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) requestClose();
    });
}

// Wait for jQuery-ready like other extensions do.
if (globalThis.jQuery) globalThis.jQuery(() => { init().catch(e => console.error('[Facets] init', e)); });
else init().catch(e => console.error('[Facets] init', e));
