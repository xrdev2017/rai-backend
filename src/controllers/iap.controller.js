import { verifyIosSubscription } from "../services/iap.ios.service.js";
import { verifyAndroidSubscription } from "../services/iap.android.service.js";
import Subscription from "../models/Subscription.js";
import SubscriptionHistory from "../models/SubscriptionHistory.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: upsert subscription record in MongoDB
// ─────────────────────────────────────────────────────────────────────────────
async function upsertSubscription(filter, data) {
  try {
    return await Subscription.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true }
      // { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Non-fatal – log but don't block the response
    console.error("[IAP] Failed to upsert subscription record:", err.message);
    return null;
  }
}

async function appendSubscriptionHistory(data) {
  try {
    await SubscriptionHistory.create(data);
  } catch (err) {
    // Non-fatal – never block verify/webhook/restore responses
    console.error("[IAP] Failed to append subscription history:", err.message);
  }
}

const TIER_CREDITS = {
  // Monthly plans
  rai_basic: { aiStylist: 30, vto: 0 },
  rai_pro: { aiStylist: 60, vto: 30 },
  // Yearly plans (same generation limits as monthly)
  rai_basic_yearly: { aiStylist: 30, vto: 0 },
  rai_pro_yearly: { aiStylist: 60, vto: 30 },
};

/** Free-tier defaults applied when a subscription is not active. */
const FREE_TIER_CREDITS = { aiStylist: 3, vto: 3 };

async function applyCreditsForTier(userId, productId, status) {
  if (!userId) return;

  try {
    let aiStylistLimit, vtoLimit;

    if (status === "active") {
      const tier = TIER_CREDITS[productId];
      if (!tier) {
        console.warn(`[IAP] Unknown productId "${productId}", skipping credit update.`);
        return;
      }
      aiStylistLimit = tier.aiStylist;
      vtoLimit = tier.vto;
    } else {
      aiStylistLimit = FREE_TIER_CREDITS.aiStylist;
      vtoLimit = FREE_TIER_CREDITS.vto;
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        "credits.aiStylist.limit": aiStylistLimit,
        "credits.aiStylist.used": 0,
        "credits.vto.limit": vtoLimit,
        "credits.vto.used": 0,
        "credits.resetAt": new Date(),
      },
    });

    console.log(
      `[IAP] Credits updated → user=${userId} product=${productId} status=${status} ` +
      `aiStylist=${aiStylistLimit} vto=${vtoLimit}`
    );
  } catch (err) {
    // Non-fatal – log but don't block the IAP response
    console.error("[IAP] Failed to apply credits for tier:", err.message);
  }
}

const IOS_TIER_CREDITS = {
  rai_basic_month: { aiStylist: 30, vto: 0 },
  rai_basic_yearly: { aiStylist: 30, vto: 0 },
  rai_pro_month: { aiStylist: 60, vto: 30 },
  rai_pro_yearly: { aiStylist: 60, vto: 30 },
};

async function applyCreditsForTierIos(userId, productId, status) {
  if (!userId) return;

  try {
    let aiStylistLimit, vtoLimit;

    if (status === "active") {
      const tier = IOS_TIER_CREDITS[productId];
      if (!tier) {
        // Unknown product – don't alter credits
        console.warn(`[IAP iOS] Unknown productId "${productId}", skipping credit update.`);
        return;
      }
      aiStylistLimit = tier.aiStylist;
      vtoLimit = tier.vto;
    } else {
      // Subscription lapsed – revert to free tier
      aiStylistLimit = FREE_TIER_CREDITS.aiStylist;
      vtoLimit = FREE_TIER_CREDITS.vto;
    }

    await User.findByIdAndUpdate(userId, {
      $set: {
        "credits.aiStylist.limit": aiStylistLimit,
        "credits.aiStylist.used": 0,
        "credits.vto.limit": vtoLimit,
        "credits.vto.used": 0,
        "credits.resetAt": new Date(),
      },
    });

    console.log(
      `[IAP iOS] Credits updated → user=${userId} product=${productId} status=${status} ` +
      `aiStylist=${aiStylistLimit} vto=${vtoLimit}`
    );
  } catch (err) {
    // Non-fatal – log but don't block the IAP response
    console.error("[IAP iOS] Failed to apply credits for tier:", err.message);
  }
}

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function isStale(lastVerifiedAt) {
  if (!lastVerifiedAt) return true;
  return Date.now() - new Date(lastVerifiedAt).getTime() > STALE_THRESHOLD_MS;
}

