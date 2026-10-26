import { handle, ok } from "@/server/http";
import { requireStoreAdmin } from "@/server/store/auth/store-admin";
import { listAllPins } from "@/server/store/services/pin.service";

export const GET = handle(async () => {
  await requireStoreAdmin("STORE_FINANCIAL_RECONCILE");
  const pins = await listAllPins();
  return ok({ pins });
});
