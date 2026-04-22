import { Schema, model } from "mongoose";

const SubscriptionHistorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      index: true,
    },

    platform: {
      type: String,
      enum: ["ios", "android"],
      required: true,
    },

    eventType: String,
    eventSource: {
      type: String,
      enum: ["verify", "webhook", "restore"],
      required: true,
    },

    notificationType: String,
    notificationSubtype: String,
    statusReason: String,

    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "unknown"],
      default: "unknown",
    },

    productId: String,
    basePlanId: String,
    packageName: String,
    environment: String,
    autoRenewing: Boolean,

    orderId: String,
    transactionId: String,
    originalTransactionId: String,
    purchaseToken: String,
    linkedPurchaseToken: String,

    startDate: Date,
    expiryDate: Date,
    expiryTimeMillis: String,
    occurredAt: Date,

    providerReferenceId: String,

    rawRequest: Schema.Types.Mixed,
    rawResponse: Schema.Types.Mixed,
  },
  { timestamps: true }
);

SubscriptionHistorySchema.index({ userId: 1, createdAt: -1 });
SubscriptionHistorySchema.index({ platform: 1, providerReferenceId: 1, createdAt: -1 });
SubscriptionHistorySchema.index({ originalTransactionId: 1, createdAt: -1 });
SubscriptionHistorySchema.index({ purchaseToken: 1, createdAt: -1 });

export default model("SubscriptionHistory", SubscriptionHistorySchema);
