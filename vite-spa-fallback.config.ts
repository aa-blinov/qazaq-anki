// Post-build step: copy dist/index.html to dist/404.html so GitHub Pages
// serves the SPA shell for unknown routes. Run automatically via the build
// script in package.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const indexPath = resolve(dist, 'index.html');
const notFoundPath = resolve(dist, '404.html');

if (!existsSync(indexPath)) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf-8');
writeFileSync(notFoundPath, html, 'utf-8');
console.log('✓ Wrote dist/404.html (SPA fallback)');
