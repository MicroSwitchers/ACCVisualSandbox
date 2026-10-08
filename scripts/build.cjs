const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const assets = [
    'index.html', 'icon.svg', 'manifest.json', 'sw.js',
    'ui-polish.css', 'ui-polish.js', 'folder-system.css', 'folder-system.js'
];

// Validate the app before packaging the exact runtime files for Pages.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2]);
}
for (const file of assets) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    if (file.endsWith('.js')) new vm.Script(content, { filename: file });
    if (file.endsWith('.json')) JSON.parse(content);
}

if (path.dirname(output) !== root || path.basename(output) !== 'dist') throw new Error('Invalid build directory');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Packaged ${assets.length} runtime files in dist/`);
