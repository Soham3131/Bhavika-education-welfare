import { Schema, Document, Model, Connection, Types } from "mongoose";
import { StoreMemberTier } from "./StoreMember";

export type MembershipTransitionType =
  | "INITIAL"
  | "UPGRADE"
  | "RENEWAL"
  | "DOWNGRADE"
  | "ADMIN_OVERRIDE";

export interface IStoreMembershipHistory {
  memberId: Types.ObjectId;
  fromTier: StoreMemberTier;
  toTier: StoreMemberTier;
  transitionType: MembershipTransitionType;
  reason: string;
  orderRef: string | null;
  adminId: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface IStoreMembershipHistoryDoc
  extends IStoreMembershipHistory,
    Document {}

export const StoreMembershipHistorySchema =
  new Schema<IStoreMembershipHistoryDoc>(
    {
      memberId: {
        type: Schema.Types.ObjectId,
        ref: "StoreMember",
        required: true,
        index: true,
      },
      fromTier: {
        type: String,
        enum: ["FREE", "AREA", "CHIEF"],
        required: true,
      },
      toTier: {
        type: String,
        enum: ["FREE", "AREA", "CHIEF"],
        required: true,
        index: true,
      },
      transitionType: {
        type: String,
        enum: [
          "INITIAL",
          "UPGRADE",
          "RENEWAL",
          "DOWNGRADE",
          "ADMIN_OVERRIDE",
        ],
        required: true,
        index: true,
      },
      reason: {
        type: String,
        required: true,
      },
      orderRef: {
        type: String,
        default: null,
        index: true,
      },
      adminId: {
        type: String,
        default: null,
      },
      effectiveAt: {
        type: Date,
        default: Date.now,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: { createdAt: true, updatedAt: false },
      collection: "store_membership_history",
    },
  );

StoreMembershipHistorySchema.index({ memberId: 1, createdAt: -1 });

export function getStoreMembershipHistoryModel(
  conn: Connection,
): Model<IStoreMembershipHistoryDoc> {
  return (
    (conn.models.StoreMembershipHistory as Model<IStoreMembershipHistoryDoc>) ||
    conn.model<IStoreMembershipHistoryDoc>(
      "StoreMembershipHistory",
      StoreMembershipHistorySchema,
    )
  );
}
