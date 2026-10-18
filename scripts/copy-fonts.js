// Copies the app's fonts into public/fonts (run after changing weights: node scripts/copy-fonts.js).
// Same fonts as the Lefori app: Montserrat for text, Outfit for the "Lefori" wordmark.
// Both are SIL Open Font License; the licence files are copied alongside.
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public', 'fonts');
fs.mkdirSync(out, { recursive: true });
const pkg = (name) => path.join(__dirname, '..', 'node_modules', '@fontsource', name);

const files = [
  ['montserrat', [400, 500, 600, 700, 800]],
  ['outfit', [600]],
];
for (const [name, weights] of files) {
  for (const w of weights) {
    const file = `${name}-latin-${w}-normal.woff2`;
    fs.copyFileSync(path.join(pkg(name), 'files', file), path.join(out, file));
  }
  fs.copyFileSync(path.join(pkg(name), 'LICENSE'), path.join(out, `${name}-LICENSE.txt`));
}
console.log(`fonts copied to ${out}`);
