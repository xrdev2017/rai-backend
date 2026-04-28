import schedule from "node-schedule";
import Subscription from "../models/Subscription.js";

export function startSubscriptionStatusCron() {
  // Runs every 5 minutes.
  schedule.scheduleJob("*/5 * * * *", async () => {
    try {
      const now = new Date();
      const nowMillis = Date.now();

      const result = await Subscription.updateMany(
        {
          status: "will_expire",
          $or: [
            { expiryDate: { $lt: now } },
            { expiryTimeMillis: { $lt: nowMillis } }
          ]
        },
        {
          $set: {
            status: "cancelled",
            lastVerifiedAt: now
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(
          `[IAP][Cron] Updated ${result.modifiedCount} subscription(s) from will_expire to cancelled`
        );
      }
    } catch (error) {
      console.error("[IAP][Cron] Failed to update subscription statuses:", error);
    }
  });
}
