import { NextResponse, NextRequest } from "next/server";
import { getStoreOrderByRef } from "@/server/store/services/order.service";
import { generateOrderTaxInvoicePdf } from "@/server/store/services/tax-invoice-pdf.service";
import { getStoreMemberSession } from "@/server/store/auth/session";
import {
  requireStoreAdmin,
  getStoreAdminSession,
} from "@/server/store/auth/store-admin";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ orderRef: string }> },
) {
  const { orderRef } = await ctx.params;

  if (!orderRef) {
    return NextResponse.json({ error: "Order reference is required." }, { status: 400 });
  }

  const order = await getStoreOrderByRef(orderRef);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Authorization check: either the order's owner member or an authorized store admin
  const memberSession = await getStoreMemberSession();
  const isOwner =
    Boolean(
      memberSession &&
        order.memberId &&
        order.memberId.toString() === memberSession.storeMemberId,
    );

  let isAdmin = false;
  if (!isOwner) {
    try {
      await requireStoreAdmin("STORE_ORDER_MANAGE", {
        action: "STORE_ORDER_INVOICE_DOWNLOAD",
        targetType: "STORE_ORDER",
        targetId: order._id?.toString() || order.orderRef,
      });
      isAdmin = true;
    } catch {
      const adminSession = await getStoreAdminSession("STORE_ORDER_MANAGE");
      isAdmin = !!adminSession;
    }
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized access to tax invoice." }, { status: 403 });
  }

  try {
    const pdfBytes = await generateOrderTaxInvoicePdf(order);

    const arrayBuffer = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    const filename = order.invoiceNumber
      ? `Tax-Invoice-${order.invoiceNumber.replace(/\//g, "-")}.pdf`
      : `Tax-Invoice-${order.orderRef}.pdf`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const error = err as {
      statusCode?: number;
      status?: number;
      message?: string;
      code?: string;
    };
    const statusCode = error.statusCode || error.status || 500;
    return NextResponse.json(
      {
        error: error.message || "Failed to generate tax invoice PDF.",
        code: error.code || "INVOICE_GENERATION_FAILED",
      },
      { status: statusCode },
    );
  }
}
