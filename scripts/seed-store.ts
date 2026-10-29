import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { StoreCategorySchema } from "../src/server/store/models/StoreCategory";
import { StoreProductSchema } from "../src/server/store/models/StoreProduct";

async function seedStore() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing in .env.local");

  const dbName = process.env.JMD_MONGODB_DB_NAME || "jai_maa_durga";

  // 1. Target database isolation: ensure seed script NEVER targets the Bhavika NGO database
  if (dbName === "bhavika_dev" || dbName === "bhavika" || dbName === "bhavika_prod") {
    throw new Error(`FATAL SAFETY CHECK: seedStore must never target the Bhavika NGO database (${dbName}).`);
  }

  // 2. Strict production safety guard: Always refuse to run in production environments under all circumstances
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    throw new Error(
      "FATAL: Store database seeding (scripts/seed-store.ts) is strictly forbidden in production environments.\n" +
      "There is no override or bypass. Production catalogue onboarding must use an independent, reviewed, and audited operational procedure."
    );
  }

  console.log(`Connecting to MongoDB (${dbName})...`);

  const conn = mongoose.createConnection(uri, { dbName });
  await conn.asPromise();
  console.log("✓ Connected to Store DB:", conn.name);

  // Pre-seed non-destruction assertions
  const initialOrdersCount = await conn.collection("store_orders").countDocuments();
  const initialMembersCount = await conn.collection("store_members").countDocuments();

  const Category = conn.model("StoreCategory", StoreCategorySchema);
  const Product = conn.model("StoreProduct", StoreProductSchema);

  // 1. Seed Categories
  const categoriesData = [
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac743540998895d"),
      name: "Gold Jewellery",
      slug: "gold-jewellery",
      type: "JEWELLERY_GOLD" as const,
      description: "Fine gold necklaces, mangalsutras, bracelets and chains.",
      isActive: true,
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac743540998895e"),
      name: "Silver Jewellery",
      slug: "silver-jewellery",
      type: "JEWELLERY_SILVER" as const,
      description: "Pure 925 Sterling Silver earrings, payals, rings, and religious pooja articles.",
      isActive: true,
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac743540998895f"),
      name: "Grocery & Daily Needs",
      slug: "grocery",
      type: "GROCERY" as const,
      description: "Premium basmati rice, cold-pressed oils, lentils, whole spices and household essentials.",
      isActive: true,
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac7435409988960"),
      name: "Fashion & Lifestyle",
      slug: "fashion",
      type: "FASHION" as const,
      description: "Traditional Banarasi sarees, ethnic festive kurtas, dupattas and accessories.",
      isActive: true,
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac7435409988961"),
      name: "Electronics",
      slug: "electronics",
      type: "ELECTRONICS" as const,
      description: "Wireless audio, smart watches, portable accessories and appliances.",
      isActive: true,
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0beac7435409988962"),
      name: "Mobile Recharge",
      slug: "recharge",
      type: "RECHARGE" as const,
      description: "Prepaid mobile recharge, DTH, electricity and utility payments.",
      isActive: true,
    },
  ];

  const catMap = new Map<string, mongoose.Types.ObjectId>();

  for (const c of categoriesData) {
    const { _id, ...fields } = c;
    const existing = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $set: fields, $setOnInsert: { _id } },
      { upsert: true, returnDocument: "after" }
    );
    catMap.set(c.slug, existing!._id as mongoose.Types.ObjectId);
    console.log(`✓ Category: ${c.name} (${existing!._id})`);
  }

  // 2. Seed Products (Verified items without invented customer ratings or reviews)
  const productsData = [
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988963"),
      sku: "JMD-GOLD-MANGAL-01",
      title: "Gold Mangalsutra",
      slug: "gold-mangalsutra",
      category: catMap.get("gold-jewellery")!,
      basePricePaise: 4899900,
      stock: 25,
      reservedStock: 0,
      images: ["/images/prod-gold-mangalsutra-v2.png"],
      description: "18K Gold traditional royal mangalsutra with diamond accents.",
      isActive: true,
      attributes: {
        karat: "18K",
        badge: "Bestseller",
        originalPriceRupees: 52999,
        isDemoCatalog: true,
      },
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988964"),
      sku: "JMD-GOLD-BRAC-06",
      title: "Gold Bracelet",
      slug: "gold-bracelet",
      category: catMap.get("gold-jewellery")!,
      basePricePaise: 3256900,
      stock: 15,
      reservedStock: 0,
      images: ["/images/prod-gold-bracelet-v2.png"],
      description: "22K lightweight daily wear floral design gold bracelet.",
      isActive: true,
      attributes: {
        karat: "22K",
        originalPriceRupees: 34999,
        isDemoCatalog: true,
      },
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988965"),
      sku: "JMD-SLVR-EAR-02",
      title: "Silver Earrings",
      slug: "silver-earrings",
      category: catMap.get("silver-jewellery")!,
      basePricePaise: 299900,
      stock: 40,
      reservedStock: 0,
      images: ["/images/prod-silver-earrings-v2.png"],
      description: "Pure 925 Sterling Silver handcrafted filigree jhumka earrings with freshwater pearls.",
      isActive: true,
      attributes: {
        purity: "925 Sterling",
        originalPriceRupees: 3499,
        isDemoCatalog: true,
      },
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988966"),
      sku: "JMD-GROC-RICE-03",
      title: "Premium Basmati Rice",
      slug: "premium-basmati-rice",
      category: catMap.get("grocery")!,
      basePricePaise: 54900,
      stock: 150,
      reservedStock: 0,
      images: ["/images/prod-basmati-rice-v2.png"],
      description: "5kg Royal aged long grain aromatic basmati rice for festive meals.",
      isActive: true,
      attributes: {
        weight: "5kg",
        badge: "10% OFF",
        originalPriceRupees: 600,
        isDemoCatalog: true,
      },
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988967"),
      sku: "JMD-FASH-SAREE-04",
      title: "Women's Ethnic Saree",
      slug: "womens-ethnic-saree",
      category: catMap.get("fashion")!,
      basePricePaise: 189900,
      stock: 50,
      reservedStock: 0,
      images: ["/images/prod-ethnic-saree-v2.png"],
      description: "Banarasi silk blend festive saree with rich zari border and pallu.",
      isActive: true,
      attributes: {
        fabric: "Banarasi Silk",
        badge: "Popular",
        originalPriceRupees: 2299,
        isDemoCatalog: true,
      },
    },
    {
      _id: new mongoose.Types.ObjectId("6adf9f0ceac7435409988968"),
      sku: "JMD-ELEC-HEAD-05",
      title: "Wireless Headphones",
      slug: "wireless-headphones",
      category: catMap.get("electronics")!,
      basePricePaise: 299900,
      stock: 60,
      reservedStock: 0,
      images: ["/images/prod-headphones-v2.png"],
      description: "Active noise cancelling bluetooth over-ear headphones with 30-hour battery life.",
      isActive: true,
      attributes: {
        battery: "30h",
        badge: "5% OFF",
        originalPriceRupees: 3499,
        isDemoCatalog: true,
      },
    },
  ];

  for (const p of productsData) {
    const { _id, stock, reservedStock, ...updateFields } = p;
    const existing = await Product.findOneAndUpdate(
      { sku: p.sku },
      {
        $set: updateFields,
        $setOnInsert: { _id, stock, reservedStock: reservedStock ?? 0 },
      },
      { upsert: true, returnDocument: "after" }
    );
    console.log(`✓ Product: ${p.title} (${existing!._id})`);
  }

  // Post-seed non-destruction assertions
  const postOrdersCount = await conn.collection("store_orders").countDocuments();
  const postMembersCount = await conn.collection("store_members").countDocuments();
  if (initialOrdersCount !== postOrdersCount || initialMembersCount !== postMembersCount) {
    throw new Error(
      "SAFETY VIOLATION: Customer order or member records were altered during catalogue seeding!"
    );
  }

  console.log("\n✅ Store seed complete! Verified zero impact on orders/members; inventory protected.\n");
  await conn.close();
  process.exit(0);
}

seedStore().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
