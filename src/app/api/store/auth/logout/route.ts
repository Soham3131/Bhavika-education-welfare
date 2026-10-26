import { handle, ok } from "@/server/http";
import { STORE_SESSION_COOKIE } from "@/server/store/auth/session";

export const POST = handle(async () => {
  const response = ok({ success: true });
  response.cookies.delete(STORE_SESSION_COOKIE);
  return response;
});
