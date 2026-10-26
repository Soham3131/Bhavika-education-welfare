import "server-only";
import { Types, ClientSession } from "mongoose";
import { getStoreDb, withStoreTransaction } from "../db/connect";
import {
  getStoreWalletModel,
  IStoreWalletDoc,
} from "../models/StoreWallet";
import {
  getStoreWalletLedgerModel,
  IStoreWalletLedgerDoc,
  StoreWalletType,
  StoreLedgerTxType,
  StoreLedgerUnit,
  StoreLedgerRefType,
} from "../models/StoreWalletLedger";
import { DomainError } from "@/server/errors";

export interface MutateWalletArgs {
  memberId: string | Types.ObjectId;
  walletType: StoreWalletType;
  type: StoreLedgerTxType;
  unit: StoreLedgerUnit;
  amountPaise?: number;
  pointsDelta?: number;
  referenceType: StoreLedgerRefType;
  referenceId: string;
  idempotencyKey: string;
  description: string;
  metadata?: Record<string, unknown>;
  session?: ClientSession;
}

export interface MutateWalletResult {
  ledger: IStoreWalletLedgerDoc;
  wallet: IStoreWalletDoc;
  isReplay: boolean;
}

const FIELD_MAP: Record<StoreWalletType, keyof IStoreWalletDoc> = {
  ADD_MONEY: "addMoneyPaise",
  MEMBER_ACTIVATION: "memberActivationPaise",
  PRODUCT_POINT: "productPoints",
  FREE_REFERRAL: "freeReferralPaise",
  PAID_REFERRAL: "paidReferralPaise",
  RECHARGE: "rechargePaise",
  COUPON: "couponWalletPaise",
};

export async function getOrCreateStoreWallet(
  memberId: string | Types.ObjectId,
  session?: ClientSession,
): Promise<IStoreWalletDoc> {
  const conn = await getStoreDb();
  const WalletModel = getStoreWalletModel(conn);
  const mId = new Types.ObjectId(memberId);

  let wallet = await WalletModel.findOne({ member: mId }).session(session ?? null);
  if (!wallet) {
    wallet = new WalletModel({
      member: mId,
      addMoneyPaise: 0,
      memberActivationPaise: 0,
      productPoints: 0,
      freeReferralPaise: 0,
      paidReferralPaise: 0,
      rechargePaise: 0,
      couponWalletPaise: 0,
      version: 0,
    });
    await wallet.save({ session });
  }
  return wallet;
}

export async function mutateStoreWallet(args: MutateWalletArgs): Promise<MutateWalletResult> {
  const execute = async (session: ClientSession): Promise<MutateWalletResult> => {
    const conn = await getStoreDb();
    const LedgerModel = getStoreWalletLedgerModel(conn);
    const WalletModel = getStoreWalletModel(conn);
    const mId = new Types.ObjectId(args.memberId);

    // 1. Idempotency Check: if key already exists, return existing outcome (no-op)
    const existing = await LedgerModel.findOne({ idempotencyKey: args.idempotencyKey }).session(session);
    if (existing) {
      const currentWallet = await getOrCreateStoreWallet(mId, session);
      return {
        ledger: existing,
        wallet: currentWallet,
        isReplay: true,
      };
    }

    // 2. Unit & Value Validation
    if (args.walletType === "PRODUCT_POINT") {
      if (args.unit !== "LOYALTY_POINT" || !args.pointsDelta || args.pointsDelta <= 0) {
        throw new DomainError(
          "PRODUCT_POINT wallet requires unit LOYALTY_POINT and positive pointsDelta",
          400,
          "INVALID_UNIT",
        );
      }
    } else {
      if (args.unit !== "INR_PAISE" || !args.amountPaise || args.amountPaise <= 0) {
        throw new DomainError(
          `${args.walletType} wallet requires unit INR_PAISE and positive amountPaise`,
          400,
          "INVALID_UNIT",
        );
      }
    }

    const fieldName = FIELD_MAP[args.walletType];
    const wallet = await getOrCreateStoreWallet(mId, session);
    const currentVal = (wallet[fieldName] as number) ?? 0;

    let delta: number;
    let balanceAfterPaise: number | null = null;
    let pointsAfter: number | null = null;

    if (args.unit === "INR_PAISE") {
      const amt = args.amountPaise!;
      if (args.type === "DEBIT") {
        if (currentVal < amt) {
          throw new DomainError(
            `Insufficient balance in ${args.walletType} (available: ₹${(currentVal / 100).toFixed(2)}, required: ₹${(amt / 100).toFixed(2)})`,
            400,
            "INSUFFICIENT_BALANCE",
          );
        }
        delta = -amt;
      } else {
        delta = amt;
      }
      balanceAfterPaise = currentVal + delta;
    } else {
      const pts = args.pointsDelta!;
      if (args.type === "DEBIT") {
        if (currentVal < pts) {
          throw new DomainError(
            `Insufficient points in ${args.walletType} (available: ${currentVal}, required: ${pts})`,
            400,
            "INSUFFICIENT_POINTS",
          );
        }
        delta = -pts;
      } else {
        delta = pts;
      }
      pointsAfter = currentVal + delta;
    }

    // 3. Write Immutable Ledger Row
    const ledgerDoc = new LedgerModel({
      member: mId,
      walletType: args.walletType,
      type: args.type,
      unit: args.unit,
      amountPaise: args.unit === "INR_PAISE" ? args.amountPaise : null,
      pointsDelta: args.unit === "LOYALTY_POINT" ? args.pointsDelta : null,
      balanceAfterPaise,
      pointsAfter,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      description: args.description,
      metadata: args.metadata,
    });
    await ledgerDoc.save({ session });

    // 4. Update Denormalized Balance Cache Atomically
    const updatedWallet = await WalletModel.findOneAndUpdate(
      { _id: wallet._id },
      {
        $inc: { [fieldName]: delta, version: 1 },
      },
      { returnDocument: "after", session },
    );

    if (!updatedWallet) {
      throw new DomainError("Failed to update wallet balance", 500, "WALLET_UPDATE_FAILED");
    }

    return {
      ledger: ledgerDoc,
      wallet: updatedWallet,
      isReplay: false,
    };
  };

  if (args.session) {
    return execute(args.session);
  }

  return withStoreTransaction(async (session) => {
    return execute(session);
  });
}
