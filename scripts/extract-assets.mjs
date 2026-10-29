import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const srcImage = 'public/Jai Maa Durga Divine Marketplace.png';
const outDir = 'public/images';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function extract() {
  const meta = await sharp(srcImage).metadata();
  console.log('Source image dimensions:', meta.width, 'x', meta.height);

  // 1. Mobile recharge banner illustration/graphic
  // right banner in row of 3: x ~ 630, y ~ 490, w ~ 246, h ~ 155
  await sharp(srcImage)
    .extract({ left: 630, top: 490, width: 246, height: 155 })
    .toFile(path.join(outDir, 'promo-recharge-banner.png'));
  console.log('Extracted promo-recharge-banner.png');

  // Also crop the mobile phone mockup inside it:
  await sharp(srcImage)
    .extract({ left: 740, top: 500, width: 130, height: 140 })
    .toFile(path.join(outDir, 'promo-recharge-phone.png'));
  console.log('Extracted promo-recharge-phone.png');

  // 2. Family celebration with gift box from Membership section
  // ~ x: 500 to 890, y: 945 to 1130
  await sharp(srcImage)
    .extract({ left: 510, top: 940, width: 380, height: 190 })
    .toFile(path.join(outDir, 'membership-family.png'));
  console.log('Extracted membership-family.png');

  // 3. Social impact Maa Durga artwork
  // ~ x: 30 to 260, y: 1435 to 1550
  await sharp(srcImage)
    .extract({ left: 35, top: 1435, width: 230, height: 115 })
    .toFile(path.join(outDir, 'social-impact-durga.png'));
  console.log('Extracted social-impact-durga.png');

  // 4. Hero bridal section
  await sharp(srcImage)
    .extract({ left: 470, top: 110, width: 420, height: 260 })
    .toFile(path.join(outDir, 'hero-reference-bride.png'));
  console.log('Extracted hero-reference-bride.png');

  // 5. Category shortcuts (9 circular icons)
  // Let's locate the 9 circles: row y is approx 410 to 480
  // width of each circle is approx 75px
  const catNames = [
    'cat-gold',
    'cat-silver',
    'cat-grocery',
    'cat-fashion',
    'cat-electronics',
    'cat-recharge',
    'cat-emi',
    'cat-pins',
    'cat-offers',
  ];

  for (let i = 0; i < 9; i++) {
    const left = Math.round(30 + i * 93.5);
    await sharp(srcImage)
      .extract({ left, top: 410, width: 76, height: 76 })
      .toFile(path.join(outDir, `${catNames[i]}.png`));
  }
  console.log('Extracted 9 category shortcut icons');

  // 6. Trending products 6 items:
  // y ~ 700 to 790
  const productNames = [
    'prod-gold-mangalsutra',
    'prod-silver-earrings',
    'prod-basmati-rice',
    'prod-ethnic-saree',
    'prod-headphones',
    'prod-gold-bracelet',
  ];

  for (let i = 0; i < 6; i++) {
    const left = Math.round(25 + i * 142.5);
    await sharp(srcImage)
      .extract({ left, top: 700, width: 130, height: 95 })
      .toFile(path.join(outDir, `${productNames[i]}.png`));
  }
  console.log('Extracted 6 product thumbnails');

  // 7. Shop by Category 6 items:
  // y ~ 1180 to 1240
  const shopCatNames = [
    'shopcat-gold',
    'shopcat-silver',
    'shopcat-grocery',
    'shopcat-fashion',
    'shopcat-electronics',
    'shopcat-recharge',
  ];

  for (let i = 0; i < 6; i++) {
    const left = Math.round(35 + i * 141);
    await sharp(srcImage)
      .extract({ left, top: 1180, width: 125, height: 60 })
      .toFile(path.join(outDir, `${shopCatNames[i]}.png`));
  }
  console.log('Extracted 6 shop-by-category thumbnails');
}

extract().catch(console.error);
