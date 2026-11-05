import { Schema, Document, Model, Connection } from "mongoose";

export interface IStoreInvoiceSequence {
  prefix: string;
  financialYear: string;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStoreInvoiceSequenceDoc
  extends IStoreInvoiceSequence,
    Document {}

export const StoreInvoiceSequenceSchema =
  new Schema<IStoreInvoiceSequenceDoc>(
    {
      prefix: { type: String, required: true },
      financialYear: { type: String, required: true },
      lastSequence: { type: Number, required: true, default: 0 },
    },
    {
      timestamps: true,
      collection: "store_invoice_sequences",
    },
  );

StoreInvoiceSequenceSchema.index(
  { prefix: 1, financialYear: 1 },
  { unique: true },
);

export function getStoreInvoiceSequenceModel(
  conn: Connection,
): Model<IStoreInvoiceSequenceDoc> {
  return (
    (conn.models.StoreInvoiceSequence as Model<IStoreInvoiceSequenceDoc>) ||
    conn.model<IStoreInvoiceSequenceDoc>(
      "StoreInvoiceSequence",
      StoreInvoiceSequenceSchema,
    )
  );
}
