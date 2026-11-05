import "server-only";
import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";
import { IStoreOrderDoc, getStoreOrderModel } from "../models/StoreOrder";
import { getStoreDb } from "../db/connect";
import { getStoreSettingsModel } from "../models/StoreSettings";
import { getStoreInvoiceSequenceModel } from "../models/StoreInvoiceSequence";
import { DomainError } from "@/server/errors";

const PAGE_W = 595.28;
const PAGE_H = 841.89;

const INK_DARK = rgb(0.1, 0.12, 0.15);
const INK_MUTED = rgb(0.4, 0.45, 0.5);
const BORDER_COLOR = rgb(0.85, 0.88, 0.92);
const BG_HEADER = rgb(0.95, 0.96, 0.98);
const BRAND_PRIMARY = rgb(0.12, 0.35, 0.65);
const STAGING_WARNING_COLOR = rgb(0.85, 0.25, 0.1);

function safe(text: string | null | undefined): string {
  return (text || "")
    .split("")
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126 ? ch : " ";
    })
    .join("")
    .trim();
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let s = safe(text);
  if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

export function isValidGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.trim(),
  );
}

/**
 * Concurrency-safe sequential invoice number allocation.
 * Format: [PREFIX]/[FINANCIAL_YEAR]/[00001] (e.g. JMD/26-27/00001)
 * Idempotently returns existing allocated invoiceNumber on order.
 */
export async function getOrAllocateInvoiceNumber(
  order: IStoreOrderDoc,
): Promise<string> {
  if (order.invoiceNumber) {
    return order.invoiceNumber;
  }

  const db = await getStoreDb();
  const OrderModel = getStoreOrderModel(db);
  const freshOrder = await OrderModel.findById(order._id);
  if (freshOrder?.invoiceNumber) {
    order.invoiceNumber = freshOrder.invoiceNumber;
    order.invoiceIssuedAt = freshOrder.invoiceIssuedAt;
    return freshOrder.invoiceNumber;
  }

  const SettingsModel = getStoreSettingsModel(db);
  const settingsDoc = (await SettingsModel.findOne({
    singletonKey: "DEFAULT_SETTINGS",
  }).lean()) as {
    settings?: {
      invoice?: {
        invoiceNumberPrefix?: string;
        financialYear?: string;
      };
    };
  } | null;

  const prefix =
    settingsDoc?.settings?.invoice?.invoiceNumberPrefix?.trim() || "JMD";
  const financialYear =
    settingsDoc?.settings?.invoice?.financialYear?.trim() || "26-27";

  const SequenceModel = getStoreInvoiceSequenceModel(db);
  const seqDoc = await SequenceModel.findOneAndUpdate(
    { prefix, financialYear },
    { $inc: { lastSequence: 1 } },
    { upsert: true, new: true },
  );

  const seqNumber = String(seqDoc.lastSequence).padStart(5, "0");
  const allocatedNumber = `${prefix}/${financialYear}/${seqNumber}`;

  order.invoiceNumber = allocatedNumber;
  order.invoiceIssuedAt = new Date();

  // Atomically persist to order document if not already allocated by a concurrent thread
  const updatedOrder = await OrderModel.findOneAndUpdate(
    {
      _id: order._id,
      $or: [
        { invoiceNumber: { $exists: false } },
        { invoiceNumber: null },
      ],
    },
    {
      $set: {
        invoiceNumber: allocatedNumber,
        invoiceIssuedAt: order.invoiceIssuedAt,
      },
    },
    { new: true },
  );

  if (!updatedOrder || updatedOrder.invoiceNumber !== allocatedNumber) {
    const canonicalOrder = await OrderModel.findById(order._id);
    if (canonicalOrder?.invoiceNumber) {
      order.invoiceNumber = canonicalOrder.invoiceNumber;
      order.invoiceIssuedAt = canonicalOrder.invoiceIssuedAt;
      return canonicalOrder.invoiceNumber;
    }
  }

  return allocatedNumber;
}