//----------------------------------------------------------
//Android IAP
//----------------------------------------------------------

export async function verifyAndroid(req, res) {
  try {
    const { purchaseToken, productId, packageName } = req.body;
    const userId = req.headers.user_id;

    console.log("verifyAndroid: >>>>>", { purchaseToken, productId, packageName, userId });

    const result = await verifyAndroidSubscription(
      packageName,
      productId,
      purchaseToken
    );

    const existingSub = await Subscription.findOne({
      platform: "android",
      userId: userId,
    });

    const subscriptionData = {
      platform: "android",
      purchaseToken: purchaseToken,
      linkedPurchaseToken: result.linkedPurchaseToken || existingSub?.linkedPurchaseToken || null,
      orderId: result.latestOrderId,
      productId: result.productId,
      basePlanId: result.basePlanId,
      packageName,

      status: result.status,
      startDate: result.startDate,
      expiryDate: result.expiryDate,
      expiryTimeMillis: result.expiryTimeMillis,
      autoRenewing: result.autoRenewing,

      rawResponse: result.raw,
      lastVerifiedAt: new Date()
    };

    let updatedSub;

    if (existingSub) {
      updatedSub = await Subscription.findByIdAndUpdate(
        existingSub._id,
        { $set: subscriptionData },
        { new: true }
      );
    } else {
      subscriptionData.userId = userId;
      updatedSub = await Subscription.create(subscriptionData);
    }

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || userId || undefined,
      subscriptionId: updatedSub?._id,
      platform: "android",
      eventType: "verify_android",
      eventSource: "verify",
      statusReason: "verify_endpoint",
      status: result.status,
      productId: result.productId,
      basePlanId: result.basePlanId,
      packageName,
      autoRenewing: result.autoRenewing,
      orderId: result.latestOrderId,
      purchaseToken,
      linkedPurchaseToken: result.linkedPurchaseToken || null,
      startDate: result.startDate,
      expiryDate: result.expiryDate,
      expiryTimeMillis: result.expiryTimeMillis,
      occurredAt: new Date(),
      providerReferenceId: result.linkedPurchaseToken || purchaseToken,
      rawRequest: {
        purchaseToken,
        productId,
        packageName,
        userId,
      },
      rawResponse: result.raw,
    });

    await applyCreditsForTier(
      userId,
      result.productId,
      result.status
    );

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error("verifyAndroid error: >>>>>", err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

export async function googleWebhook(req, res) {
  try {

    console.log(
      `\x1b[36m[IAP][googleWebhook][IN]\x1b[0m \x1b[90m${new Date().toISOString()}\x1b[0m`
    );
    const messageData = req.body?.message?.data;

    if (!messageData) {
      return res.status(200).json({ success: true });
    }

    let notification;

    try {
      const decoded = Buffer.from(messageData, "base64").toString("utf8");
      notification = JSON.parse(decoded);
    } catch {
      return res.status(200).json({ success: true });
    }

    if (notification.testNotification) {
      return res.status(200).json({
        success: true,
        message: "test ok"
      });
    }

    const subNotification = notification.subscriptionNotification;

    if (!subNotification) {
      return res.status(200).json({ success: true });
    }

    const {
      purchaseToken,
      subscriptionId,
      notificationType
    } = subNotification;

    console.log("subNotification: >>>>>", subNotification);

    let googleData;

    try {
      googleData = await verifyAndroidSubscription(
        notification.packageName,
        subscriptionId,
        purchaseToken
      );
    } catch (err) {

      /*
      Token may be expired/deleted
      */
      console.log("verification failed from webhook", err.message);

      googleData = null;
    }


    /*
    Find existing subscription
    */
    let existingSub = await Subscription.findOne({
      $or: [
        { purchaseToken },
        { linkedPurchaseToken: purchaseToken }
      ]
    });

    // Unknown token case
    if (!existingSub && !googleData) {
      console.log("Unknown token webhook ignored");

      await appendSubscriptionHistory({
        platform: "android",
        eventType: "google_webhook",
        eventSource: "webhook",
        notificationType: String(notificationType),
        statusReason: "unknown_token",
        status: "unknown",
        productId: subscriptionId,
        packageName: notification.packageName,
        purchaseToken,
        occurredAt: new Date(),
        providerReferenceId: purchaseToken,
        rawRequest: req.body,
        rawResponse: notification,
      });

      return res.status(200).json({
        success: true
      });
    }

    let finalStatus = "unknown";

    console.log("googleData: >>>>>", googleData);

    if (googleData) {
      const nowMs = Date.now();
      const expiryMs = Number(googleData.expiryTimeMillis);
      const isExpired = Number.isFinite(expiryMs) ? expiryMs < nowMs : false;

      // Play cancel means subscription remains valid until expiry.
      if (isExpired) {
        finalStatus = "expired";
      } else if (
        googleData.status === "cancelled" ||
        notificationType === 3 ||
        googleData.autoRenewing === false
      ) {
        finalStatus = "will_expire";
      } else {
        finalStatus = "active";
      }
    } else {
      // const expiredTypes = [3, 12, 13];
      // finalStatus = expiredTypes.includes(notificationType)
      //   ? "expired"
      //   : "unknown";

      switch (notificationType) {
        case 2: // RENEWED
          finalStatus = "active";
          break;
      
        case 3: // CANCELED
          finalStatus = "will_expire"; // or "CANCELED"
          break;
      
        case 12: // EXPIRED
        case 13: // REVOKED
          finalStatus = "expired";
          break;
      
        default:
          finalStatus = googleData?.status || "unknown";
      }
    }

    console.log("finalStatus===========================: >>>>>", finalStatus);
    /*
    Upsert Subscription
    */
    const resolvedPurchaseToken = existingSub?.purchaseToken || purchaseToken;

    const updatedSub = await upsertSubscription(
      {
        purchaseToken: resolvedPurchaseToken,
        platform: "android",
        userId: existingSub?.userId
      },
      {
        platform: "android",

        purchaseToken: resolvedPurchaseToken,

        linkedPurchaseToken:
          googleData?.linkedPurchaseToken ||
          existingSub?.linkedPurchaseToken,

        productId:
          googleData?.productId || subscriptionId,

        basePlanId:
          googleData?.basePlanId,

        packageName:
          notification.packageName,

        status: finalStatus,

        startDate:
          googleData?.startDate,

        expiryDate:
          googleData?.expiryDate,

        expiryTimeMillis:
          googleData?.expiryTimeMillis,

        autoRenewing:
          googleData?.autoRenewing,

        orderId:
          googleData?.latestOrderId,

        lastWebhookEvent: String(notificationType),

        lastVerifiedAt: new Date(),

        rawResponse:
          googleData?.raw
      }
    );

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || existingSub?.userId,
      subscriptionId: updatedSub?._id,
      platform: "android",
      eventType: "google_webhook",
      eventSource: "webhook",
      notificationType: String(notificationType),
      statusReason: googleData ? "google_reverify" : "webhook_without_google_data",
      status: finalStatus,
      productId: googleData?.productId || subscriptionId,
      basePlanId: googleData?.basePlanId,
      packageName: notification.packageName,
      autoRenewing: googleData?.autoRenewing,
      orderId: googleData?.latestOrderId,
      purchaseToken: resolvedPurchaseToken,
      linkedPurchaseToken: googleData?.linkedPurchaseToken || existingSub?.linkedPurchaseToken,
      startDate: googleData?.startDate,
      expiryDate: googleData?.expiryDate,
      expiryTimeMillis: googleData?.expiryTimeMillis,
      occurredAt: new Date(),
      providerReferenceId: googleData?.linkedPurchaseToken || resolvedPurchaseToken,
      rawRequest: req.body,
      rawResponse: {
        notification,
        googleData: googleData?.raw || null,
      },
    });


    /*
    Update Credits/User State
    */
    if (updatedSub?.userId && updatedSub.status !== "will_expire") {
      await applyCreditsForTier(
        updatedSub.userId,
        updatedSub.productId,
        updatedSub.status
      );
    }


    return res.status(200).json({
      success: true,
      message: "processed"
    });

  } catch (err) {

    console.error("[GOOGLE WEBHOOK ERROR]", err);

    return res.status(200).json({
      success: true
    });
  }
}

