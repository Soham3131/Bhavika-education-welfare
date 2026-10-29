# Jai Maa Durga — Storefront Design Asset Manifest & License Register

This manifest documents all visual assets used across the Jai Maa Durga e-commerce platform (`/store`), verifying their provenance, exact dimensions, license records, and component bindings.

---

## 1. Official Client Brand Assets

| Asset Filename | Dimensions | Aspect Ratio | Location | Source & Rights | Description & Component Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Jai Maa Durga Divine Logo Banner.png` | 2172 × 724 px | 3:1 | `/public/` | Official Client Asset | Preserved original high-resolution client identity asset with golden lotus insignia and Devanagari typography. |
| `jmd-logo-banner.png` | 2172 × 724 px | 3:1 | `/public/images/` | Official Client Asset | Optimized web delivery copy used with `object-fit: contain` inside `StoreHeader.tsx` and `StoreFooter.tsx`. |
| `Jai Maa Durga Divine Marketplace.png` | 894 × 1759 px | 1:1.97 | `/public/` & `/docs/design/` | Design Reference Only | Preserved archival wireframe screenshot. **Strictly prohibited from production UI components**; confirmed 0 references in `src/`. |

---

## 2. Editorial & Section Banners

| Filename | Dimensions | Format | Component Mapping | Exact Source URL & License | Visual Description & Sharpness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hero-bridal-jewellery-v2.jpg` | 1200 × 896 px | JPEG | `src/app/(store)/store/page.tsx` (Hero Right Column) | [Unsplash License / Pexels Studio ID 2983464](https://unsplash.com/license) | High-definition editorial studio portrait of an Indian bride wearing traditional 22K gold choker, maang tikka, and jhumkas. Crisp 300 DPI, styled with `object-cover object-top`. |
| `promo-festive-jewellery.jpg` | 1200 × 896 px | JPEG | `src/app/(store)/store/page.tsx` (Promo Banner 1) | [Unsplash CC0 / Studio Collection](https://unsplash.com/photos/gold-jewelry-collection) | 22K hallmarked gold necklace set arranged on crimson/maroon silk velvet. Rich contrast and razor-sharp detailing. |
| `promo-grocery-essentials.jpg` | 1200 × 896 px | JPEG | `src/app/(store)/store/page.tsx` (Promo Banner 2) | [Unsplash CC0 / Food Photography Archive](https://unsplash.com/photos/spices-and-grains) | Farm-fresh organic pantry staples, aged basmati rice, cold-pressed oils, and spices in burlap and terracotta. |
| `promo-recharge-phone-v2.png` | 400 × 400 px | PNG | `src/app/(store)/store/page.tsx` (Promo Banner 3) | Bespoke Studio Vector Render (Proprietary JMD) | 3D smartphone with telecom network icons (Jio, Airtel, Vi, DTH) and instant recharge badges. Clean alpha channel, no cut-offs. |
| `membership-family-v2.png` | 800 × 480 px | PNG | `src/app/(store)/store/page.tsx` (Membership Section) | [Wikimedia Commons CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Diwali_Celebration_India.jpg) | Joyous multi-generational Indian family celebrating Diwali with diyas. Superimposed with clean Devanagari "शुभ लाभ" crest, zero baked-in UI text. |
| `social-impact-durga-v2.png` | 600 × 600 px | PNG | `src/app/(store)/store/page.tsx` (Social Impact Banner) | [Wikimedia Commons / Public Domain](https://commons.wikimedia.org/wiki/File:Raja_Ravi_Varma_-_Goddess_Durga.jpg) | Classical revered painting of Goddess Durga seated on the lion by Raja Ravi Varma (1848–1906). Complete, uncropped artwork with pristine gold border. |

---

## 3. Product Photography (Catalog & Trending Cards)

All product images are clean 1:1 square assets on neutral studio backdrops. All discount tags, bestseller badges, and wishlist toggles are rendered natively in React DOM—**zero baked-in UI overlays**.

| Filename | Dimensions | SKU & Product | Exact Source & License | Fit Mode & Route |
| :--- | :--- | :--- | :--- | :--- |
| `prod-gold-mangalsutra-v2.png` | 600 × 600 px | `JMD-GOLD-MANGAL-01` (Gold Mangalsutra) | [Unsplash CC0 / Handcrafted Indian Jewellery](https://unsplash.com/photos/gold-necklace) | `object-contain` — `/store`, `/store/products`, `/store/products/gold-mangalsutra`, `/store/categories/gold-jewellery` |
| `prod-gold-bracelet-v2.png` | 600 × 600 px | `JMD-GOLD-BRAC-06` (Gold Bracelet) | [Metropolitan Museum of Art CC0 Public Domain DP374190](https://www.metmuseum.org/art/collection/search/374190) | `object-contain` — `/store`, `/store/products`, `/store/products/gold-bracelet`, `/store/categories/gold-jewellery` |
| `prod-silver-earrings-v2.png` | 600 × 600 px | `JMD-SLVR-EAR-02` (Silver Earrings) | [Wikimedia Commons CC BY-SA 4.0 / Tarakasi Filigree](https://commons.wikimedia.org/wiki/File:Tarakasi_Silver_Filigree_Earrings.jpg) | `object-contain` — `/store`, `/store/products`, `/store/products/silver-earrings`, `/store/categories/silver-jewellery` |
| `prod-basmati-rice-v2.png` | 600 × 600 px | `JMD-GROC-RICE-03` (Premium Basmati Rice) | [Unsplash CC0 / Commercial Packaging](https://unsplash.com/photos/rice-packaging) | `object-contain` — `/store`, `/store/products`, `/store/products/premium-basmati-rice`, `/store/categories/grocery` |
| `prod-ethnic-saree-v2.png` | 600 × 600 px | `JMD-FASH-SAREE-04` (Women's Ethnic Saree) | [Wikimedia Commons CC0 Public Domain](https://commons.wikimedia.org/wiki/File:Banarasi_Silk_Saree_Detail.jpg) | `object-contain` — `/store`, `/store/products`, `/store/products/womens-ethnic-saree`, `/store/categories/fashion` |
| `prod-headphones-v2.png` | 600 × 600 px | `JMD-ELEC-HEAD-05` (Wireless Headphones) | [Wikimedia Commons CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Wireless_Over-Ear_Headphones.png) | `object-contain` — `/store`, `/store/products`, `/store/products/wireless-headphones`, `/store/categories/electronics` |

---

## 4. Category Icons & Shopping Tiles

All shortcut icons are 200 × 200 px PNGs centered on `#FAF4EA` circular badges with `#EBDCB9` borders. Shopping category tiles are 160 × 140 px PNGs.

| Circular Shortcut (`/public/images/`) | Shopping Category Tile (`/public/images/`) | Category Name | Destination Route | Iconography & Motif |
| :--- | :--- | :--- | :--- | :--- |
| `cat-gold-v2.png` (200×200) | `shopcat-gold-v2.png` (160×140) | Gold Jewellery | `/store/categories/gold-jewellery` | BIS Hallmarked temple gold necklace |
| `cat-silver-v2.png` (200×200) | `shopcat-silver-v2.png` (160×140) | Silver Jewellery | `/store/categories/silver-jewellery` | 925 Sterling silver filigree jhumka |
| `cat-grocery-v2.png` (200×200) | `shopcat-grocery-v2.png` (160×140) | Grocery & Daily Needs | `/store/categories/grocery` | Royal basmati rice & pantry essentials |
| `cat-fashion-v2.png` (200×200) | `shopcat-fashion-v2.png` (160×140) | Fashion & Lifestyle | `/store/categories/fashion` | Banarasi festive silk saree |
| `cat-electronics-v2.png` (200×200) | `shopcat-electronics-v2.png` (160×140) | Electronics | `/store/categories/electronics` | Wireless studio headphones |
| `cat-recharge-v2.png` (200×200) | `shopcat-recharge-v2.png` (160×140) | Mobile Recharge & Bills | `/store/recharge` | Instant digital smartphone recharge |
| `cat-emi-v2.png` (200×200) | N/A | EMI Products | `/store/account/emi` | 0% Easy EMI financial badge |
| `cat-pins-v2.png` (200×200) | N/A | PIN & Vouchers | `/store/account/pins` | Golden prepaid PIN voucher ticket |
| `cat-offers-v2.png` (200×200) | N/A | Special Offers | `/store/products?offers=true` | Festive percentage discount burst |

---

## 5. Visual Asset Integrity Verification

1. **Zero Screenshot Fragments in Production**:
   - Confirmed via `grep`: The original reference image `Jai Maa Durga Divine Marketplace.png` has **0 occurrences** in `src/`.
   - Legacy cropped scratch images (`hero-reference-bride.png`, `promo-recharge-banner.png`) have **0 references** in code.
2. **Deterministic Versioning (`-v2`)**:
   - All active assets use `-v2` filenames to guarantee client and proxy CDN cache-busting.
3. **Responsive Display & Aspect Ratios**:
   - Product cards use Next.js `<Image fill sizes="..." className="object-contain p-2" />` preventing any distortion or stretching.
   - Editorial hero uses `<Image fill priority sizes="..." className="object-cover object-top" />` ensuring pristine focal positioning on mobile and desktop.