export async function generateOrderTaxInvoicePdf(
  order: IStoreOrderDoc,
): Promise<Uint8Array> {
  const db = await getStoreDb();
  const SettingsModel = getStoreSettingsModel(db);
  const settingsDoc = (await SettingsModel.findOne({
    singletonKey: "DEFAULT_SETTINGS",
  }).lean()) as {
    settings?: {
      invoice?: {
        isProductionReady?: boolean;
        legalEntityName?: string;
        tradeName?: string;
        gstin?: string;
        registeredAddress?: string;
        state?: string;
        stateCode?: string;
        supportEmail?: string;
        invoiceNumberPrefix?: string;
        financialYear?: string;
        hsnMappings?: Record<string, string>;
      };
    };
  } | null;

  const invSettings = settingsDoc?.settings?.invoice;
  const isProduction = invSettings?.isProductionReady === true;

  if (isProduction) {
    const legalName = invSettings?.legalEntityName?.trim() || "";
    const gstin = invSettings?.gstin?.trim() || "";
    const address = invSettings?.registeredAddress?.trim() || "";

    const isPlaceholderGstin = !gstin || gstin === "07AAAFB1234A1Z5";
    const isPlaceholderName =
      !legalName ||
      legalName.toUpperCase().includes("BHAVIKA WELFARE & EDUCATION");
    const isPlaceholderAddr = !address || address.includes("Sector 14");

    if (
      isPlaceholderGstin ||
      isPlaceholderName ||
      isPlaceholderAddr ||
      !isValidGstin(gstin)
    ) {
      throw new DomainError(
        "Official tax invoice issuance is restricted: Registered seller legal identity, official GSTIN, and principal place of business have not been configured and approved.",
        422,
        "INVOICE_IDENTITY_INCOMPLETE",
      );
    }
  }

  // Concurrency-safe sequential invoice numbering allocation
  const invoiceNumber = await getOrAllocateInvoiceNumber(order);

  const doc = await PDFDocument.create();
  doc.setTitle(`Tax Invoice — ${safe(invoiceNumber)}`);
  doc.setAuthor("Jai Maa Durga");

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE_H - 45;

  // 1. Header Banner
  page.drawText("TAX INVOICE", {
    x: 40,
    y,
    size: 20,
    font: fontBold,
    color: BRAND_PRIMARY,
  });

  page.drawText(
    isProduction ? "ORIGINAL FOR RECIPIENT" : "STAGING / DRAFT VOUCHER",
    {
      x: PAGE_W - 190,
      y: y + 4,
      size: 9,
      font: fontBold,
      color: isProduction ? INK_MUTED : STAGING_WARNING_COLOR,
    },
  );

  y -= 14;

  if (!isProduction) {
    page.drawText(
      "[STAGING DRAFT — NOT FOR OFFICIAL TAX CLAIM — PENDING SELLER REGISTRATION]",
      {
        x: 40,
        y,
        size: 7.5,
        font: fontBold,
        color: STAGING_WARNING_COLOR,
      },
    );
    y -= 11;
  } else {
    y -= 11;
  }

  // Decorative Rule
  page.drawLine({
    start: { x: 40, y },
    end: { x: PAGE_W - 40, y },
    thickness: 1.5,
    color: BRAND_PRIMARY,
  });

  y -= 25;

  // 2. Seller and Invoice Meta side by side
  // Left: Seller Info
  const sellerLegalName =
    invSettings?.legalEntityName?.trim() ||
    (isProduction
      ? "JAI MAA DURGA COMMERCIAL JEWELLERS LLP"
      : "JAI MAA DURGA / BHAVIKA WELFARE & EDUCATION (STAGING)");
  const sellerTradeName = invSettings?.tradeName?.trim() || "Jai Maa Durga";
  const sellerAddress =
    invSettings?.registeredAddress?.trim() ||
    (isProduction
      ? "101 Chandni Chowk, Central Delhi, Delhi - 110006"
      : "Registered Office: Main Commercial Center, Sector 14, New Delhi");
  const sellerGstin =
    invSettings?.gstin?.trim() ||
    (isProduction
      ? "07AAAAA0000A1Z5"
      : "07AAAFB1234A1Z5 (STAGING PLACEHOLDER)");
  const sellerState = invSettings?.state?.trim() || "Delhi";
  const sellerStateCode = invSettings?.stateCode?.trim() || "07";
  const sellerEmail =
    invSettings?.supportEmail?.trim() || "store@bhavikawelfare.org";

  page.drawText("SOLD BY:", {
    x: 40,
    y,
    size: 8,
    font: fontBold,
    color: INK_MUTED,
  });
  y -= 12;
  page.drawText(
    fit(
      sellerTradeName && sellerTradeName !== sellerLegalName
        ? `${sellerLegalName} (${sellerTradeName})`
        : sellerLegalName,
      fontBold,
      10,
      290,
    ),
    {
      x: 40,
      y,
      size: 10,
      font: fontBold,
      color: INK_DARK,
    },
  );
  y -= 13;
  page.drawText(fit(sellerAddress, fontRegular, 8.5, 290), {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: INK_MUTED,
  });
  y -= 12;
  page.drawText(
    fit(
      `GSTIN: ${sellerGstin} | State Code: ${sellerStateCode} (${sellerState})`,
      fontRegular,
      8.5,
      290,
    ),
    {
      x: 40,
      y,
      size: 8.5,
      font: fontRegular,
      color: INK_DARK,
    },
  );
  y -= 12;
  page.drawText(`Email: ${sellerEmail}`, {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: INK_MUTED,
  });

  // Right: Invoice Meta Box
  const metaBoxX = 350;
  let metaY = y + 49;
  page.drawText(`Invoice No: ${safe(invoiceNumber)}`, {
    x: metaBoxX,
    y: metaY,
    size: 9.5,
    font: fontBold,
    color: INK_DARK,
  });
  metaY -= 13;
  const orderDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  page.drawText(`Invoice Date: ${orderDate}`, {
    x: metaBoxX,
    y: metaY,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  metaY -= 12;
  page.drawText(`Order Reference: ${safe(order.orderRef)}`, {
    x: metaBoxX,
    y: metaY,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  metaY -= 12;
  const paymentMethodText = order.paymentMethod || "ONLINE_RAZORPAY";
  page.drawText(`Payment Mode: ${paymentMethodText} [${order.paymentStatus}]`, {
    x: metaBoxX,
    y: metaY,
    size: 9,
    font: fontBold,
    color: BRAND_PRIMARY,
  });

  y -= 25;

  // Separator
  page.drawLine({
    start: { x: 40, y },
    end: { x: PAGE_W - 40, y },
    thickness: 0.5,
    color: BORDER_COLOR,
  });

  y -= 20;

  // 3. Customer Details (Billing & Shipping)
  page.drawText("BILL TO / SHIP TO:", {
    x: 40,
    y,
    size: 8,
    font: fontBold,
    color: INK_MUTED,
  });
  y -= 12;
  page.drawText(safe(order.shippingAddress?.fullName || "Valued Customer"), {
    x: 40,
    y,
    size: 10,
    font: fontBold,
    color: INK_DARK,
  });
  y -= 12;
  page.drawText(`Phone: ${safe(order.shippingAddress?.phone || "N/A")}`, {
    x: 40,
    y,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  y -= 12;
  const addr1 = `${safe(order.shippingAddress?.addressLine1 || "")}, ${safe(order.shippingAddress?.city || "")}`;
  page.drawText(addr1, {
    x: 40,
    y,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  y -= 12;
  const addr2 = `${safe(order.shippingAddress?.state || "")} - ${safe(order.shippingAddress?.postalCode || "")}`;
  page.drawText(addr2, {
    x: 40,
    y,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  y -= 12;

  const sellerStateLower = sellerState.toLowerCase();
  const buyerState = (order.shippingAddress?.state || "").trim().toLowerCase();
  const isIntraState =
    (sellerStateLower && buyerState.includes(sellerStateLower)) ||
    (sellerStateCode && buyerState === sellerStateCode) ||
    (sellerStateCode === "06" && (buyerState.includes("haryana") || buyerState === "hr")) ||
    (sellerStateCode === "07" && (buyerState.includes("delhi") || buyerState === "dl"));
  const placeOfSupplyText = `Place of Supply: ${safe(order.shippingAddress?.state || sellerState)} (${isIntraState ? `Intra-State | State Code: ${sellerStateCode}` : "Inter-State"})`;
  page.drawText(placeOfSupplyText, {
    x: 40,
    y,
    size: 8,
    font: fontOblique,
    color: INK_MUTED,
  });

  y -= 25;

  // 4. Line Items Table Header
  const tableTop = y;
  page.drawRectangle({
    x: 40,
    y: tableTop - 18,
    width: PAGE_W - 80,
    height: 22,
    color: BG_HEADER,
  });

  page.drawText("#", { x: 45, y: tableTop - 13, size: 8, font: fontBold, color: INK_DARK });
  page.drawText("Description of Product / Service", {
    x: 70,
    y: tableTop - 13,
    size: 8,
    font: fontBold,
    color: INK_DARK,
  });
  page.drawText("Qty", { x: 300, y: tableTop - 13, size: 8, font: fontBold, color: INK_DARK });
  page.drawText("Rate (Rs)", {
    x: 345,
    y: tableTop - 13,
    size: 8,
    font: fontBold,
    color: INK_DARK,
  });
  page.drawText("Tax (Rs)", {
    x: 420,
    y: tableTop - 13,
    size: 8,
    font: fontBold,
    color: INK_DARK,
  });
  page.drawText("Total (Rs)", {
    x: 490,
    y: tableTop - 13,
    size: 8,
    font: fontBold,
    color: INK_DARK,
  });

  y = tableTop - 32;

  // 5. Line Items Rows
  let index = 1;
  for (const it of order.items) {
    page.drawText(String(index++), {
      x: 45,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });
    const isJewellery =
      it.sku.includes("GLD") ||
      it.sku.includes("SLV") ||
      /gold|silver|ring|necklace/i.test(it.title);
    const classification = isJewellery ? "HSN 7113" : `SKU ${it.sku}`;
    const itemTitle = fit(`${it.title} [${classification}]`, fontRegular, 8, 220);
    page.drawText(itemTitle, {
      x: 70,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });
    page.drawText(String(it.quantity), {
      x: 305,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });

    const unitPriceRupees = (it.unitPricePaise / 100).toFixed(2);
    page.drawText(unitPriceRupees, {
      x: 345,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });

    const itemTaxRupees = ((it.taxPaise || 0) / 100).toFixed(2);
    page.drawText(itemTaxRupees, {
      x: 420,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });

    const itemTotalRupees = (it.totalPricePaise / 100).toFixed(2);
    page.drawText(itemTotalRupees, {
      x: 490,
      y,
      size: 8,
      font: fontRegular,
      color: INK_DARK,
    });

    y -= 18;

    // Row divider
    page.drawLine({
      start: { x: 40, y: y + 6 },
      end: { x: PAGE_W - 40, y: y + 6 },
      thickness: 0.5,
      color: BORDER_COLOR,
    });
  }

  y -= 15;

  // 6. Summary Totals Box (Right Aligned)
  const sumLabelX = 350;
  const sumValX = 490;

  page.drawText("Subtotal (Items):", {
    x: sumLabelX,
    y,
    size: 9,
    font: fontRegular,
    color: INK_MUTED,
  });
  page.drawText(`Rs. ${(order.itemsTotalPaise / 100).toFixed(2)}`, {
    x: sumValX,
    y,
    size: 9,
    font: fontRegular,
    color: INK_DARK,
  });
  y -= 14;

  if (order.taxPaise > 0) {
    if (isIntraState) {
      const halfTaxPaise = Math.round(order.taxPaise / 2);
      page.drawText("CGST (Central Tax 50%):", {
        x: sumLabelX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_MUTED,
      });
      page.drawText(`Rs. ${(halfTaxPaise / 100).toFixed(2)}`, {
        x: sumValX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_DARK,
      });
      y -= 14;

      page.drawText("SGST (State Tax 50%):", {
        x: sumLabelX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_MUTED,
      });
      page.drawText(`Rs. ${((order.taxPaise - halfTaxPaise) / 100).toFixed(2)}`, {
        x: sumValX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_DARK,
      });
      y -= 14;
    } else {
      page.drawText("IGST (Integrated Tax 100%):", {
        x: sumLabelX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_MUTED,
      });
      page.drawText(`Rs. ${(order.taxPaise / 100).toFixed(2)}`, {
        x: sumValX,
        y,
        size: 9,
        font: fontRegular,
        color: INK_DARK,
      });
      y -= 14;
    }
  } else {
    page.drawText("Applicable GST / Tax:", {
      x: sumLabelX,
      y,
      size: 9,
      font: fontRegular,
      color: INK_MUTED,
    });
    page.drawText("Rs. 0.00", {
      x: sumValX,
      y,
      size: 9,
      font: fontRegular,
      color: INK_DARK,
    });
    y -= 14;
  }

  if (order.shippingFeePaise > 0) {
    page.drawText("Shipping & Handling:", {
      x: sumLabelX,
      y,
      size: 9,
      font: fontRegular,
      color: INK_MUTED,
    });
    page.drawText(`Rs. ${(order.shippingFeePaise / 100).toFixed(2)}`, {
      x: sumValX,
      y,
      size: 9,
      font: fontRegular,
      color: INK_DARK,
    });
    y -= 14;
  }

  if (order.couponDiscountPaise > 0) {
    page.drawText("Coupon Discount:", {
      x: sumLabelX,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.6, 0.2),
    });
    page.drawText(`-Rs. ${(order.couponDiscountPaise / 100).toFixed(2)}`, {
      x: sumValX,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.6, 0.2),
    });
    y -= 14;
  }

  // Grand Total Box
  page.drawRectangle({
    x: sumLabelX - 10,
    y: y - 8,
    width: PAGE_W - sumLabelX - 30,
    height: 22,
    color: BG_HEADER,
  });

  page.drawText("Total Payable Amount:", {
    x: sumLabelX,
    y: y - 2,
    size: 10,
    font: fontBold,
    color: INK_DARK,
  });
  page.drawText(`Rs. ${(order.netPayablePaise / 100).toFixed(2)}`, {
    x: sumValX,
    y: y - 2,
    size: 10,
    font: fontBold,
    color: BRAND_PRIMARY,
  });

  y -= 30;

  // Payment Status Line
  page.drawText(`Paid via ${paymentMethodText}: Rs. ${(order.paidCashPaise / 100).toFixed(2)}`, {
    x: sumLabelX,
    y,
    size: 8,
    font: fontOblique,
    color: INK_MUTED,
  });

  // 7. Footer & Legal Terms
  const footerY = 70;
  page.drawLine({
    start: { x: 40, y: footerY + 25 },
    end: { x: PAGE_W - 40, y: footerY + 25 },
    thickness: 0.5,
    color: BORDER_COLOR,
  });

  page.drawText(
    "Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    {
      x: 40,
      y: footerY + 12,
      size: 7.5,
      font: fontOblique,
      color: INK_MUTED,
    },
  );

  page.drawText(
    "This is a computer-generated invoice and does not require a physical signature.",
    {
      x: 40,
      y: footerY + 2,
      size: 7.5,
      font: fontOblique,
      color: INK_MUTED,
    },
  );

  page.drawText("For JAI MAA DURGA & BHAVIKA WELFARE", {
    x: PAGE_W - 220,
    y: footerY + 12,
    size: 8,
    font: fontBold,
    color: INK_DARK,
  });

  page.drawText("Authorized Signatory", {
    x: PAGE_W - 220,
    y: footerY + 2,
    size: 7.5,
    font: fontRegular,
    color: INK_MUTED,
  });

  return doc.save();
}
