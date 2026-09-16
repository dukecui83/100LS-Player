const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'public', 'favicon.svg');
const outputDirectory = path.join(projectRoot, 'build');
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

async function buildIcon() {
  const { default: sharp } = await import('sharp');
  const { default: pngToIco } = await import('png-to-ico');
  await fs.mkdir(outputDirectory, { recursive: true });

  const pngPaths = [];
  for (const size of iconSizes) {
    const pngPath = path.join(outputDirectory, `icon-${size}.png`);
    await sharp(sourcePath)
      .resize(size, size, { fit: 'fill' })
      .png()
      .toFile(pngPath);
    pngPaths.push(pngPath);
  }

  const ico = await pngToIco(pngPaths);
  await fs.writeFile(path.join(outputDirectory, 'icon.ico'), ico);
}

buildIcon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
