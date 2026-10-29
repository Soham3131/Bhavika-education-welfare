import fs from 'fs';
import sharp from 'sharp';
import path from 'path';

async function createRechargeGraphic() {
  const svg = `
  <svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="phoneBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1E293B"/>
        <stop offset="100%" stop-color="#0F172A"/>
      </linearGradient>
      <linearGradient id="screenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#6B0B1A"/>
        <stop offset="60%" stop-color="#9E1C30"/>
        <stop offset="100%" stop-color="#F8FAFC"/>
      </linearGradient>
    </defs>
    
    <!-- Phone body -->
    <rect x="100" y="30" width="200" height="340" rx="36" fill="url(#phoneBody)" stroke="#475569" stroke-width="4"/>
    <!-- Phone Screen -->
    <rect x="112" y="46" width="176" height="308" rx="28" fill="url(#screenGrad)"/>
    
    <!-- Top Notch/Speaker -->
    <rect x="165" y="54" width="70" height="12" rx="6" fill="#0F172A"/>
    
    <!-- Screen Header content -->
    <circle cx="200" cy="115" r="28" fill="rgba(255,255,255,0.2)" stroke="#FCD34D" stroke-width="2"/>
    <!-- Lightning bolt icon -->
    <path d="M204 95 L190 115 L200 115 L196 135 L212 112 L202 112 Z" fill="#FDE047"/>
    
    <text x="200" y="160" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle">Quick Recharge</text>
    <text x="200" y="178" font-family="Arial, sans-serif" font-size="10" fill="#FEF08A" text-anchor="middle">Instant &amp; 100% Secure</text>
    
    <!-- Telecom Floating Badges -->
    <!-- Jio Badge -->
    <g transform="translate(60, 200)">
      <circle cx="28" cy="28" r="28" fill="#0A2885" stroke="#FFFFFF" stroke-width="3"/>
      <text x="28" y="35" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#FFFFFF" text-anchor="middle">Jio</text>
    </g>
    
    <!-- Airtel Badge -->
    <g transform="translate(65, 275)">
      <circle cx="26" cy="26" r="26" fill="#ED1C24" stroke="#FFFFFF" stroke-width="3"/>
      <text x="26" y="32" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">airtel</text>
    </g>
    
    <!-- Vi Badge -->
    <g transform="translate(280, 180)">
      <circle cx="28" cy="28" r="28" fill="#E60000" stroke="#FFFFFF" stroke-width="3"/>
      <text x="28" y="35" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#FFD700" text-anchor="middle">!Vi</text>
    </g>
    
    <!-- Electricity / DTH Badge -->
    <g transform="translate(275, 260)">
      <circle cx="26" cy="26" r="26" fill="#0284C7" stroke="#FFFFFF" stroke-width="3"/>
      <path d="M26 15 C20 15 16 19 16 25 C16 29 19 32 21 34 L21 37 L31 37 L31 34 C33 32 36 29 36 25 C36 19 32 15 26 15 Z" fill="#FFFFFF"/>
    </g>
    
    <!-- Bottom Home Bar -->
    <rect x="160" y="342" width="80" height="4" rx="2" fill="#CBD5E1"/>
  </svg>
  `;
  
  await sharp(Buffer.from(svg))
    .png()
    .toFile('public/images/promo-recharge-phone.png');
  console.log('Generated clean promo-recharge-phone.png');
}

