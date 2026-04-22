import { google } from "googleapis";

/**
 * Builds an authenticated Google API client using the service account credentials
 * stored in the GOOGLE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * @returns {import('googleapis').androidpublisher_v3.Androidpublisher}
 */
function getAndroidPublisherClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable."
    );
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error(
      "Invalid GOOGLE_SERVICE_ACCOUNT_JSON: must be valid JSON."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  return google.androidpublisher({ version: "v3", auth });
}

/**
 * Maps Google Play subscriptionsv2 state to a unified status string.
 * Handles both the V2 shape (subscriptionState + lineItems) and the
 * legacy V1 shape (expiryTimeMillis + cancelReason) as a fallback.
 *
 * @param {object} purchase - response.data from subscriptionsv2.get
 * @returns {string} "active" | "expired" | "cancelled" | "unknown"
 */
function deriveAndroidStatus(purchase) {
  // ── V2 shape ──────────────────────────────────────────────────────────────
  if (purchase.subscriptionState) {
    switch (purchase.subscriptionState) {
      case "SUBSCRIPTION_STATE_ACTIVE":
        return "active";
      case "SUBSCRIPTION_STATE_CANCELED":
      case "SUBSCRIPTION_STATE_PAUSED":
        return "cancelled";
      case "SUBSCRIPTION_STATE_EXPIRED":
        return "expired";
      default:
        return "unknown";
    }
  }

  // ── V1 fallback ───────────────────────────────────────────────────────────
  if (purchase.cancelReason !== undefined && purchase.cancelReason !== null) {
    return "cancelled";
  }
  const expiry = Number(purchase.expiryTimeMillis);
  return expiry > Date.now() ? "active" : "expired";
}

/**
 * Verifies an Android subscription via the Google Play Developer API (subscriptionsv2).
 *
 * @param {string} packageName - e.g. "com.rai.fashion"
 * @param {string} productId   - subscription product ID (used for context only in v2)
 * @param {string} purchaseToken
 * @returns {Promise<{
 *   status: string,
 *   productId: string,
 *   basePlanId: string,
 *   startDate: Date,
 *   expiryDate: Date,
 *   expiryTimeMillis: string,
 *   autoRenewing: boolean,
 *   regionCode: string,
 *   latestOrderId: string,
 *   raw: object
 * }>}
 */
export async function verifyAndroidSubscription(
  packageName,
  productId,
  purchaseToken
) {
  const androidPublisher = getAndroidPublisherClient();

  let response;
  try {
    response = await androidPublisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });
  } catch (err) {
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      "Google Play API error";
    const statusCode = err?.response?.status || 500;
    const error = new Error(`Google Play API error: ${message}`);
    error.statusCode = statusCode;
    error.googleError = err?.response?.data;
    throw error;
  }

  const purchase = response.data;

  // ── Extract line item (V2 has an array; take the first/only entry) ─────────
  const lineItem = Array.isArray(purchase.lineItems) && purchase.lineItems.length > 0
    ? purchase.lineItems[0]
    : null;

  const resolvedProductId = lineItem?.productId || productId;
  const basePlanId = lineItem?.offerDetails?.basePlanId || null;

  // expiryTime is ISO-8601 in V2; expiryTimeMillis is the V1 field
  const expiryDate = lineItem?.expiryTime
    ? new Date(lineItem.expiryTime)
    : purchase.expiryTimeMillis
    ? new Date(Number(purchase.expiryTimeMillis))
    : null;

  const expiryTimeMillis = expiryDate ? String(expiryDate.getTime()) : null;

  const startDate = purchase.startTime ? new Date(purchase.startTime) : null;

  // autoRenewing: V2 exposes it inside lineItem.autoRenewingPlan
  const autoRenewing =
    lineItem?.autoRenewingPlan != null
      ? true // presence of autoRenewingPlan object means auto-renew is on
      : purchase.autoRenewing ?? false;

  return {
    status: deriveAndroidStatus(purchase),
    productId: resolvedProductId,
    basePlanId,
    startDate,
    expiryDate,
    expiryTimeMillis,
    autoRenewing,
    regionCode: purchase.regionCode || null,
    latestOrderId: purchase.latestOrderId || null,
    raw: purchase,
  };
}
