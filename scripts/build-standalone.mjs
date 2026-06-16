import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'css/app.css'), 'utf8');
const storage = readFileSync(join(root, 'js/storage.js'), 'utf8');
const app = readFileSync(join(root, 'js/app.js'), 'utf8')
  .replace(/registerServiceWorker\(\);?\s*/g, '');

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace('<link rel="manifest" href="manifest.json">', '')
  .replace('<link rel="stylesheet" href="css/app.css">', `<style>${css}</style>`)
  .replace('<script src="js/storage.js"></script>', `<script>${storage}</script>`)
  .replace('<script src="js/app.js"></script>', `<script>${app}</script>`);

writeFileSync(join(root, 'standalone.html'), html);
console.log('Created standalone.html — AirDrop this file to iPhone');
