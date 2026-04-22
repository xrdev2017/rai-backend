import {
  getUserAllInfoService,
  getUserItemsService,
  getUserOutfitsService,
  getUserLookbooksService
} from "../services/userinfoById.service.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

/**
 * Get all user info including items, outfits, lookbooks, followers, following
 */
export const getUserAllInfoController = async (req, res) => {
  try {
    const { userId } = req.params; // pass userId in params

    const data = await getUserAllInfoService(userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Get user items only
 */
export const getUserItemsController = async (req, res) => {
  try {
    const { userId } = req.params;

    const items = await getUserItemsService(userId);
    res.status(200).json({ success: true, items });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Get user outfits only
 */
export const getUserOutfitsController = async (req, res) => {
  try {
    const { userId } = req.params;

    const outfits = await getUserOutfitsService(userId);
    res.status(200).json({ success: true, outfits });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Get user lookbooks only
 */
export const getUserLookbooksController = async (req, res) => {
  try {
    const { userId } = req.params;

    const lookbooks = await getUserLookbooksService(userId);
    res.status(200).json({ success: true, lookbooks });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /plan/:userId
 * Returns the user's active subscription plan (latest record, sorted by createdAt desc)
 * plus their current generation credits (aiStylist & VTO usage/limits).
 */
export const getUserPlanController = async (req, res) => {
  try {
    const { userId } = req.params;

    // Latest subscription record for this user (android or ios)
    const subscription = await Subscription.findOne({ userId })
      .sort({ createdAt: -1 })
      .select(
        "platform productId basePlanId status startDate expiryDate " +
        "expiryTimeMillis autoRenewing packageName lastVerifiedAt createdAt"
      )
      .lean();

    // Credits block from User doc
    const user = await User.findById(userId)
      .select("credits")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription: subscription || null,   // null if user has never subscribed
        credits: user.credits ?? {
          aiStylist: { used: 0, limit: 3 },
          vto:       { used: 0, limit: 3 },
          resetAt:   null,
        },
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
