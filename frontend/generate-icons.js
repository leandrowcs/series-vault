import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const iconSvgPath = path.join(publicDir, 'icon.svg');

const baseSvg = fs.readFileSync(iconSvgPath, 'utf8');

// Versao maskable com area segura maior para recortes Android/iOS.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bgGlow" cx="32%" cy="18%" r="76%">
      <stop offset="0%" stop-color="#123D38" />
      <stop offset="48%" stop-color="#0B1110" />
      <stop offset="100%" stop-color="#060A09" />
    </radialGradient>
    <linearGradient id="vaultGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#5EEAD4" />
      <stop offset="48%" stop-color="#14A085" />
      <stop offset="100%" stop-color="#0F766E" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" fill="url(#bgGlow)" />
  <circle cx="256" cy="256" r="186" fill="#101918" stroke="#14A085" stroke-opacity="0.38" stroke-width="3" />
  <circle cx="256" cy="256" r="158" fill="none" stroke="#0F766E" stroke-opacity="0.22" stroke-width="20" />

  <path
    d="M132 188c0-36 30-62 72-62 29 0 53 10 72 26l-26 37c-14-12-29-18-46-18-16 0-27 7-27 18 0 13 14 17 42 26 39 12 65 27 65 68 0 40-32 67-79 67-35 0-66-13-87-36l28-37c17 17 37 27 60 27 20 0 32-8 32-21 0-14-15-20-44-28-37-12-62-26-62-67Z"
    fill="#E8F1EE"
    filter="url(#softGlow)"
  />
  <path
    d="M256 160h42l38 126 38-126h42l-56 190h-48L256 160Z"
    fill="url(#vaultGradient)"
    filter="url(#softGlow)"
  />
  <path d="M145 383h222" stroke="#F2B84B" stroke-opacity="0.9" stroke-width="7" stroke-linecap="round" />
</svg>`;

async function generateIcons() {
  console.log('Gerando icones PNG em multiplos tamanhos...');

  const sizes = [128, 192, 256, 512];

  try {
    for (const size of sizes) {
      await sharp(Buffer.from(baseSvg))
        .resize(size, size)
        .png()
        .toFile(path.join(publicDir, `icon-${size}x${size}.png`));
      console.log(`✓ icon-${size}x${size}.png criado`);
    }

    for (const size of sizes) {
      await sharp(Buffer.from(maskableSvg))
        .resize(size, size)
        .png()
        .toFile(path.join(publicDir, `icon-maskable-${size}.png`));
      console.log(`✓ icon-maskable-${size}.png criado`);
    }

    console.log('Todos os icones foram gerados com sucesso.');
  } catch (error) {
    console.error('Erro ao gerar icones:', error);
    process.exit(1);
  }
}

generateIcons();
