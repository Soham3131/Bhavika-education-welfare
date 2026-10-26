import { handle, ok } from "@/server/http";
import { getStoreMemberSession } from "@/server/store/auth/session";
import { getStoreDb } from "@/server/store/db/connect";
import { getStoreMemberModel } from "@/server/store/models/StoreMember";
import { Types } from "mongoose";

export const GET = handle(async () => {
  const session = await getStoreMemberSession();
  if (!session) {
    return ok({ authenticated: false, member: null });
  }

  const db = await getStoreDb();
  const StoreMember = getStoreMemberModel(db);
  const member = await StoreMember.findById(
    new Types.ObjectId(session.storeMemberId),
  );

  if (!member || member.sessionVersion !== session.sessionVersion) {
    return ok({ authenticated: false, member: null });
  }

  return ok({
    authenticated: true,
    member: {
      memberId: member.memberId,
      name: member.name,
      phone: member.phone,
      email: member.email,
      tier: member.tier,
      sponsorId: member.sponsorId,
      hasPurchasedOnboardingKit: member.hasPurchasedOnboardingKit,
      hasPinPrivilege: member.hasPinPrivilege,
    },
  });
});
