import { handle, ok } from "@/server/http";
import { requireStoreMember } from "@/server/store/auth/session";
import { getMemberSponsorTree } from "@/server/store/services/referral.service";

export const GET = handle(async () => {
  const session = await requireStoreMember();
  const tree = await getMemberSponsorTree(session.memberId);

  return ok({
    tree,
    referralCode: tree.member.memberId,
    shareUrl: `${process.env.NEXTAUTH_URL || ""}/store/register?ref=${tree.member.memberId}`,
  });
});