export async function restoreAndroid(req, res) {
  const { purchaseToken, productId, packageName } = req.body;
  const userId = req.headers.user_id || null;

  try {
    // ── 1. Check DB ───────────────────────────────────────────────────────────
    let record = await Subscription.findOne({ purchaseToken, platform: "android" });

    if (record && !isStale(record.lastVerifiedAt)) {
      // Cache hit — re-link to the current user if needed
      if (userId && String(record.userId) !== String(userId)) {
        record.userId = userId;
        await record.save();
      }

      await appendSubscriptionHistory({
        userId: record.userId,
        subscriptionId: record._id,
        platform: "android",
        eventType: "restore_android",
        eventSource: "restore",
        statusReason: "restore_cache_hit",
        status: record.status,
        productId: record.productId,
        basePlanId: record.basePlanId,
        packageName: record.packageName,
        autoRenewing: record.autoRenewing,
        orderId: record.orderId,
        purchaseToken: record.purchaseToken,
        linkedPurchaseToken: record.linkedPurchaseToken,
        startDate: record.startDate,
        expiryDate: record.expiryDate,
        expiryTimeMillis: record.expiryTimeMillis,
        occurredAt: new Date(),
        providerReferenceId: record.linkedPurchaseToken || record.purchaseToken,
        rawRequest: req.body,
        rawResponse: {
          source: "cache",
          subscriptionId: record._id,
        },
      });

      return res.status(200).json({
        success: true,
        platform: "android",
        restored: true,
        source: "cache",
        data: {
          status: record.status,
          expiryTimeMillis: record.expiryTimeMillis,
          autoRenewing: record.autoRenewing,
        },
      });
    }

    // ── 2. Re-verify with Google Play ─────────────────────────────────────────
    const result = await verifyAndroidSubscription(packageName, productId, purchaseToken);

    const updatedSub = await upsertSubscription(
      { purchaseToken, platform: "android", userId: userId },
      {
        platform: "android",
        purchaseToken,
        linkedPurchaseToken: result.linkedPurchaseToken || null,
        orderId: result.latestOrderId,
        productId: result.productId,
        basePlanId: result.basePlanId,
        packageName,
        status: result.status,
        startDate: result.startDate,
        expiryDate: result.expiryDate,
        expiryTimeMillis: result.expiryTimeMillis,
        autoRenewing: result.autoRenewing,
        rawResponse: result.raw,
        lastVerifiedAt: new Date(),
      }
    );

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || userId || undefined,
      subscriptionId: updatedSub?._id,
      platform: "android",
      eventType: "restore_android",
      eventSource: "restore",
      statusReason: "restore_reverify",
      status: result.status,
      productId: result.productId,
      basePlanId: result.basePlanId,
      packageName,
      autoRenewing: result.autoRenewing,
      orderId: result.latestOrderId,
      purchaseToken,
      linkedPurchaseToken: result.linkedPurchaseToken || null,
      startDate: result.startDate,
      expiryDate: result.expiryDate,
      expiryTimeMillis: result.expiryTimeMillis,
      occurredAt: new Date(),
      providerReferenceId: result.linkedPurchaseToken || purchaseToken,
      rawRequest: req.body,
      rawResponse: result.raw,
    });

    return res.status(200).json({
      success: true,
      platform: "android",
      restored: true,
      source: "google",
      data: {
        status: result.status,
        expiryTimeMillis: result.expiryTimeMillis,
        autoRenewing: result.autoRenewing,
      },
    });
  } catch (err) {
    console.error("[IAP Android Restore] Error:", err.message);
    const statusCode = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(err.googleError && { googleError: err.googleError }),
    });
  }
}


