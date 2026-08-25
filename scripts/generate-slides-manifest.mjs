/**
 * Builds the manifest the welcome screen uses to cycle through photos.
 *
 * Slides are dropped into `public/assets/img/slide/` by hand, so the list is
 * generated at build time rather than probed for at runtime.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif)$/i;
const MANIFEST_NAME = 'slides.json';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const slideDir = join(root, 'public', 'assets', 'img', 'slide');

const entries = await readdir(slideDir, { withFileTypes: true });
const slides = entries
  .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.test(entry.name))
  .map((entry) => `assets/img/slide/${entry.name}`)
  .sort();

await writeFile(join(slideDir, MANIFEST_NAME), `${JSON.stringify(slides, null, 2)}\n`);
console.log(`${MANIFEST_NAME}: ${slides.length} image(s)`);
