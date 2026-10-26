import { Schema, Document, Model, Connection } from "mongoose";
import { StoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/validation/store-settings";

export interface IStoreSettingsDoc extends Document {
  singletonKey: string;
  settings: StoreSettings;
  createdAt: Date;
  updatedAt: Date;
}

export const StoreSettingsSchema = new Schema<IStoreSettingsDoc>(
  {
    singletonKey: {
      type: String,
      default: "DEFAULT_SETTINGS",
      unique: true,
      required: true,
      index: true,
    },
    settings: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_STORE_SETTINGS }),
    },
  },
  {
    timestamps: true,
    collection: "store_settings",
  },
);

export function getStoreSettingsModel(conn: Connection): Model<IStoreSettingsDoc> {
  return (conn.models.StoreSettings as Model<IStoreSettingsDoc>) || conn.model<IStoreSettingsDoc>("StoreSettings", StoreSettingsSchema);
}
