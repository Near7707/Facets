// Keeps the window inside the visible area on iPhone when the keyboard opens and closes.

let target = null;

function update() {
    if (!target) return;
    const vv = window.visualViewport;
    const innerH = window.innerHeight, innerW = window.innerWidth;
    let top = 0, left = 0, height = innerH, width = innerW;
    const focused = document.activeElement;
    const typing = !!focused && /^(INPUT|TEXTAREA)$/.test(focused.tagName)
        && !/^(checkbox|range|file)$/.test(focused.type || '') && target.contains(focused);
    // Only follow the visible area while typing. Right after the keyboard closes, iPhone keeps
    // reporting the small keyboard-open values for a moment, so otherwise always fill the page.
    if (vv && typing && vv.height < innerH) {
        top = vv.offsetTop; left = vv.offsetLeft; height = vv.height; width = vv.width;
    }
    target.style.setProperty('--facets-vtop', `${Math.max(0, top)}px`);
    target.style.setProperty('--facets-vleft', `${Math.max(0, left)}px`);
    target.style.setProperty('--facets-vh', `${Math.max(200, height)}px`);
    target.style.setProperty('--facets-vw', `${Math.max(200, width)}px`);
    target.classList.toggle('facets-kb', typing && height < innerH * 0.8);
}

function revealFocused() {
    update();
    const el = document.activeElement;
    if (el && target?.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName)) {
        setTimeout(() => { try { el.scrollIntoView({ block: 'nearest' }); } catch { /* ignore */ } }, 60);
    }
}

const onFocusOut = () => setTimeout(update, 50);

export function startViewport(el) {
    stopViewport();
    target = el;
    update();
    window.visualViewport?.addEventListener('resize', revealFocused);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    el.addEventListener('focusin', revealFocused);
    el.addEventListener('focusout', onFocusOut);
}

export function stopViewport() {
    window.visualViewport?.removeEventListener('resize', revealFocused);
    window.visualViewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    target?.removeEventListener('focusin', revealFocused);
    target?.removeEventListener('focusout', onFocusOut);
    target = null;
}

export { update as _updateViewportForTest };