//----------------------------------------------------------
//iOS IAP
//----------------------------------------------------------

export async function verifyIos(req, res) {
  const { transactionId } = req.body;

  try {
    // result = decoded Apple transaction object (jwt.decode of signedTransactionInfo)
    const result = await verifyIosSubscription(transactionId);

    const requestedUserId = req.headers.user_id || null;

    const originalTransactionId = result.originalTransactionId || result.transactionId;

    const existingSub = await Subscription.findOne({
      platform: "ios",
      userId: requestedUserId,
    });

    const resolvedUserId = requestedUserId || existingSub?.userId || undefined;

    // Derive status: active if expiresDate is in the future, else expired
    const now = Date.now();
    const expiresDate = result.expiresDate ?? null; // milliseconds epoch from Apple
    const status = expiresDate !== null && expiresDate > now ? "active" : "expired";

    // Map Apple transaction fields → Subscription schema
    const subscriptionData = {
      platform: "ios",
      transactionId: result.transactionId,
      originalTransactionId,
      productId: result.productId,
      orderId: originalTransactionId,   // closest iOS equivalent to an orderId
      packageName: result.bundleId,
      status,
      startDate: result.purchaseDate ? new Date(result.purchaseDate) : undefined,
      expiryDate: result.expiresDate ? new Date(result.expiresDate) : undefined,
      autoRenewing: result.type === "Auto-Renewable Subscription",
      lastVerifiedAt: new Date(),
      rawResponse: result,
    };

    let updatedSub;

    if (existingSub) {
      updatedSub = await Subscription.findByIdAndUpdate(
        existingSub._id,
        { $set: subscriptionData },
        { new: true }
      );
    } else {
      updatedSub = await Subscription.create(subscriptionData);
    }

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || resolvedUserId,
      subscriptionId: updatedSub?._id,
      platform: "ios",
      eventType: "verify_ios",
      eventSource: "verify",
      statusReason: "verify_endpoint",
      status,
      productId: result.productId,
      packageName: result.bundleId,
      environment: result.environment,
      autoRenewing: result.type === "Auto-Renewable Subscription",
      orderId: originalTransactionId,
      transactionId: result.transactionId,
      originalTransactionId,
      startDate: result.purchaseDate ? new Date(result.purchaseDate) : undefined,
      expiryDate: result.expiresDate ? new Date(result.expiresDate) : undefined,
      occurredAt: new Date(),
      providerReferenceId: originalTransactionId,
      rawRequest: {
        transactionId,
        userId: requestedUserId,
      },
      rawResponse: result,
    });

    await applyCreditsForTierIos(
      updatedSub?.userId || resolvedUserId,
      result.productId,
      status
    );

    return res.status(200).json({
      success: true,
      platform: "ios",
      data: {
        userId: resolvedUserId || null,
        transactionId: result.transactionId,
        productId: result.productId,
        status,
        expiryDate: result.expiresDate ? new Date(result.expiresDate).toISOString() : null,
        startDate: result.purchaseDate ? new Date(result.purchaseDate).toISOString() : null,
        autoRenewing: result.type === "Auto-Renewable Subscription",
        environment: result.environment,
        raw: result,
      },
    });
  } catch (err) {
    console.error("[IAP iOS] Verification error:", err.message);
    const statusCode = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(err.appleError && { appleError: err.appleError }),
    });
  }
}

