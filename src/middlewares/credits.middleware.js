import User from "../models/User.js";

/**
 * Factory: returns an Express middleware that checks whether the authenticated
 * user has remaining credits for the given feature, then decrements on success.
 *
 * Usage (in a route file):
 *   import { checkCredit } from "../middlewares/credits.middleware.js";
 *   router.post("/create", authCheck, checkCredit("aiStylist"), controller);
 *   router.post("/vto",    authCheck, checkCredit("vto"),       controller);
 *
 * The middleware attaches req.creditUser so downstream controllers can avoid
 * a second DB lookup if they need the user document.
 *
 * @param {"aiStylist"|"vto"} feature
 */
export function checkCredit(feature) {
  return async (req, res, next) => {
    const userId = req.headers.user_id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
      const user = await User.findById(userId).select("credits").lean();
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Initialise credit block with free-tier defaults if the field is missing
      // (handles existing accounts created before this feature was added)
      const credits = user.credits ?? {
        aiStylist: { used: 0, limit: 3 },
        vto:       { used: 0, limit: 3 },
      };

      const featureCredits = credits[feature] ?? { used: 0, limit: 3 };
      const { used, limit } = featureCredits;

      // VTO blocked for this tier (limit === 0)
      if (limit === 0) {
        return res.status(403).json({
          success: false,
          code: "VTO_UPGRADE_REQUIRED",
          message: "Virtual Try-On is not available on your current plan. Please upgrade to Rai Pro.",
          credits: { used, limit },
        });
      }

      // Monthly limit reached
      if (used >= limit) {
        return res.status(403).json({
          success: false,
          code: "CREDIT_LIMIT_REACHED",
          message: `You have used all ${limit} ${feature === "aiStylist" ? "AI Stylist" : "Virtual Try-On"} generations for this month. Please upgrade your plan.`,
          credits: { used, limit },
        });
      }

      // Attach to request so controllers/subsequent middleware can use it
      req.creditFeature = feature;
      req.creditUser    = user;
      next();
    } catch (err) {
      console.error("[Credits] Middleware error:", err.message);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
}

/**
 * Increments the `used` counter for the feature that was checked by
 * `checkCredit`. Call this AFTER a successful generation.
 *
 * @param {string} userId
 * @param {"aiStylist"|"vto"} feature
 */
export async function consumeCredit(userId, feature) {
  try {
    await User.findByIdAndUpdate(userId, {
      $inc: { [`credits.${feature}.used`]: 1 },
    });
  } catch (err) {
    // Non-fatal – log but don't break the response
    console.error(`[Credits] Failed to increment ${feature} credit for user ${userId}:`, err.message);
  }
}
