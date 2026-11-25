// A small stand-in for SillyTavern's getContext(), events and chat DOM.
(function () {
    const params = new URLSearchParams(location.search);
    const listeners = {};
    const eventTypes = {
        APP_READY: 'app_ready', CHAT_CHANGED: 'chat_id_changed', CHAT_LOADED: 'chatLoaded',
        CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', USER_MESSAGE_RENDERED: 'user_message_rendered',
        MORE_MESSAGES_LOADED: 'more_messages_loaded', MESSAGE_UPDATED: 'message_updated', MESSAGE_SWIPED: 'message_swiped',
        MESSAGE_EDITED: 'message_edited', CHARACTER_PAGE_LOADED: 'character_page_loaded', PERSONA_CHANGED: 'persona_changed',
        GENERATION_STARTED: 'generation_started', CHARACTER_RENAMED: 'character_renamed', CHARACTER_DELETED: 'characterDeleted',
        PERSONA_DELETED: 'persona_deleted', CHAT_RENAMED: 'chat_renamed', CHAT_DELETED: 'chat_deleted',
    };
    const eventSource = {
        on(n, f) { (listeners[n] ||= []).push(f); },
        async emit(n, ...a) { for (const f of listeners[n] || []) await f(...a); },
    };
    const characters = [
        { name: 'Aria', avatar: 'aria.png', chat: 'Aria - 2026-01-01' },
        { name: 'Bram Longname-With-A-Very-Long-Title', avatar: 'bram.png', chat: 'Bram - 2026-01-02' },
    ];
    const personas = { 'juno.png': 'Juno', 'mika.png': 'Mika' };
    const extensionSettings = {};
    try { Object.assign(extensionSettings, JSON.parse(localStorage.getItem('facets_test_settings') || '{}')); } catch { }
    if (params.get('lang')) {
        extensionSettings.facets = extensionSettings.facets || {};
        extensionSettings.facets.lang = params.get('lang');
        extensionSettings.facets.langChosen = true;
    }
    if (params.has('fresh')) { for (const k of Object.keys(extensionSettings)) delete extensionSettings[k]; if (params.get('lang')) extensionSettings.facets = { lang: params.get('lang'), langChosen: true }; }
    const prompts = {};
    const state = { characterId: params.has('nochat') ? undefined : 0, personaMod: null, persona: 'juno.png' };

    const ctx = {
        characters, extensionSettings, eventSource, eventTypes, event_types: eventTypes,
        get characterId() { return state.characterId; },
        groupId: null,
        getCurrentLocale: () => params.get('stlocale') || 'en',
        name1: 'Juno',
        powerUserSettings: { personas },
        getCurrentChatId: () => characters[state.characterId]?.chat,
        saveSettingsDebounced: () => localStorage.setItem('facets_test_settings', JSON.stringify(extensionSettings)),
        setExtensionPrompt: (key, value) => { prompts[key] = value; document.getElementById('prompt_out').textContent = value || '(no prompt)'; },
        getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
        POPUP_TYPE: { TEXT: 1, CONFIRM: 2 },
        callGenericPopup: async (text) => (window.__confirmAnswer ?? true) ? 1 : 0,
    };
    window.SillyTavern = { getContext: () => ctx };

    const thumb = (type, file) => `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`;
    function renderChat() {
        const chat = document.getElementById('chat');
        chat.innerHTML = '';
        const ch = characters[state.characterId];
        if (!ch) return;
        for (let i = 0; i < 4; i++) addMessage(i % 2 === 1, i);
    }
    function addMessage(isUser, i) {
        const ch = characters[state.characterId];
        const chat = document.getElementById('chat');
        const div = document.createElement('div');
        div.className = 'mes';
        div.setAttribute('mesid', String(i ?? chat.children.length));
        div.setAttribute('is_user', String(isUser));
        div.setAttribute('is_system', 'false');
        div.innerHTML = `<div class="mesAvatarWrapper"><div class="avatar"><img src="${isUser ? thumb('persona', state.persona) : thumb('avatar', ch.avatar)}"></div></div>
          <div class="mes_block"><b>${isUser ? personas[state.persona] : ch.name}</b><div class="mes_text">Message ${i ?? ''}</div></div>`;
        chat.appendChild(div);
        eventSource.emit(isUser ? eventTypes.USER_MESSAGE_RENDERED : eventTypes.CHARACTER_MESSAGE_RENDERED, i);
    }
    function renderList() {
        const list = document.getElementById('rm_print_characters_block');
        list.innerHTML = characters.map((c, i) => `<div class="character_select" data-chid="${i}"><div class="avatar"><img src="${thumb('avatar', c.avatar)}"></div><span>${c.name.slice(0, 10)}</span></div>`).join('');
    }

    window.__fakeST = {
        ctx, prompts, emit: (n, ...a) => eventSource.emit(eventTypes[n.toUpperCase()] || n, ...a),
        async selectChar(i) { state.characterId = i; renderChat(); await eventSource.emit(eventTypes.CHAT_CHANGED, ctx.getCurrentChatId()); },
        async selectPersona(a) { state.persona = a; state.personaMod?._setUserAvatar(a); renderChat(); await eventSource.emit(eventTypes.PERSONA_CHANGED, a); },
        addMessage, renderChat, renderList, state,
    };

    window.__facetsBoot = (async () => {
        state.personaMod = await import('/scripts/personas.js');
        state.personaMod._setUserAvatar(state.persona);
        document.addEventListener('DOMContentLoaded', () => { });
        const theme = params.get('theme');
        if (theme === 'light') {
            document.getElementById('theme_override').textContent = `:root{--SmartThemeBodyColor:rgb(40,40,40);--SmartThemeBlurTintColor:rgba(235,232,224,0.85);--SmartThemeBorderColor:rgba(0,0,0,0.25);--SmartThemeQuoteColor:rgb(200,120,20);--SmartThemeEmColor:rgb(90,90,90)} body{background:#f3efe6;color:#222}`;
        } else if (theme === 'lowcontrast') {
            document.getElementById('theme_override').textContent = `:root{--SmartThemeBodyColor:rgb(120,120,120);--SmartThemeBlurTintColor:rgba(90,90,90,0.6);--SmartThemeQuoteColor:rgb(110,110,110)} body{background:#555}`;
        }
        const pc = document.getElementById('pick_char');
        pc.innerHTML = characters.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
        pc.onchange = () => window.__fakeST.selectChar(Number(pc.value));
        const pp = document.getElementById('pick_persona');
        pp.innerHTML = Object.entries(personas).map(([a, n]) => `<option value="${a}">${n}</option>`).join('');
        pp.onchange = () => window.__fakeST.selectPersona(pp.value);
        document.getElementById('btn_new_msg').onclick = () => addMessage(false, document.getElementById('chat').children.length);
        document.getElementById('btn_rename_char').onclick = async () => {
            const c = characters[state.characterId]; const old = c.avatar; c.avatar = 'aria2.png'; c.name = 'Aria Renamed';
            renderList(); renderChat(); await eventSource.emit(eventTypes.CHARACTER_RENAMED, old, c.avatar);
        };
        document.getElementById('btn_rename_chat').onclick = async () => {
            const c = characters[state.characterId]; const old = c.chat; c.chat = old + ' (renamed)';
            renderChat(); await eventSource.emit(eventTypes.CHAT_RENAMED, { avatarId: c.avatar, groupId: null, oldFileName: old + '.jsonl', newFileName: c.chat + '.jsonl' });
        };
        renderList();
        renderChat();
    })();
})();