export async function appleWebhook(req, res) {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload || typeof signedPayload !== "string") {
      return res.status(400).json({ success: false, message: "Missing or invalid signedPayload" });
    }

    let notificationPayload;
    try {
      notificationPayload = jwt.decode(signedPayload, { complete: true });
    } catch {
      return res.status(400).json({ success: false, message: "Failed to decode signedPayload JWT" });
    }

    if (!notificationPayload?.payload) {
      return res.status(400).json({ success: false, message: "Invalid signedPayload" });
    }

    const { notificationType, subtype, data } = notificationPayload.payload;

    const transactionInfo = data?.signedTransactionInfo
      ? jwt.decode(data.signedTransactionInfo)
      : null;

    const renewalInfo = data?.signedRenewalInfo
      ? jwt.decode(data.signedRenewalInfo)
      : null;

    const originalTransactionId =
      transactionInfo?.originalTransactionId ||
      renewalInfo?.originalTransactionId ||
      transactionInfo?.transactionId ||
      null;

    if (!originalTransactionId) {
      await appendSubscriptionHistory({
        platform: "ios",
        eventType: "apple_webhook",
        eventSource: "webhook",
        notificationType,
        notificationSubtype: subtype,
        statusReason: "missing_original_transaction_id",
        status: "unknown",
        occurredAt: new Date(),
        rawRequest: req.body,
        rawResponse: notificationPayload.payload,
      });

      return res.status(200).json({ success: true, message: "Apple webhook received (no transaction chain)" });
    }

    const isActive =
      notificationType === "SUBSCRIBED" ||
      notificationType === "DID_RENEW" ||
      notificationType === "DID_CHANGE_RENEWAL_STATUS";

    const status = isActive ? "active" : "expired";

    const existingSub = await Subscription.findOne({
      platform: "ios",
      $or: [
        { originalTransactionId },
        { transactionId: originalTransactionId },
      ],
    });

    const userId = existingSub?.userId || undefined;

    const transactionId = transactionInfo?.transactionId || existingSub?.transactionId || originalTransactionId;
    const productId =
      transactionInfo?.productId ||
      renewalInfo?.productId ||
      renewalInfo?.autoRenewProductId ||
      existingSub?.productId;

    const packageName = transactionInfo?.bundleId || existingSub?.packageName;

    const startDate = transactionInfo?.purchaseDate
      ? new Date(transactionInfo.purchaseDate)
      : existingSub?.startDate;

    const expiryDate = transactionInfo?.expiresDate
      ? new Date(transactionInfo.expiresDate)
      : renewalInfo?.renewalDate
        ? new Date(renewalInfo.renewalDate)
        : existingSub?.expiryDate;

    const autoRenewing = renewalInfo?.autoRenewStatus !== undefined
      ? renewalInfo.autoRenewStatus === 1
      : transactionInfo?.type === "Auto-Renewable Subscription"
        ? true
        : existingSub?.autoRenewing;

    const filter = existingSub
      ? { _id: existingSub._id }
      : {
        platform: "ios",
        originalTransactionId,
      };

    const updatedSub = await upsertSubscription(
      filter,
      {
        platform: "ios",
        transactionId,
        originalTransactionId,
        productId,
        orderId: originalTransactionId,
        packageName,
        status,
        startDate,
        expiryDate,
        autoRenewing,
        lastWebhookEvent: notificationType + (subtype ? `_${subtype}` : ""),
        lastVerifiedAt: new Date(),
        rawResponse: {
          notification: notificationPayload.payload,
          transactionInfo,
          renewalInfo,
        },
      }
    );

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || userId,
      subscriptionId: updatedSub?._id,
      platform: "ios",
      eventType: "apple_webhook",
      eventSource: "webhook",
      notificationType,
      notificationSubtype: subtype,
      statusReason: "apple_notification",
      status,
      productId,
      packageName,
      environment: transactionInfo?.environment || renewalInfo?.environment,
      autoRenewing,
      orderId: originalTransactionId,
      transactionId,
      originalTransactionId,
      startDate,
      expiryDate,
      occurredAt: new Date(),
      providerReferenceId: originalTransactionId,
      rawRequest: req.body,
      rawResponse: {
        notification: notificationPayload.payload,
        transactionInfo,
        renewalInfo,
      },
    });

    await applyCreditsForTierIos(
      updatedSub?.userId || userId,
      productId,
      status
    );

    return res.status(200).json({ success: true, message: "Apple webhook received" });
  } catch (err) {
    console.error("[IAP Apple Webhook] Error:", err.message);
    return res.status(200).json({ success: true, message: "Acknowledged" });
  }
}

