/* Navigation and keyboard support for the interface surrounding the board. */
(() => {
    const drawer = document.getElementById('drawer');
    const main = document.getElementById('main-content');
    const openButton = document.getElementById('open-btn');
    const closeButton = document.getElementById('close-btn');
    const splash = document.getElementById('splash-screen');
    const mobile = window.matchMedia('(max-width: 1023px)');
    const navButtons = [...document.querySelectorAll('[data-ui-jump]')];
    const sections = [...document.querySelectorAll('[data-ui-section]')];
    const scroller = document.getElementById('drawer-controls');
    const dialogs = [splash, ...document.querySelectorAll('body > [id$="modal"]')];
    let activeDialog = null;
    const focusOrigins = new Map();

    function labelControls(root) {
        root.querySelectorAll('button').forEach(button => {
            if (button.hasAttribute('aria-label') || button.textContent.trim()) return;
            const title = button.getAttribute('title');
            const action = `${button.getAttribute('onclick') || ''} ${button.id}`;
            if (title) button.setAttribute('aria-label', title);
            else if (/close|cancel/i.test(action)) button.setAttribute('aria-label', 'Close dialog');
        });
        root.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea').forEach(input => {
            if (input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby') || input.labels?.length) return;
            const container = input.parentElement;
            const label = container.querySelector('label, .uppercase');
            const name = label?.textContent.trim() || input.getAttribute('placeholder') ||
                input.id.replace(/-(input|select|range|toggle)$/, '').replace(/-/g, ' ');
            if (name) input.setAttribute('aria-label', name);
        });
    }
    labelControls(document);
    document.querySelectorAll('.preset-btn, .symbol-picker-tab, .sp-skin-btn, .color-btn').forEach(button => {
        const updatePressed = () => button.setAttribute('aria-pressed', String(
            button.classList.contains('active') || button.classList.contains('selected') || button.classList.contains('ring-blue-500')));
        updatePressed();
        new MutationObserver(updatePressed).observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    dialogs.forEach(dialog => {
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        const title = dialog.querySelector('h1, h2, h3');
        if (title) {
            if (!title.id) title.id = `${dialog.id}-title`;
            dialog.setAttribute('aria-labelledby', title.id);
        }
        dialog.tabIndex = -1;
    });

    function focusable(root) {
        return [...root.querySelectorAll('button, input:not([type="hidden"]), select, textarea, summary, a[href], [tabindex="0"]')]
            .filter(el => !el.disabled && !el.closest('[inert]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    }
    function canRestoreFocus(element) {
        return element?.isConnected && !element.disabled && !element.closest('[inert]') &&
            element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    }
    function refreshSurfaces() {
        const drawerOpen = drawer.classList.contains('drawer-open');
        document.body.classList.toggle('ui-drawer-open', drawerOpen);
        openButton.setAttribute('aria-expanded', String(drawerOpen));
        const play = main.classList.contains('play-mode');
        openButton.setAttribute('aria-label', play ? 'Hold to unlock editing' : 'Open settings');
        openButton.title = play ? 'Hold for 1.5 seconds to return to editing' : 'Open settings';
        document.getElementById('btn-mode-edit').setAttribute('aria-pressed', String(!play));
        document.getElementById('btn-mode-play').setAttribute('aria-pressed', String(play));
        const visible = dialogs.filter(dialog => !dialog.classList.contains('hidden'));
        visible.sort((a, b) => Number(getComputedStyle(a).zIndex) - Number(getComputedStyle(b).zIndex));
        const nextDialog = visible.at(-1) || null;
        main.inert = !!nextDialog || (drawerOpen && mobile.matches);
        drawer.inert = !!nextDialog || !drawerOpen;
        openButton.inert = !!nextDialog;
        dialogs.forEach(dialog => { dialog.inert = !!nextDialog && dialog !== nextDialog; });
        if (nextDialog !== activeDialog) {
            const previous = activeDialog;
            const previousClosed = previous && !visible.includes(previous);
            const restore = previousClosed ? focusOrigins.get(previous) : null;
            if (previousClosed) focusOrigins.delete(previous);
            activeDialog = nextDialog;
            if (nextDialog) {
                if (!focusOrigins.has(nextDialog)) focusOrigins.set(nextDialog, document.activeElement);
                labelControls(nextDialog);
                const items = focusable(nextDialog);
                const initial = canRestoreFocus(restore) && nextDialog.contains(restore) ? restore :
                    nextDialog === splash ? document.getElementById('splash-start-btn') :
                    items.find(el => el.matches('input[type="text"], input[type="search"]')) || items[0] || nextDialog;
                initial.focus({ preventScroll: true });
            } else {
                const target = canRestoreFocus(restore) ? restore : drawerOpen ? closeButton : openButton;
                target.focus({ preventScroll: true });
            }
        }
    }
    const observer = new MutationObserver(refreshSurfaces);
    [drawer, main, document.getElementById('board-folder-header'), ...dialogs].forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class'] }));
    mobile.addEventListener('change', refreshSurfaces);
    refreshSurfaces();
    document.getElementById('splash-start-btn').addEventListener('click', () => {
        if (mobile.matches) closeButton.click();
    });

    navButtons.forEach(button => button.addEventListener('click', () => {
        const section = document.getElementById(button.dataset.uiJump);
        if (!section) return;
        scroller.scrollTo({ top: section.offsetTop - scroller.offsetTop - 12,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }));
    function updateNavigation() {
        const top = scroller.getBoundingClientRect().top;
        let current = sections[0];
        sections.forEach(section => {
            if (section.getBoundingClientRect().top <= top + 85) current = section;
        });
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = sections.at(-1);
        navButtons.forEach(button => button.setAttribute('aria-current', String(button.dataset.uiJump === current?.id)));
    }
    scroller.addEventListener('scroll', updateNavigation, { passive: true });
    updateNavigation();
    document.getElementById('drawer-scrim').addEventListener('click', () => closeButton.click());
    closeButton.addEventListener('click', () => queueMicrotask(() => openButton.focus({ preventScroll: true })));
    openButton.addEventListener('click', () => {
        if (!main.classList.contains('play-mode')) {
            // Also supports keyboard activation, which has no mousedown event.
            drawer.classList.replace('drawer-closed', 'drawer-open');
            openButton.classList.add('hidden');
            refreshSurfaces();
            closeButton.focus({ preventScroll: true });
        }
    });
    openButton.addEventListener('keydown', event => {
        if (!main.classList.contains('play-mode') || event.repeat || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    openButton.addEventListener('keyup', event => {
        if (['Enter', ' '].includes(event.key)) openButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    openButton.addEventListener('blur', () => {
        openButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (activeDialog && activeDialog !== splash) {
                const dismiss = activeDialog.querySelector(':scope > [onclick*="close"], :scope > [onclick*="Close"]') ||
                    activeDialog.querySelector('button[onclick*="close"], button[onclick*="Close"], button[id$="-close"]');
                if (dismiss) { event.preventDefault(); dismiss.click(); }
            } else if (!activeDialog && drawer.classList.contains('drawer-open')) closeButton.click();
        }
        const root = activeDialog || (mobile.matches && drawer.classList.contains('drawer-open') ? drawer : null);
        if (event.key !== 'Tab' || !root) return;
        const items = focusable(root);
        if (!items.length) { event.preventDefault(); root.focus(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
            event.preventDefault(); first.focus();
        }
    });
    const grid = document.getElementById('grid-container');
    new MutationObserver(() => labelControls(grid)).observe(grid, { childList: true, subtree: true });
})();
