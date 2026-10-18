// Renders the app icons from icon.html with headless Chrome (or Edge): node scripts/icons/render-icons.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const chrome = browsers.find((b) => fs.existsSync(b));
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH');

const page = pathToFileURL(path.join(__dirname, 'icon.html')).href;
const out = path.join(__dirname, '..', '..', 'public', 'icons');
const icons = [
  ['icon-192.png', 192, 0.2],
  ['icon-512.png', 512, 0.2],
  ['maskable-192.png', 192, 0.27],
  ['maskable-512.png', 512, 0.27],
  ['apple-touch-icon.png', 180, 0.2],
  ['favicon-32.png', 32, 0.1],
];
for (const [file, size, pad] of icons) {
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${size},${size}`, `--screenshot=${path.join(out, file)}`, `${page}?size=${size}&pad=${pad}`,
  ], { stdio: 'ignore' });
  console.log(`${file} ${size}px`);
}