async function createBadgesAndShortcuts() {
  const cats = [
    { name: 'cat-gold.png', source: 'public/images/prod-gold-mangalsutra-v2.png' },
    { name: 'cat-silver.png', source: 'public/images/prod-silver-earrings-v2.png' },
    { name: 'cat-grocery.png', source: 'public/images/prod-basmati-rice-v2.png' },
    { name: 'cat-fashion.png', source: 'public/images/prod-ethnic-saree-v2.png' },
    { name: 'cat-electronics.png', source: 'public/images/prod-headphones-v2.png' },
    { name: 'cat-recharge.png', source: 'public/images/promo-recharge-phone-v2.png' },
  ];
  
  for (const c of cats) {
    if (fs.existsSync(c.source)) {
      const circleSvg = Buffer.from(`
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="96" fill="#FFFDF9" stroke="#EBDCB9" stroke-width="4"/>
        </svg>
      `);
      
      const resizedProduct = await sharp(c.source)
        .resize(130, 130, { fit: 'contain', background: { r: 255, g: 253, b: 249, alpha: 0 } })
        .toBuffer();
        
      await sharp(circleSvg)
        .composite([{ input: resizedProduct, gravity: 'center' }])
        .png()
        .toFile(path.join('public/images', c.name));
      await sharp(circleSvg)
        .composite([{ input: resizedProduct, gravity: 'center' }])
        .png()
        .toFile(path.join('public/images', c.name.replace('.png', '-v2.png')));
      console.log('Generated clean circle for', c.name);
      
      const shopcatBuffer = await sharp(c.source)
        .resize(160, 140, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

      await sharp(shopcatBuffer)
        .toFile(path.join('public/images', c.name.replace('cat-', 'shopcat-')));
      await sharp(shopcatBuffer)
        .toFile(path.join('public/images', c.name.replace('cat-', 'shopcat-').replace('.png', '-v2.png')));
      console.log('Generated clean shopcat for', c.name.replace('cat-', 'shopcat-'));
    }
  }
  
  // 7. EMI Products icon
  const emiSvg = Buffer.from(`
    <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="96" fill="#FFFDF9" stroke="#EBDCB9" stroke-width="4"/>
      <rect x="45" y="65" width="110" height="70" rx="10" fill="#6B0B1A"/>
      <rect x="45" y="80" width="110" height="14" fill="#C5A059"/>
      <rect x="60" y="108" width="24" height="14" rx="3" fill="#FDE047"/>
      <text x="130" y="120" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle">0% EMI</text>
    </svg>
  `);
  await sharp(emiSvg).png().toFile('public/images/cat-emi.png');
  await sharp(emiSvg).png().toFile('public/images/cat-emi-v2.png');
  console.log('Generated cat-emi.png');
  
  // 8. PIN & Vouchers icon
  const pinSvg = Buffer.from(`
    <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="96" fill="#FFFDF9" stroke="#EBDCB9" stroke-width="4"/>
      <rect x="48" y="65" width="104" height="70" rx="8" fill="#A91B2E"/>
      <circle cx="48" cy="100" r="10" fill="#FFFDF9"/>
      <circle cx="152" cy="100" r="10" fill="#FFFDF9"/>
      <line x1="100" y1="75" x2="100" y2="125" stroke="#FCD34D" stroke-width="2" stroke-dasharray="4,4"/>
      <text x="74" y="105" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PIN</text>
      <text x="126" y="105" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#FDE047" text-anchor="middle">GIFT</text>
    </svg>
  `);
  await sharp(pinSvg).png().toFile('public/images/cat-pins.png');
  await sharp(pinSvg).png().toFile('public/images/cat-pins-v2.png');
  console.log('Generated cat-pins.png');
  
  // 9. Special Offers icon
  const offersSvg = Buffer.from(`
    <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="96" fill="#FFFDF9" stroke="#EBDCB9" stroke-width="4"/>
      <circle cx="100" cy="100" r="48" fill="#6B0B1A"/>
      <circle cx="100" cy="100" r="42" fill="none" stroke="#FDE047" stroke-width="2" stroke-dasharray="3,3"/>
      <text x="100" y="110" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#FDE047" text-anchor="middle">%</text>
    </svg>
  `);
  await sharp(offersSvg).png().toFile('public/images/cat-offers.png');
  await sharp(offersSvg).png().toFile('public/images/cat-offers-v2.png');
  console.log('Generated cat-offers.png');
}

async function main() {
  await createRechargeGraphic();
  await createBadgesAndShortcuts();
}
main().catch(console.error);
