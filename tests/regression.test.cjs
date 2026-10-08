const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace(/<script src="https:[^"]+"><\/script>/g, '');
for (const file of ['folder-system.js', 'ui-polish.js']) {
    html = html.replace(`<script src="${file}"></script>`, () =>
        `<script>${fs.readFileSync(path.join(root, file), 'utf8')}</script>`);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function boot(t, storage = {}) {
    const errors = [];
    const console = new VirtualConsole();
    console.on('jsdomError', error => errors.push(error.message));
    console.on('error', (...args) => errors.push(args.join(' ')));
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
        virtualConsole: console,
        beforeParse(window) {
            window.tailwind = {};
            window.indexedDB = new IDBFactory(); // Isolated in-memory data for each test.
            window.structuredClone = structuredClone;
            window.ResizeObserver = class { observe() {} disconnect() {} };
            window.matchMedia = () => ({ matches: false, addEventListener() {} });
            window.speechSynthesis = { getVoices: () => [], cancel() {}, speak() {}, addEventListener() {} };
            window.SpeechSynthesisUtterance = class {};
            window.HTMLElement.prototype.scrollTo = function() {};
            window.HTMLElement.prototype.getClientRects = function() {
                return this.closest('.hidden, [hidden]') ? [] : [{ width: 100, height: 40 }];
            };
            for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
        }
    });
    t.after(() => { dom.window.close(); assert.deepEqual(errors, [], 'No application runtime errors'); });
    if (dom.window.document.readyState !== 'complete') {
        await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    }
    const deadline = Date.now() + 5000;
    while (dom.window.eval('isLoadingProfile') && Date.now() < deadline) await delay(20);
    assert.equal(dom.window.eval('isLoadingProfile'), false, 'Profile startup finishes within five seconds');
    return dom.window;
}

test('damaged profile metadata and invalid settings do not prevent startup', async t => {
    const w = await boot(t, {
        aac_profiles: '{broken', aac_active_profile: 'missing',
        acc_sandbox_config: JSON.stringify({ rows: -1, cols: 0, gap: -20, prompts: null })
    });
    assert.equal(w.document.getElementById('splash-profile-select').options.length, 5);
    assert.equal(w.eval('currentProfileId'), 'profile_1');
    assert.equal(w.document.querySelectorAll('.grid-cell').length, 1);
    assert.equal(w.eval('config.gap'), 0);
    assert.ok(w.eval('Array.isArray(config.prompts)'));
});

test('corrupt settings still load the saved board', async t => {
    const w = await boot(t);
    w.eval("gridData[0] = { isTextOnly: true, label: 'Keep me' }");
    await w.eval('saveToLocalStorage()');
    w.localStorage.setItem('acc_sandbox_config', '{broken');
    await w.eval('loadFromLocalStorage()');
    assert.equal(w.eval('gridData[0].label'), 'Keep me');
});

test('rapid profile changes preserve separate boards and finish in the last profile', async t => {
    const w = await boot(t);
    w.eval("gridData[0] = { isTextOnly: true, label: 'First board' }");
    await w.switchProfile('profile_2');
    w.eval("gridData[0] = { isTextOnly: true, label: 'Second board' }");
    await Promise.all([w.switchProfile('profile_1'), w.switchProfile('profile_2')]);
    assert.equal(w.eval('currentProfileId'), 'profile_2');
    assert.equal(w.eval('gridData[0].label'), 'Second board');
    await w.switchProfile('profile_1');
    assert.equal(w.eval('gridData[0].label'), 'First board');
});

test('reopening an editor cancels its pending close and retains the new target', async t => {
    const w = await boot(t);
    w.eval("gridData[0] = { isTextOnly: true, label: 'First' }; gridData[1] = { isTextOnly: true, label: 'Second' }");
    for (const [name, id, target] of [
        ['TextLabel', 'text-label-modal', 'textLabelTargetIndex'],
        ['SpeechLabel', 'speech-label-modal', 'speechLabelEditingIndex'],
        ['SymbolColor', 'symbol-color-modal', 'symbolColorEditingIndex']
    ]) {
        w[`open${name}Modal`](0);
        w[`close${name}Modal`]();
        w[`open${name}Modal`](1);
        await delay(350);
        assert.equal(w.document.getElementById(id).classList.contains('hidden'), false);
        assert.equal(w.eval(target), 1);
        w[`close${name}Modal`]();
        await delay(350);
    }
});

test('prompt text preserves quotes and markup as literal text', async t => {
    const w = await boot(t);
    const prompt = 'Find "apple" <img src=x> & say hello';
    w.eval(`config.prompts = [${JSON.stringify(prompt)}]`);
    w.openPromptsModal();
    const container = w.document.getElementById('prompts-inputs');
    assert.equal(container.querySelector('input').value, prompt);
    assert.equal(container.querySelector('img'), null);
});

test('database connections release when data is cleared', async t => {
    const w = await boot(t);
    await w.eval('openDB()');
    await new Promise((resolve, reject) => {
        const request = w.indexedDB.deleteDatabase('ACC_Sandbox_DB');
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Database deletion blocked by an open connection'));
    });
});

test('magnification starts with blue and defaults to blue when enabled from no outline', async t => {
    const w = await boot(t);
    assert.equal(w.eval('config.zoomOutlineColor'), '#3b82f6');
    w.selectZoomOutlineColor('');
    const toggle = w.document.getElementById('magnify-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new w.Event('change'));
    assert.equal(w.eval('config.zoomOutlineColor'), '#3b82f6');
    w.selectZoomOutlineColor('');
    w.document.getElementById('audio-toggle').dispatchEvent(new w.Event('change'));
    assert.equal(w.eval('config.zoomOutlineColor'), '', 'An explicit no-outline choice remains available');
});

test('edit mode previews selection and separates repositioning from card activation', async t => {
    const w = await boot(t);
    w.eval("gridData[0] = { isTextOnly: true, label: 'Apple' }; renderGrid(); window.heard = []; speak = text => heard.push(text)");
    const cell = w.document.querySelector('.grid-cell.occupied');
    cell.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    assert.deepEqual(Array.from(w.heard), ['Apple']);
    assert.equal(cell.draggable, false);
    const handle = cell.querySelector('.reorder-handle');
    handle.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    assert.deepEqual(Array.from(w.heard), ['Apple'], 'The reposition handle never speaks the symbol');
    assert.ok(handle.getAttribute('aria-label').includes('Apple'));
});
