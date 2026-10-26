import { Schema, Document, Model, Connection, Types } from "mongoose";

export interface IStoreProduct {
  sku: string;
  title: string;
  slug: string;
  category: Types.ObjectId;
  description?: string;
  images: string[];
  basePricePaise: number;
  stock: number;
  reservedStock: number;
  isActive: boolean;
  attributes?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreProductDoc extends IStoreProduct, Document {}

export const StoreProductSchema = new Schema<IStoreProductDoc>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "StoreCategory",
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    images: {
      type: [String],
      default: [],
    },
    basePricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "basePricePaise must be an integer",
      },
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "stock must be an integer",
      },
    },
    reservedStock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "reservedStock must be an integer",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    attributes: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "store_products",
  },
);

// Invariant: reservedStock <= stock
StoreProductSchema.pre("save", function () {
  if (this.reservedStock > this.stock) {
    throw new Error(
      `Invariant violation: reservedStock (${this.reservedStock}) cannot exceed stock (${this.stock})`,
    );
  }
});

export function getStoreProductModel(conn: Connection): Model<IStoreProductDoc> {
  return (
    (conn.models.StoreProduct as Model<IStoreProductDoc>) ||
    conn.model<IStoreProductDoc>("StoreProduct", StoreProductSchema)
  );
}
