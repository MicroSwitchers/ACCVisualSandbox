
const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');
const docIdx = code.indexOf('<!DOCTYPE html>');
if (docIdx > 0) {
    const toStart = code.substring(docIdx);
    let toEnd = code.substring(0, docIdx);
    // We should actually move toEnd right where it was supposed to be: inside the splash modal.
    // However, I made a mess. Let me check where the cut should be.
    // Maybe we just replace index.html if we can find the exact spots.
}

