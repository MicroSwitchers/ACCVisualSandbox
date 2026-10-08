/* Folder editing uses drafts; navigation and moves commit one complete tree. */
(() => {
    const modal = document.getElementById('folder-link-modal');
    const nameInput = document.getElementById('folder-link-rename-input');
    const error = document.getElementById('folder-name-error');
    const openAfter = document.getElementById('folder-open-after');
    const tree = document.getElementById('folder-tree-container');
    const status = document.getElementById('folder-map-status');
    const expanded = new Map();
    let draft = null;
    let creationIndex = null;
    let editingId = null;
    let moveSource = null;
    let moveTarget = null;
    let mapOpen = false;
    const icons = {
        folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
        home: '<path d="m3 10 9-7 9 7v10H3ZM9 20v-7h6v7"/>',
        chevron: '<path d="m9 5 7 7-7 7"/>',
        back: '<path d="m14 5-7 7 7 7"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m21 16-5-5L5 21"/>',
        search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
        text: '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
        move: '<path d="M4 12h16m-5-5 5 5-5 5M4 5v14"/>'
    };
    const presets = [
        ['Food', '\uD83C\uDF4E'], ['Play', '\uD83E\uDDF8'],
        ['People', '\uD83D\uDC4B'], ['Places', '\uD83C\uDFE0'],
        ['Feelings', '\uD83D\uDE0A'], ['Activities', '\uD83C\uDFA8']
    ];
    function svg(type) {
        return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[type] || icons.folder}</svg>`;
    }
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function button(className, label, callback, icon) {
        const node = el('button', className);
        node.type = 'button';
        if (icon) node.innerHTML = svg(icon);
        if (label) node.append(el('span', '', label));
        node.addEventListener('click', callback);
        return node;
    }
    function newId() {
        return 'folder_' + (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
    }
    function ensureFolders(items, seen = new Set()) {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            if (!item?.isFolder) return;
            if (!item.folderId || seen.has(item.folderId)) item.folderId = newId();
            seen.add(item.folderId);
            if (!Array.isArray(item.folderGridData)) item.folderGridData = Array(config.rows * config.cols).fill(null);
            ensureFolders(item.folderGridData, seen);
        });
    }
    function pathTo(root, id, path = []) {
        for (let index = 0; index < root.length; index++) {
            const item = root[index];
            if (!item?.isFolder) continue;
            const next = [...path, index];
            if (item.folderId === id) return next;
            const child = pathTo(item.folderGridData || [], id, next);
            if (child) return child;
        }
        return null;
    }
    function activeId() {
        const frame = folderNavigationStack.at(-1);
        return frame?.gridDataSnapshot[frame.folderCellIndex]?.folderId || null;
    }
    function scopeAt(root, id) {
        if (!id || id === 'root') return root;
        const path = pathTo(root, id);
        if (!path) return null;
        let scope = root;
        for (const index of path) scope = scope[index].folderGridData;
        return scope;
    }
    function folderAt(root, id) {
        const path = pathTo(root, id);
        if (!path) return null;
        let scope = root;
        for (let i = 0; i < path.length - 1; i++) scope = scope[path[i]].folderGridData;
        return { item: scope[path.at(-1)], scope, index: path.at(-1) };
    }
    window.getRootGridData = function() {
        let current = huntActive && Array.isArray(huntRestore) ? huntRestore : gridData;
        for (let i = folderNavigationStack.length - 1; i >= 0; i--) {
            const frame = folderNavigationStack[i];
            const parent = frame.gridDataSnapshot.slice();
            parent[frame.folderCellIndex] = { ...parent[frame.folderCellIndex], folderGridData: current.slice() };
            current = parent;
        }
        return current;
    };
    function commit(root, destination = activeId()) {
        ensureFolders(root);
        const path = destination ? pathTo(root, destination) : null;
        const stack = [];
        let scope = root;
        for (const index of path || []) {
            const folder = scope[index];
            expanded.set(folder.folderId, true);
            stack.push({ gridDataSnapshot: scope.slice(), folderCellIndex: index, folderLabel: folder.label || 'Folder' });
            scope = folder.folderGridData;
        }
        folderNavigationStack = stack;
        gridData = scope;
        updateFolderBackButton();
        renderGrid();
        renderFolderTree();
        debouncedSave();
    }
    function revealBoard() {
        if (matchMedia('(max-width: 1023px)').matches) toggleDrawer(false);
    }
    function prepareNavigation() {
        if (gameActive) stopGame();
        if (huntActive) stopHuntGame();
        huntSelected = null;
    }
    window.openFolderById = function(id) {
        prepareNavigation();
        const root = getRootGridData();
        if (!pathTo(root, id)) return;
        commit(root, id);
        revealBoard();
    };
    window.openFolder = function(index) {
        const item = gridData[index];
        if (!item?.isFolder) return;
        ensureFolders(gridData);
        openFolderById(item.folderId);
    };
    window.navigateHome = function() { prepareNavigation(); commit(getRootGridData(), null); revealBoard(); };
    window.navigateUpToLevel = function(index) {
        if (index >= folderNavigationStack.length - 1) return;
        prepareNavigation();
        const frame = folderNavigationStack[index];
        commit(getRootGridData(), frame?.gridDataSnapshot[frame.folderCellIndex]?.folderId || null);
    };
    function thumbnail(item, className) {
        const node = el('span', className);
        if (item?.folderImage) {
            const image = el('img'); image.src = item.folderImage; image.alt = ''; node.append(image);
        } else if (item?.folderSymbol) node.textContent = item.folderSymbol;
        else if (item?.folderText) node.append(el('span', 'folder-thumb-text', item.folderText));
        else node.innerHTML = svg('folder');
        return node;
    }
    function countLabel(items) {
        const count = (items || []).filter(Boolean).length;
        return `${count} ${count === 1 ? 'item' : 'items'}`;
    }
    window.updateFolderBackButton = function() {
        const header = document.getElementById('board-folder-header');
        const frame = folderNavigationStack.at(-1);
        const menu = document.getElementById('open-btn');
        // Keep the existing button and its hold-to-unlock listeners across navigation.
        if (menu.parentElement === header) document.body.append(menu);
        header.replaceChildren();
        header.classList.toggle('hidden', !frame);
        header.classList.toggle('flex', !!frame);
        if (!frame) return;
        const back = button('folder-back', 'Back', () => navigateUpToLevel(folderNavigationStack.length - 2), 'back');
        back.setAttribute('aria-label', 'Back to ' + (folderNavigationStack.at(-2)?.folderLabel || 'Home'));
        back.title = back.getAttribute('aria-label');
        const trail = el('nav', 'folder-breadcrumbs'); trail.setAttribute('aria-label', 'Folder path');
        trail.append(button('folder-home-crumb', 'Home', () => navigateHome(), 'home'));
        folderNavigationStack.forEach((entry, index) => {
            if (config.mode === 'play' && index !== folderNavigationStack.length - 1) return;
            const chevron = el('span', 'folder-crumb-divider'); chevron.innerHTML = svg('chevron'); trail.append(chevron);
            if (index === folderNavigationStack.length - 1) {
                const current = el('span', 'folder-current-crumb', entry.folderLabel);
                current.setAttribute('aria-current', 'location'); current.title = entry.folderLabel; trail.append(current);
            } else trail.append(button('', entry.folderLabel, () => navigateUpToLevel(index)));
        });
        header.append(menu, back, trail);
        if (config.mode === 'edit') {
            const settings = button('folder-path-settings', '', () => openFolderLinkModalById(activeId()), 'settings');
            settings.setAttribute('aria-label', 'Edit this folder'); settings.title = 'Edit this folder'; header.append(settings);
        }
        requestAnimationFrame(() => { trail.scrollLeft = trail.scrollWidth; });
    };
    window.renderFolderTree = function() {
        if (!tree) return;
        const focused = tree.contains(document.activeElement) ? document.activeElement.dataset.folderFocus : null;
        const root = getRootGridData();
        ensureFolders(root);
        const current = activeId();
        tree.replaceChildren();
        const home = button('folder-home-row', 'Home', () => navigateHome(), 'home');
        home.dataset.folderFocus = 'home';
        if (!current) home.setAttribute('aria-current', 'location');
        home.append(el('small', '', countLabel(root)));
        tree.append(home);
        let total = 0;
        function branch(items, depth = 0) {
            const list = el('ul', 'folder-list');
            items.forEach(item => {
                if (!item?.isFolder) return;
                total++;
                const li = el('li'); const row = el('div', 'folder-tree-row');
                row.style.setProperty('--folder-depth', Math.min(depth, 4));
                row.classList.toggle('is-current', item.folderId === current);
                const children = item.folderGridData || [];
                const hasFolders = children.some(child => child?.isFolder);
                const isExpanded = expanded.get(item.folderId) !== false;
                const toggle = button('folder-tree-toggle', '', () => {
                    expanded.set(item.folderId, !isExpanded); renderFolderTree();
                }, 'chevron');
                toggle.dataset.folderFocus = `expand-${item.folderId}`;
                toggle.setAttribute('aria-label', `${isExpanded ? 'Collapse' : 'Expand'} ${item.label || 'Folder'}`);
                toggle.setAttribute('aria-expanded', String(isExpanded));
                toggle.classList.toggle('is-expanded', isExpanded);
                toggle.classList.toggle('is-leaf', !hasFolders);
                toggle.disabled = !hasFolders;
                const open = button('folder-tree-open', '', () => openFolderById(item.folderId));
                open.dataset.folderFocus = `open-${item.folderId}`;
                if (item.folderId === current) open.setAttribute('aria-current', 'location');
                open.append(thumbnail(item, 'folder-tree-thumb'));
                const text = el('span', 'folder-tree-copy');
                text.append(el('span', 'folder-tree-name', item.label || 'Folder'), el('small', '', countLabel(children)));
                open.append(text); open.title = item.label || 'Folder';
                const settings = button('folder-tree-settings', '', () => openFolderLinkModalById(item.folderId), 'settings');
                settings.dataset.folderFocus = `settings-${item.folderId}`;
                settings.setAttribute('aria-label', `Edit ${item.label || 'folder'}`);
                settings.title = `Edit ${item.label || 'folder'}`;
                row.append(toggle, open, settings); li.append(row);
                if (hasFolders) { const nested = branch(children, depth + 1); nested.hidden = !isExpanded; li.append(nested); }
                list.append(li);
            });
            return list;
        }
        const folders = branch(root);
        if (total) tree.append(folders);
        else {
            const empty = el('div', 'folder-map-empty');
            empty.innerHTML = svg('folder');
            empty.append(el('strong', '', 'A place for related symbols'), el('p', '', 'Create a folder for food, people, activities, or anything you need.'));
            tree.append(empty);
        }
        document.getElementById('folder-map-count').textContent = total ? String(total) : '';
        document.getElementById('folder-map-new').disabled = config.mode !== 'edit';
        if (focused) [...tree.querySelectorAll('[data-folder-focus]')].find(node => node.dataset.folderFocus === focused)?.focus({ preventScroll: true });
    };
    window.toggleFolderMapDrawer = function() {
        mapOpen = !mapOpen;
        document.getElementById('folder-map-body').hidden = !mapOpen;
        document.getElementById('folder-map-toggle').setAttribute('aria-expanded', String(mapOpen));
    };
    window.refreshFolderMap = renderFolderTree;
    function firstEmpty(items) {
        for (let index = 0; index < config.rows * config.cols; index++) if (!items[index]) return index;
        return -1;
    }
    function showDraft(item, isNew) {
        draft = { ...item };
        folderLinkTargetIndex = creationIndex;
        folderLinkTargetFolderId = editingId;
        folderVisualPending = item.folderImage ? { type: 'image', data: item.folderImage } :
            item.folderSymbol ? { type: 'symbol', data: item.folderSymbol } :
            item.folderText ? { type: 'text', data: item.folderText } : null;
        nameInput.value = isNew ? '' : item.label || '';
        nameInput.removeAttribute('aria-invalid'); error.textContent = '';
        document.getElementById('folder-dialog-title').textContent = isNew ? 'Create a folder' : 'Edit folder';
        document.getElementById('folder-dialog-description').textContent = isNew ?
            'Give related symbols a home. Name it, choose a picture, and start adding.' :
            'Update the name or picture. Everything inside stays together.';
        let parentNames = folderNavigationStack.map(frame => frame.folderLabel);
        if (!isNew) {
            const root = getRootGridData(); const path = pathTo(root, item.folderId) || [];
            let scope = root; parentNames = [];
            for (const index of path.slice(0, -1)) { parentNames.push(scope[index].label || 'Folder'); scope = scope[index].folderGridData; }
        }
        document.getElementById('folder-dialog-location').textContent = 'Location: ' + ['Home', ...parentNames].join(' / ');
        document.getElementById('folder-presets').hidden = !isNew;
        document.getElementById('folder-edit-actions').hidden = isNew;
        document.getElementById('folder-picture-options').open = false;
        document.getElementById('folder-text-picture').value = item.folderText || '';
        document.getElementById('folder-background-color').value = item.customBgColor || config.cellBgColor || '#ffffff';
        document.getElementById('folder-border-color').value = item.customBorderColor || config.borderColor || '#000000';
        openAfter.checked = isNew;
        document.getElementById('folder-open-label').textContent = isNew ? 'Open this folder after creating' : 'Open this folder after saving';
        updateSaveLabel(); renderFolderVisualSection();
        modal.classList.remove('hidden');
        modal.querySelector('.transform').classList.remove('translate-y-full');
        nameInput.focus({ preventScroll: true });
    }
    window.addFolderCell = function(index) {
        if (config.mode !== 'edit' || gridData[index]) return;
        creationIndex = index; editingId = null;
        showDraft({ isFolder: true, folderId: newId(), label: '', folderGridData: Array(config.rows * config.cols).fill(null), customBgColor: null, customBorderColor: null }, true);
    };
    window.createFolderQuick = function() {
        const index = firstEmpty(gridData);
        if (index === -1) {
            if (!mapOpen) toggleFolderMapDrawer();
            status.textContent = 'This grid is full. Choose a larger layout or free a cell to add a folder.';
            return;
        }
        status.textContent = '';
        addFolderCell(index);
    };
    window.openFolderLinkModal = function(index) {
        const item = gridData[index];
        if (item?.isFolder) { ensureFolders(gridData); openFolderLinkModalById(item.folderId); }
    };
    window.openFolderLinkModalById = function(id) {
        const found = folderAt(getRootGridData(), id);
        if (!found) return;
        creationIndex = null; editingId = id; showDraft(found.item, false);
    };
    window.renameFolderCell = openFolderLinkModal;
    window.renameFolderById = openFolderLinkModalById;
    window.getCurrentFolderItem = () => draft;
    window.closeFolderLinkModal = function() {
        modal.classList.add('hidden');
        draft = null; creationIndex = null; editingId = null;
        folderLinkTargetIndex = null; folderLinkTargetFolderId = null;
        folderVisualPending = '__unset__';
        window.folderVisualModalEditing = false;
    };
    function updateSaveLabel() {
        document.getElementById('folder-save-btn').textContent = editingId ?
            openAfter.checked ? 'Save & open' : 'Save changes' : openAfter.checked ? 'Create & open' : 'Create folder';
    }
    openAfter.addEventListener('change', updateSaveLabel);
    nameInput.addEventListener('input', () => {
        nameInput.removeAttribute('aria-invalid'); error.textContent = ''; renderFolderVisualSection();
    });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'text') {
            event.preventDefault(); saveFolderLink();
        }
    });
    window.renderFolderVisualSection = function() {
        if (!draft) return;
        const preview = document.getElementById('folder-preview-picture');
        const visual = folderVisualPending;
        const item = { folderImage: visual?.type === 'image' ? visual.data : null,
            folderSymbol: visual?.type === 'symbol' ? visual.data : null, folderText: visual?.type === 'text' ? visual.data : null };
        const thumb = el('span', 'folder-preview-thumb');
        thumb.style.setProperty('--folder-bg', draft.customBgColor || config.cellBgColor || '#ffffff');
        thumb.style.setProperty('--folder-bc', draft.customBorderColor || config.borderColor || '#000000');
        thumb.style.setProperty('--folder-bw', config.borderWidth + 'px');
        thumb.append(createFolderOutline(), thumbnail(item, 'folder-preview-content'));
        preview.replaceChildren(thumb);
        updateFolderOutline(thumb);
        requestAnimationFrame(() => { if (thumb.isConnected) updateFolderOutline(thumb); });
        document.getElementById('folder-preview-name').textContent = nameInput.value.trim() || 'Your folder';
        document.getElementById('folder-preview-detail').textContent = editingId ? countLabel(draft.folderGridData) + ' inside' : 'Ready for your symbols';
        [...document.querySelectorAll('[data-folder-emoji]')].forEach(node => node.setAttribute('aria-pressed', String(
            !visual ? node.dataset.folderEmoji === '' : visual.type === 'symbol' && node.dataset.folderEmoji === visual.data)));
        const textPicture = document.getElementById('folder-text-picture');
        if (document.activeElement !== textPicture) textPicture.value = visual?.type === 'text' ? visual.data : '';
    };
    function choosePicture(type, data) {
        folderVisualPending = data ? { type, data } : null;
        renderFolderVisualSection();
    }
    const starters = document.getElementById('folder-preset-buttons');
    presets.forEach(([name, emoji]) => starters.append(button('folder-preset', `${emoji} ${name}`, () => {
        nameInput.value = name; nameInput.dispatchEvent(new Event('input')); choosePicture('symbol', emoji);
    })));
    const pictureButtons = document.getElementById('folder-icon-buttons');
    const defaultButton = button('folder-icon-choice', '', () => choosePicture(null, ''), 'folder');
    defaultButton.dataset.folderEmoji = ''; defaultButton.setAttribute('aria-label', 'Use folder icon'); pictureButtons.append(defaultButton);
    presets.forEach(([name, emoji]) => {
        const node = button('folder-icon-choice', emoji, () => choosePicture('symbol', emoji));
        node.dataset.folderEmoji = emoji; node.setAttribute('aria-label', `Use ${name.toLowerCase()} picture`); pictureButtons.append(node);
    });
    document.getElementById('folder-picture-file').addEventListener('change', async event => {
        const file = event.target.files[0]; if (!file || !draft) return;
        const id = draft.folderId; event.target.value = '';
        try {
            const data = await fileToBase64(file);
            if (draft?.folderId === id) choosePicture('image', data);
        } catch (_) { error.textContent = 'Could not load that image. Please try another photo.'; }
    });
    document.getElementById('folder-text-picture').addEventListener('input', event => choosePicture('text', event.target.value.trim()));
    for (const [id, key] of [['folder-background-color', 'customBgColor'], ['folder-border-color', 'customBorderColor']]) {
        document.getElementById(id).addEventListener('input', event => {
            if (!draft) return;
            draft[key] = event.target.value; renderFolderVisualSection();
        });
    }
    window.resetFolderDraftColors = function() {
        if (!draft) return;
        draft.customBgColor = null; draft.customBorderColor = null;
        document.getElementById('folder-background-color').value = config.cellBgColor || '#ffffff';
        document.getElementById('folder-border-color').value = config.borderColor || '#000000';
        renderFolderVisualSection();
    };
    window.folderVisualClear = () => choosePicture(null, '');
    window.openFolderSettingsSymbolSearch = function() {
        if (!draft) return;
        shapesModal.style.zIndex = '120';
        openShapesModal(9999);
        window.folderVisualModalEditing = true;
    };
    new MutationObserver(() => {
        if (shapesModal.classList.contains('hidden')) shapesModal.style.zIndex = '';
    }).observe(shapesModal, { attributes: true, attributeFilter: ['class'] });
    window.saveFolderLink = function() {
        if (!draft) return;
        const label = nameInput.value.trim();
        if (!label) { error.textContent = 'Give your folder a name to continue.'; nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return; }
        const visual = folderVisualPending;
        const updated = { ...draft, label,
            folderImage: visual?.type === 'image' ? visual.data : null,
            folderSymbol: visual?.type === 'symbol' ? visual.data : null,
            folderText: visual?.type === 'text' ? visual.data : null };
        const root = getRootGridData(); const previous = activeId(); const destination = openAfter.checked ? updated.folderId : previous;
        if (editingId) {
            const found = folderAt(root, editingId); if (!found) return;
            // Preserve live contents if another operation updated them while the dialog was open.
            updated.folderGridData = found.item.folderGridData; found.scope[found.index] = updated;
        } else {
            const scope = scopeAt(root, previous); if (!scope || scope[creationIndex]) return;
            scope[creationIndex] = updated;
        }
        closeFolderLinkModal(); commit(root, destination);
        if (destination === updated.folderId) revealBoard();
    };

    /* Moving through a canonical tree keeps edits inside nested folders intact. */
    function freeCells(items) { return Array.from({ length: config.rows * config.cols }, (_, i) => !items[i]).filter(Boolean).length; }
    function targetInfo(root, id) {
        const scope = scopeAt(root, id);
        if (!scope) return { reason: 'Folder no longer exists' };
        if (id === moveSource.parentId) return { reason: 'Current location' };
        const sourceScope = scopeAt(root, moveSource.parentId);
        const item = sourceScope?.[moveSource.index];
        if (item?.isFolder && (id === item.folderId || pathTo(item.folderGridData || [], id))) return { reason: 'Inside this folder' };
        const free = freeCells(scope);
        return free ? { scope, free } : { reason: 'No empty cells' };
    }
    function refreshMoveTree() {
        const root = getRootGridData(); const container = document.getElementById('move-cell-tree-container');
        const hadFocus = container.contains(document.activeElement);
        container.replaceChildren();
        function row(id, label, item, depth) {
            const info = targetInfo(root, id);
            const node = button('folder-move-destination', '', () => { moveTarget = id; refreshMoveTree(); });
            node.style.setProperty('--folder-depth', Math.min(depth, 4));
            node.dataset.moveDestination = id;
            node.disabled = !!info.reason; node.setAttribute('aria-pressed', String(moveTarget === id));
            node.append(item ? thumbnail(item, 'folder-tree-thumb') : (() => { const n = el('span', 'folder-tree-thumb'); n.innerHTML = svg('home'); return n; })());
            const copy = el('span', 'folder-tree-copy'); copy.append(el('span', '', label), el('small', '', info.reason || `${info.free} empty ${info.free === 1 ? 'cell' : 'cells'}`)); node.append(copy); container.append(node);
        }
        row('root', 'Home', null, 0);
        function branch(items, depth) {
            items.forEach(item => { if (item?.isFolder) { row(item.folderId, item.label || 'Folder', item, depth); branch(item.folderGridData || [], depth + 1); } });
        }
        branch(root, 1);
        const confirm = document.getElementById('move-cell-confirm-btn');
        confirm.disabled = !moveTarget || !!targetInfo(root, moveTarget).reason;
        confirm.classList.toggle('opacity-50', confirm.disabled);
        confirm.classList.toggle('cursor-not-allowed', confirm.disabled);
        confirm.textContent = moveTarget ? 'Move to ' + (moveTarget === 'root' ? 'Home' : folderAt(root, moveTarget)?.item.label || 'folder') : 'Choose a destination';
        if (hadFocus) [...container.querySelectorAll('[data-move-destination]')].find(node => node.dataset.moveDestination === moveTarget)?.focus({ preventScroll: true });
    }
    function openMove(source) {
        moveSource = source; moveTarget = null;
        const item = scopeAt(getRootGridData(), source.parentId)?.[source.index]; if (!item) return;
        document.getElementById('move-cell-description').textContent = `Choose a destination for ${item.label || 'this item'}.`;
        refreshMoveTree();
        const moveModal = document.getElementById('move-cell-modal'); moveModal.classList.remove('hidden'); moveModal.querySelector('.transform').classList.remove('translate-y-full');
    }
    window.openMoveCellModal = index => openMove({ parentId: activeId() || 'root', index });
    window.moveEditingFolder = function() {
        if (!nameInput.value.trim()) {
            error.textContent = 'Give your folder a name to continue.'; nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return;
        }
        const root = getRootGridData(); const found = folderAt(root, editingId); if (!found) return;
        const path = pathTo(root, editingId); let parent = root; let parentId = 'root';
        for (const index of path.slice(0, -1)) { parentId = parent[index].folderId; parent = parent[index].folderGridData; }
        openMove({ parentId, index: found.index, fromEditor: true });
    };
    window.closeMoveCellModal = function() {
        document.getElementById('move-cell-modal').classList.add('hidden'); moveSource = null; moveTarget = null;
    };
    document.getElementById('move-cell-confirm-btn').onclick = () => {
        if (!moveSource || !moveTarget) return;
        const root = getRootGridData(); const previous = activeId(); const info = targetInfo(root, moveTarget);
        if (info.reason) { refreshMoveTree(); return; }
        const source = scopeAt(root, moveSource.parentId); const item = source?.[moveSource.index]; if (!item) return;
        let movedItem = item;
        const fromEditor = moveSource.fromEditor;
        if (fromEditor && draft) {
            const visual = folderVisualPending;
            movedItem = { ...item, ...draft, folderGridData: item.folderGridData, label: nameInput.value.trim(),
                folderImage: visual?.type === 'image' ? visual.data : null,
                folderSymbol: visual?.type === 'symbol' ? visual.data : null,
                folderText: visual?.type === 'text' ? visual.data : null };
        }
        info.scope[firstEmpty(info.scope)] = movedItem; source[moveSource.index] = null;
        closeMoveCellModal();
        if (fromEditor) closeFolderLinkModal();
        commit(root, previous);
    };
    window.deleteEditingFolder = function() {
        const root = getRootGridData(); const found = folderAt(root, editingId); if (!found) return;
        const count = found.item.folderGridData.filter(Boolean).length;
        if (!confirm(`Delete "${found.item.label || 'Folder'}"${count ? ' and everything inside it' : ''}? This cannot be undone.`)) return;
        const previous = activeId(); found.scope[found.index] = null; closeFolderLinkModal(); commit(root, previous);
    };

    /* Folder cards support keyboard opening and distinct taps versus drag gestures. */
    function enhanceCards() {
        gridContainer.querySelectorAll('.folder-cell').forEach(cell => {
            if (cell.dataset.folderEnhanced) return;
            cell.dataset.folderEnhanced = 'true';
            const index = Number(cell.dataset.index); const item = gridData[index];
            if (!item) return;
            cell.prepend(createFolderOutline());
            cell.tabIndex = 0; cell.setAttribute('role', 'group'); cell.setAttribute('aria-label', `Folder: ${item.label || 'Folder'}`);
            cell.addEventListener('keydown', event => {
                if (event.target !== cell || !['Enter', ' '].includes(event.key)) return;
                event.preventDefault();
                activateCell(index, cell);
            });
            const open = button('folder-card-open', 'Open folder', event => { event.stopPropagation(); openFolder(index); }, 'chevron');
            open.addEventListener('mousedown', event => event.stopPropagation());
            open.addEventListener('touchstart', event => event.stopPropagation(), { passive: true });
            cell.querySelector('.cell-content').append(open);
            if (config.mode !== 'edit') { open.hidden = true; return; }
            const badge = el('span', 'folder-card-kind'); badge.innerHTML = svg('folder'); badge.append(el('span', '', countLabel(item.folderGridData))); cell.append(badge);
            for (const selector of ['.folder-link-btn', '.move-action-btn', '.delete-btn', '.preview-btn', '.color-pick-btn']) {
                const control = cell.querySelector(selector); if (!control) continue;
                // Keep primary actions visible; other options live in the folder dialog.
                if (['.delete-btn', '.preview-btn', '.color-pick-btn'].includes(selector)) { control.hidden = true; continue; }
                const replacement = el('button', control.className); replacement.type = 'button'; replacement.innerHTML = control.innerHTML; replacement.onclick = control.onclick;
                replacement.setAttribute('aria-label', selector === '.folder-link-btn' ? `Edit ${item.label}` : `Move ${item.label}`);
                replacement.title = selector === '.folder-link-btn' ? 'Edit folder' : 'Move folder';
                replacement.addEventListener('mousedown', event => event.stopPropagation());
                replacement.addEventListener('touchstart', event => event.stopPropagation(), { passive: true });
                control.replaceWith(replacement);
            }
        });
        updateCardDensity();
    }
    function updateCardDensity() {
        gridContainer.querySelectorAll('.folder-cell').forEach(cell => {
            cell.classList.toggle('folder-card-small', cell.clientWidth < 240 || cell.clientHeight < 190);
            cell.classList.toggle('folder-card-tiny', cell.clientWidth < 90 || cell.clientHeight < 125);
            updateFolderOutline(cell);
        });
    }
    window.fitFolderCards = updateCardDensity;
    function createFolderOutline() {
        const outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        outline.classList.add('folder-cell-outline');
        outline.setAttribute('aria-hidden', 'true');
        outline.setAttribute('focusable', 'false');
        outline.setAttribute('preserveAspectRatio', 'none');
        outline.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
        return outline;
    }
    function updateFolderOutline(cell) {
        if (!cell) return;
        const outline = cell.querySelector('.folder-cell-outline');
        const width = cell.clientWidth, height = cell.clientHeight;
        if (!outline || !width || !height) return;
        // Draw a single contour in pixels: corners and border thickness stay consistent
        // in wide, tall, and dense grids, with no seams where the tab meets the body.
        const stroke = parseFloat(cell.style.getPropertyValue('--folder-bw')) || 0;
        const inset = Math.min(Math.max(.75, stroke / 2), Math.min(width, height) / 4);
        const left = inset, right = width - inset, top = inset, bottom = height - inset;
        const tabHeight = Math.min(48, Math.max(22, height * .105), height * .22);
        const bodyTop = top + tabHeight;
        const radius = Math.min(18, width * .065, height * .065, tabHeight / 2);
        const tabEnd = width * .44;
        const shoulder = Math.min(tabEnd + tabHeight, right - radius * 2);
        outline.setAttribute('viewBox', `0 0 ${width} ${height}`);
        outline.firstElementChild.setAttribute('d', [
            `M ${left + radius} ${top}`,
            `H ${tabEnd - radius}`,
            `Q ${tabEnd} ${top} ${tabEnd + radius / 2} ${top + radius / 2}`,
            `L ${shoulder - radius / 2} ${bodyTop - radius / 2}`,
            `Q ${shoulder} ${bodyTop} ${shoulder + radius} ${bodyTop}`,
            `H ${right - radius}`,
            `Q ${right} ${bodyTop} ${right} ${bodyTop + radius}`,
            `V ${bottom - radius}`,
            `Q ${right} ${bottom} ${right - radius} ${bottom}`,
            `H ${left + radius}`,
            `Q ${left} ${bottom} ${left} ${bottom - radius}`,
            `V ${top + radius}`,
            `Q ${left} ${top} ${left + radius} ${top} Z`
        ].join(' '));
        cell.style.setProperty('--folder-tab-height', `${bodyTop}px`);
        const gap = Math.min(8, Math.max(6, Math.min(width, height) * .025));
        cell.style.setProperty('--folder-ui-gap', `${gap}px`);
        cell.style.setProperty('--folder-edit-inset', `${stroke + gap}px`);
        cell.style.setProperty('--folder-edit-top', `${bodyTop + stroke / 2 + gap}px`);
        cell.style.setProperty('--folder-tool-size', `${Math.min(28, Math.min(width, height) * .15)}px`);
        cell.style.setProperty('--folder-kind-top', `${stroke + gap}px`);
        cell.style.setProperty('--folder-kind-width', `${Math.max(0, tabEnd - stroke - gap * 2)}px`);
        cell.style.setProperty('--folder-label-height', `${Math.min(44, Math.max(24, height * .11), height * .26)}px`);
        cell.style.setProperty('--folder-label-font-size', `${Math.min(18, height * .15)}px`);
    }
    new MutationObserver(enhanceCards).observe(gridContainer, { childList: true });
    new ResizeObserver(updateCardDensity).observe(gridContainer);
    const previewPicture = document.getElementById('folder-preview-picture');
    new ResizeObserver(() => updateFolderOutline(previewPicture.firstElementChild)).observe(previewPicture);
})();
