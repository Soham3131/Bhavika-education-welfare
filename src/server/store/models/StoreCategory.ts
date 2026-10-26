import { Schema, Document, Model, Connection } from "mongoose";

export type CategoryType =
  | "JEWELLERY_GOLD"
  | "JEWELLERY_SILVER"
  | "RECHARGE"
  | "GROCERY"
  | "FASHION"
  | "ELECTRONICS";

export interface IStoreCategory {
  name: string;
  slug: string;
  type: CategoryType;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreCategoryDoc extends IStoreCategory, Document {}

export const StoreCategorySchema = new Schema<IStoreCategoryDoc>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "JEWELLERY_GOLD",
        "JEWELLERY_SILVER",
        "RECHARGE",
        "GROCERY",
        "FASHION",
        "ELECTRONICS",
      ],
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "store_categories",
  },
);

export function getStoreCategoryModel(conn: Connection): Model<IStoreCategoryDoc> {
  return (
    (conn.models.StoreCategory as Model<IStoreCategoryDoc>) ||
    conn.model<IStoreCategoryDoc>("StoreCategory", StoreCategorySchema)
  );
}
