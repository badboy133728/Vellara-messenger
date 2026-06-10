import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const svg = readFileSync(join(publicDir, 'favicon.svg'));

const outputs = [
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-192-maskable.png', size: 192, padding: 0.12 },
  { file: 'icon-512-maskable.png', size: 512, padding: 0.12 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size, padding = 0 } of outputs) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round((size - inner) / 2);
  const image = sharp(svg).resize(inner, inner).png();
  const canvas =
    padding > 0
      ? sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 201, g: 168, b: 133, alpha: 1 },
          },
        })
          .composite([{ input: await image.toBuffer(), left: offset, top: offset }])
          .png()
      : image.resize(size, size).png();

  await canvas.toFile(join(publicDir, file));
  console.log(`wrote ${file}`);
}
