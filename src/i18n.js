// All on-screen text lives here. English is the base; Korean is optional.
// Values inserted with {name} are never translated again.

const STRINGS = {
    en: {
        ext_name: 'Facets',
        open_wardrobe: 'Open Wardrobe',
        settings_hint: 'Keep several looks for each character and persona, and change them per chat.',
        settings_hint_nochat: 'Opened outside a chat: you can organize outfits and change the look for the whole character.',
        version: 'Version {v}',

        tab_character: 'Character',
        tab_persona: 'Persona',
        close: 'Close',
        settings: 'Settings',
        back: 'Back',

        status_chat: 'This chat: {a}',
        status_all: 'All chats: {b}',
        status_follow: 'same as all',
        default_look: 'Default look',
        badge_default: 'Default',
        scope_chat: 'This chat only',
        scope_all: 'Whole character',
        scope_all_persona: 'Whole persona',
        organize: 'Organize',
        done: 'Done',
        add_outfit: 'Add outfits',
        empty_title: 'No outfits yet',
        empty_body: 'Tap "Organize", then "Add outfits" to put pictures here. You can pick several at once.',
        no_character: 'Open a chat with a character first.',
        no_persona: 'No persona is selected.',
        group_unsupported: 'Group chats are not supported yet.',
        pick_character: 'Choose a character',
        pick_persona: 'Choose a persona',

        changed_chat: 'Changed for this chat: {name}',
        changed_all: 'Changed for all chats: {name}',
        reverted: 'Back to the default look',

        edit_outfit: 'Edit outfit',
        fit_square: 'Fit to square',
        replace_image: 'Replace image',
        name_label: 'Name',
        name_note: 'Only you see this',
        name_ph: 'e.g. Suit',
        desc_label: 'Look description',
        desc_note: 'Sent to the AI',
        desc_ph: 'e.g. black suit / night beach / bandage on arm',
        pair_label: 'Matching set',
        pair_none: 'Not paired',
        pair_change: 'Change',
        pair_pick_title: 'Pick the matching outfit',
        pair_remove: 'Remove pairing',
        pair_hint_char: 'Pairs with a persona outfit. Changing one changes the other.',
        pair_hint_persona: 'Pairs with a character outfit. Changing one changes the other.',
        pair_no_targets: 'There are no outfits on the other side yet.',
        delete_outfit: 'Delete this outfit',
        save: 'Save',
        cancel: 'Cancel',
        apply: 'Apply',
        saved: 'Saved',
        confirm_delete_outfit: 'Delete "{name}"? The picture file is deleted too. This cannot be undone.',
        delete: 'Delete',
        drag_handle: 'Drag to reorder',
        tap_to_edit: 'Tap to edit',

        crop_title: 'Fit to square',
        crop_hint: 'Drag to move. Zoom out to fit more of the picture.',
        zoom: 'Zoom',
        zoom_out: 'Zoom out',
        zoom_in: 'Zoom in',
        reset: 'Reset',

        settings_title: 'Settings',
        show_where: 'Where to show',
        show_chat: 'Chat message avatars',
        show_list: 'Character list',
        tell_ai: 'Tell the AI the look description',
        tell_ai_note: 'Adds the current look descriptions to the prompt.',
        language: 'Language',
        backup: 'Backup',
        backup_images: 'Include picture files',
        backup_images_note: 'One file moves everything to another device, but it can be large.',
        backup_download: 'Download backup',
        backup_import: 'Import',
        danger: 'Careful',
        cleanup: 'Clean up data',
        cleanup_note: 'Deletes every picture Facets uploaded and all Facets settings. Chats and character cards are not touched.',
        confirm_cleanup: 'This deletes all Facets pictures and settings. This cannot be undone. Continue?',
        cleanup_done: 'Facets data was cleaned up ({n} files deleted).',
        cleanup_partial: 'Cleaned up, but {n} files could not be deleted.',

        uploading: 'Adding {n} pictures…',
        added: 'Outfits added: {n}',
        upload_failed: 'Could not upload "{name}".',
        delete_failed: 'Could not delete a picture file. It is kept in the list so cleanup can try again.',
        not_image: '"{name}" is not a picture.',
        backup_saved: 'Backup downloaded',
        backup_building: 'Preparing backup…',
        backup_img_failed: '{n} pictures could not be included.',
        confirm_import: 'Importing replaces the current Facets outfits and choices. Continue?',
        import_done: 'Imported',
        import_bad: 'This file is not a Facets backup.',
        import_newer: 'This backup was made by a newer Facets. Update Facets first.',
        importing: 'Importing…',
        load_failed: 'Picture not found',
        busy: 'Please wait…',
        outfit_n: 'Outfit {n}',
    },
    ko: {
        ext_name: 'Facets',
        open_wardrobe: '옷장 열기',
        settings_hint: '캐릭터와 페르소나마다 모습을 여러 벌 넣어 두고, 채팅마다 갈아입혀요.',
        settings_hint_nochat: '채팅 밖에서 열었어요. 옷 정리와 캐릭터 전체 갈아입기만 할 수 있어요.',
        version: '버전 {v}',

        tab_character: '캐릭터',
        tab_persona: '페르소나',
        close: '닫기',
        settings: '설정',
        back: '뒤로',

        status_chat: '이 채팅: {a}',
        status_all: '전체: {b}',
        status_follow: '전체와 같음',
        default_look: '원래 모습',
        badge_default: '기본',
        scope_chat: '이 채팅만',
        scope_all: '캐릭터 전체',
        scope_all_persona: '페르소나 전체',
        organize: '옷 정리',
        done: '다 했어요',
        add_outfit: '옷 추가',
        empty_title: '아직 옷이 없어요',
        empty_body: '"옷 정리" → "옷 추가"를 눌러 그림을 넣어 주세요. 여러 장을 한 번에 고를 수 있어요.',
        no_character: '먼저 캐릭터와 채팅을 열어 주세요.',
        no_persona: '선택된 페르소나가 없어요.',
        group_unsupported: '그룹 채팅은 아직 지원하지 않아요.',
        pick_character: '캐릭터 고르기',
        pick_persona: '페르소나 고르기',

        changed_chat: '이 채팅만 갈아입었어요: {name}',
        changed_all: '전체를 갈아입었어요: {name}',
        reverted: '원래 모습으로 돌아왔어요',

        edit_outfit: '옷 고치기',
        fit_square: '정사각형 맞추기',
        replace_image: '그림 바꾸기',
        name_label: '이름',
        name_note: '나만 봐요',
        name_ph: '예: 정장',
        desc_label: '모습 설명',
        desc_note: 'AI에게 보내요',
        desc_ph: '예: 검은 정장 / 밤바다 / 팔에 붕대',
        pair_label: '커플룩',
        pair_none: '짝 없음',
        pair_change: '바꾸기',
        pair_pick_title: '짝이 될 옷 고르기',
        pair_remove: '짝 풀기',
        pair_hint_char: '페르소나 옷과 짝을 지어요. 한쪽을 갈아입으면 짝도 같이 바뀌어요.',
        pair_hint_persona: '캐릭터 옷과 짝을 지어요. 한쪽을 갈아입으면 짝도 같이 바뀌어요.',
        pair_no_targets: '상대 쪽에 아직 옷이 없어요.',
        delete_outfit: '이 옷 지우기',
        save: '저장',
        cancel: '취소',
        apply: '적용',
        saved: '저장했어요',
        confirm_delete_outfit: '"{name}"을(를) 지울까요? 그림 파일도 함께 지워지고, 되돌릴 수 없어요.',
        delete: '지우기',
        drag_handle: '끌어서 순서 바꾸기',
        tap_to_edit: '눌러서 고치기',

        crop_title: '정사각형 맞추기',
        crop_hint: '끌어서 옮기고, 축소하면 더 넓게 담을 수 있어요.',
        zoom: '크기',
        zoom_out: '축소',
        zoom_in: '확대',
        reset: '처음대로',

        settings_title: '설정',
        show_where: '보이는 곳',
        show_chat: '채팅 아바타',
        show_list: '캐릭터 목록',
        tell_ai: 'AI에게 모습 설명 알려주기',
        tell_ai_note: '지금 입은 옷의 모습 설명을 프롬프트에 넣어요.',
        language: '언어 · Language',
        backup: '백업',
        backup_images: '그림 파일도 넣기',
        backup_images_note: '파일 하나로 다른 기기에 다 옮길 수 있지만, 파일이 커질 수 있어요.',
        backup_download: '백업 내려받기',
        backup_import: '가져오기',
        danger: '조심',
        cleanup: '데이터 정리',
        cleanup_note: 'Facets가 올린 그림 파일과 Facets 설정을 모두 지워요. 채팅과 캐릭터 카드는 건드리지 않아요.',
        confirm_cleanup: 'Facets 그림과 설정을 모두 지워요. 되돌릴 수 없어요. 계속할까요?',
        cleanup_done: 'Facets 데이터를 정리했어요 (파일 {n}개 삭제).',
        cleanup_partial: '정리했지만, 파일 {n}개는 지우지 못했어요.',

        uploading: '그림 {n}장 넣는 중…',
        added: '옷 {n}벌을 넣었어요',
        upload_failed: '"{name}"을(를) 올리지 못했어요.',
        delete_failed: '그림 파일을 지우지 못했어요. 나중에 데이터 정리로 다시 지울 수 있게 목록에 남겨 둘게요.',
        not_image: '"{name}"은(는) 그림이 아니에요.',
        backup_saved: '백업을 내려받았어요',
        backup_building: '백업 준비 중…',
        backup_img_failed: '그림 {n}장은 넣지 못했어요.',
        confirm_import: '가져오면 지금 Facets 옷과 선택이 바뀌어요. 계속할까요?',
        import_done: '가져왔어요',
        import_bad: 'Facets 백업 파일이 아니에요.',
        import_newer: '더 새 버전 Facets로 만든 백업이에요. 먼저 Facets를 업데이트해 주세요.',
        importing: '가져오는 중…',
        load_failed: '그림을 찾을 수 없어요',
        busy: '잠깐만요…',
        outfit_n: '옷 {n}',
    },
};

export const LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'ko', label: '한국어' },
];

let current = 'en';

export function setLanguage(lang) {
    current = STRINGS[lang] ? lang : 'en';
}

export function getLanguage() {
    return current;
}

/**
 * Look up a string and fill in {placeholders}. Inserted values are used as-is.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
    const table = STRINGS[current] || STRINGS.en;
    let text = table[key] ?? STRINGS.en[key] ?? key;
    if (vars) {
        // Single pass so a value containing "{x}" is never expanded again.
        text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    }
    return text;
}

export function _allKeysForTest() {
    return { en: Object.keys(STRINGS.en), ko: Object.keys(STRINGS.ko) };
}
