import { Schema, model } from "mongoose";

const SubscriptionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    platform: {
      type: String,
      enum: ["ios", "android"],
      required: true
    },

    productId: String,
    basePlanId: String,

    transactionId: String,
    originalTransactionId: {
      type: String,
      index: true,
    },

    purchaseToken: {
      type: String,
      unique: true,
      index: true
    },

    linkedPurchaseToken: {
      type: String,
      index: true
    },

    orderId: String,

    packageName: String,

    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "unknown"],
      default: "unknown"
    },

    startDate: Date,
    expiryDate: Date,
    expiryTimeMillis: String,

    autoRenewing: Boolean,

    lastWebhookEvent: String,
    lastVerifiedAt: Date,

    rawResponse: Schema.Types.Mixed
  },
  { timestamps: true }
);

export default model("Subscription", SubscriptionSchema);