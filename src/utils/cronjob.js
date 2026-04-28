import schedule from "node-schedule";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

export function startSubscriptionStatusCron() {

  schedule.scheduleJob("0 5 * * *", async () => {
    try {
      const now = new Date();
      const nowMillis = Date.now();
      const freeTierCredits = {
        "credits.aiStylist.limit": 3,
        "credits.aiStylist.used": 0,
        "credits.vto.limit": 3,
        "credits.vto.used": 0,
        "credits.resetAt": now
      };

      const expiredSubscriptions = await Subscription.find({
        status: "will_expire",
        $or: [
          { expiryDate: { $lt: now } },
          { expiryTimeMillis: { $lt: nowMillis } }
        ]
      }).select("_id userId");

      if (expiredSubscriptions.length === 0) {
        return;
      }

      const subscriptionIds = expiredSubscriptions.map((subscription) => subscription._id);
      const userIds = expiredSubscriptions
        .map((subscription) => subscription.userId)
        .filter(Boolean);

      const result = await Subscription.updateMany(
        {
          _id: { $in: subscriptionIds }
        },
        {
          $set: {
            status: "cancelled",
            lastVerifiedAt: now
          }
        }
      );

      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          {
            $set: freeTierCredits
          }
        );
      }

      if (result.modifiedCount > 0) {
        console.log(
          `[IAP][Cron] Updated ${result.modifiedCount} subscription(s) to cancelled and reset ${userIds.length} user(s) to free tier`
        );
      }
    } catch (error) {
      console.error("[IAP][Cron] Failed to update subscription statuses:", error);
    }
  });
}
