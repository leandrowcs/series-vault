import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Ícone básico com iniciais SV
const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="vaultGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#CFA8FF;stop-opacity:1" />
      <stop offset="45%" style="stop-color:#A855F7;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Fundo com gradiente -->
  <rect width="512" height="512" fill="#0d1117"/>
  <circle cx="256" cy="256" r="220" fill="#101722" stroke="rgba(169, 112, 255, 0.35)" stroke-width="2"/>
  
  <!-- Glow roxo -->
  <circle cx="256" cy="256" r="200" fill="none" stroke="rgba(124, 77, 255, 0.15)" stroke-width="20" opacity="0.3"/>
  
  <!-- Letra S (Series) -->
  <text x="160" y="320" font-size="180" font-weight="800" font-family="Arial, sans-serif" fill="#F4F4F5" letter-spacing="4" filter="url(#glow)" text-anchor="middle">S</text>
  
  <!-- Letra V (Vault) -->
  <text x="340" y="320" font-size="180" font-weight="900" font-family="Arial, sans-serif" fill="url(#vaultGradient)" letter-spacing="4" filter="url(#glow)" text-anchor="middle">V</text>
</svg>`;

// Ícone maskable (simplificado para suporte Android/iOS)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="vaultGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#CFA8FF;stop-opacity:1" />
      <stop offset="45%" style="stop-color:#A855F7;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#7C3AED;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Fundo -->
  <rect width="512" height="512" fill="#101722"/>
  
  <!-- Letra S (Series) -->
  <text x="140" y="340" font-size="200" font-weight="800" font-family="Arial, sans-serif" fill="#F4F4F5" letter-spacing="8" text-anchor="middle">S</text>
  
  <!-- Letra V (Vault) -->
  <text x="360" y="340" font-size="200" font-weight="900" font-family="Arial, sans-serif" fill="url(#vaultGradient2)" letter-spacing="8" text-anchor="middle">V</text>
</svg>`;

async function generateIcons() {
  console.log('Gerando ícones PNG...');
  
  try {
    // Gerar 192x192
    await sharp(Buffer.from(baseSvg))
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'icon-192x192.png'));
    console.log('✓ icon-192x192.png criado');
    
    // Gerar 512x512
    await sharp(Buffer.from(baseSvg))
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'icon-512x512.png'));
    console.log('✓ icon-512x512.png criado');
    
    // Gerar maskable 192x192
    await sharp(Buffer.from(maskableSvg))
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'icon-maskable-192.png'));
    console.log('✓ icon-maskable-192.png criado');
    
    // Gerar maskable 512x512
    await sharp(Buffer.from(maskableSvg))
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'icon-maskable-512.png'));
    console.log('✓ icon-maskable-512.png criado');
    
    console.log('Ícones gerados com sucesso!');
  } catch (error) {
    console.error('Erro ao gerar ícones:', error);
    process.exit(1);
  }
}

generateIcons();
