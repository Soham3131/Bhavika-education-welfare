import { Schema, Document, Model, Connection, Types } from "mongoose";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PROCESSING_COUPONS"
  | "PAID"
  | "PARTIAL_COUPON_REDEMPTION_DEFICIT"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "CANCELLED_PARTIAL_COUPON_CONSUMED"
  | "REFUNDED"
  | "EXPIRED";

export type OrderPaymentStatus =
  | "UNPAID"
  | "PENDING"
  | "CAPTURED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED";

export interface IOrderItem {
  productId: Types.ObjectId;
  sku: string;
  title: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IStoreOrder {
  orderRef: string;
  memberId: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  itemsTotalPaise: number;
  taxPaise: number;
  shippingFeePaise: number;
  couponDiscountPaise: number;
  netPayablePaise: number;
  paidCashPaise: number;
  deficitPaise: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  stockReservationExpiresAt: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreOrderDoc extends IStoreOrder, Document {}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "StoreProduct",
      required: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "quantity must be an integer",
      },
    },
    unitPricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "unitPricePaise must be an integer",
      },
    },
    totalPricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "totalPricePaise must be an integer",
      },
    },
  },
  { _id: false },
);

const ShippingAddressSchema = new Schema<IShippingAddress>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },
  },
  { _id: false },
);

export const StoreOrderSchema = new Schema<IStoreOrderDoc>(
  {
    orderRef: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: "StoreMember",
      required: true,
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (v: IOrderItem[]) => v && v.length > 0,
        message: "Order must contain at least one item",
      },
    },
    shippingAddress: {
      type: ShippingAddressSchema,
      required: true,
    },
    itemsTotalPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "itemsTotalPaise must be an integer",
      },
    },
    taxPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "taxPaise must be an integer",
      },
    },
    shippingFeePaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "shippingFeePaise must be an integer",
      },
    },
    couponDiscountPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "couponDiscountPaise must be an integer",
      },
    },
    netPayablePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "netPayablePaise must be an integer",
      },
    },
    paidCashPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "paidCashPaise must be an integer",
      },
    },
    deficitPaise: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: "deficitPaise must be an integer",
      },
    },
    status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "PROCESSING_COUPONS",
        "PAID",
        "PARTIAL_COUPON_REDEMPTION_DEFICIT",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "CANCELLED_PARTIAL_COUPON_CONSUMED",
        "REFUNDED",
        "EXPIRED",
      ],
      default: "PENDING_PAYMENT",
      required: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: [
        "UNPAID",
        "PENDING",
        "CAPTURED",
        "PARTIALLY_REFUNDED",
        "REFUNDED",
        "FAILED",
      ],
      default: "UNPAID",
      required: true,
      index: true,
    },
    stockReservationExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "store_orders",
  },
);

StoreOrderSchema.index({ memberId: 1, createdAt: -1 });

export function getStoreOrderModel(conn: Connection): Model<IStoreOrderDoc> {
  return (
    (conn.models.StoreOrder as Model<IStoreOrderDoc>) ||
    conn.model<IStoreOrderDoc>("StoreOrder", StoreOrderSchema)
  );
}
