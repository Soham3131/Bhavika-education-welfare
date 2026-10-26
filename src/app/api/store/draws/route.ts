import { handle, ok } from "@/server/http";
import { getStoreMemberSession } from "@/server/store/auth/session";
import {
  listStorefrontDraws,
  listMemberLuckyTickets,
} from "@/server/store/services/lucky-draw.service";

export const GET = handle(async () => {
  const session = await getStoreMemberSession();
  const draws = await listStorefrontDraws();

  let myTickets: unknown[] = [];
  if (session) {
    myTickets = await listMemberLuckyTickets(session.memberId);
  }

  return ok({
    draws,
    myTickets,
  });
});
