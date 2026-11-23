import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
for (const [from, to] of [
  ['css/bootstrap.min.css', 'bootstrap.min.css'],
  ['js/bootstrap.bundle.min.js', 'bootstrap.bundle.min.js'],
])
  await copyFile('node_modules/bootstrap/dist/' + from, 'public/vendor/' + to);
await copyFile(
  'node_modules/bootstrap/LICENSE',
  'public/vendor/BOOTSTRAP-LICENSE.txt',
);