export async function restoreIos(req, res) {
  const { transactionId } = req.body;
  const userId = req.headers.user_id || null;

  try {
    // ── 1. Check DB ───────────────────────────────────────────────────────────
    let record = await Subscription.findOne({ transactionId, platform: "ios" });

    if (record && !isStale(record.lastVerifiedAt)) {
      // // Cache hit — re-link to the current user if needed
      // if (userId && String(record.userId) !== String(userId)) {
      //   record.userId = userId;
      //   await record.save();
      // }

      await appendSubscriptionHistory({
        userId: record.userId,
        subscriptionId: record._id,
        platform: "ios",
        eventType: "restore_ios",
        eventSource: "restore",
        statusReason: "restore_cache_hit",
        status: record.status,
        productId: record.productId,
        packageName: record.packageName,
        autoRenewing: record.autoRenewing,
        orderId: record.orderId,
        transactionId: record.transactionId,
        originalTransactionId: record.originalTransactionId,
        startDate: record.startDate,
        expiryDate: record.expiryDate,
        occurredAt: new Date(),
        providerReferenceId: record.originalTransactionId || record.transactionId,
        rawRequest: req.body,
        rawResponse: {
          source: "cache",
          subscriptionId: record._id,
        },
      });

      return res.status(200).json({
        success: true,
        platform: "ios",
        restored: true,
        source: "cache",
        data: {
          status: record.status,
          expiryDate: record.expiryDate?.toISOString() ?? null,
          productId: record.productId,
        },
      });
    }

    // ── 2. Re-verify with Apple ───────────────────────────────────────────────
    const result = await verifyIosSubscription(transactionId);

    const now = Date.now();
    const expiresDate = result.expiresDate ?? null;
    const status = expiresDate !== null && expiresDate > now ? "active" : "expired";

    const originalTransactionId = result.originalTransactionId || result.transactionId;

    const existingSub = await Subscription.findOne({
      platform: "ios",
      $or: [
        { originalTransactionId },
        { transactionId: originalTransactionId },
      ],
    });

    const resolvedUserId = userId || existingSub?.userId || undefined;

    const updateFilter = existingSub
      ? { _id: existingSub._id }
      : {
        platform: "ios",
        originalTransactionId,
        userId: resolvedUserId
      };

    const updatedSub = await upsertSubscription(
      updateFilter,
      {
        platform: "ios",
        transactionId: result.transactionId,
        originalTransactionId,
        productId: result.productId,
        orderId: originalTransactionId,
        packageName: result.bundleId,
        status,
        startDate: result.purchaseDate ? new Date(result.purchaseDate) : undefined,
        expiryDate: result.expiresDate ? new Date(result.expiresDate) : undefined,
        autoRenewing: result.type === "Auto-Renewable Subscription",
        rawResponse: result,
        lastVerifiedAt: new Date(),
      }
    );

    await appendSubscriptionHistory({
      userId: updatedSub?.userId || resolvedUserId,
      subscriptionId: updatedSub?._id,
      platform: "ios",
      eventType: "restore_ios",
      eventSource: "restore",
      statusReason: "restore_reverify",
      status,
      productId: result.productId,
      packageName: result.bundleId,
      environment: result.environment,
      autoRenewing: result.type === "Auto-Renewable Subscription",
      orderId: originalTransactionId,
      transactionId: result.transactionId,
      originalTransactionId,
      startDate: result.purchaseDate ? new Date(result.purchaseDate) : undefined,
      expiryDate: result.expiresDate ? new Date(result.expiresDate) : undefined,
      occurredAt: new Date(),
      providerReferenceId: originalTransactionId,
      rawRequest: req.body,
      rawResponse: result,
    });

    return res.status(200).json({
      success: true,
      platform: "ios",
      restored: true,
      source: "apple",
      data: {
        userId: resolvedUserId || null,
        transactionId: result.transactionId,
        productId: result.productId,
        status,
        expiryDate: result.expiresDate ? new Date(result.expiresDate).toISOString() : null,
        startDate: result.purchaseDate ? new Date(result.purchaseDate).toISOString() : null,
        autoRenewing: result.type === "Auto-Renewable Subscription",
        environment: result.environment,
      },
    });
  } catch (err) {
    console.error("[IAP iOS Restore] Error:", err.message);
    const statusCode = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(err.appleError && { appleError: err.appleError }),
    });
  }
}
