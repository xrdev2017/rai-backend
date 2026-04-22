import { Router } from "express";
import {
  verifyIos,
  verifyAndroid,
  appleWebhook,
  googleWebhook,
  restoreIos,
  restoreAndroid,
} from "../controllers/iap.controller.js";
import {
  validateIosBody,
  validateAndroidBody,
} from "../middlewares/iap.validation.middleware.js";
import { authCheck } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * @route  POST /verify/ios
 * @desc   Verify an iOS subscription via Apple App Store Server API
 * @access Private (requires auth token)
 * @body   { transactionId: string }
 */
router.post("/ios", authCheck, validateIosBody, verifyIos);

/**
 * @route  POST /verify/android
 * @desc   Verify an Android subscription via Google Play Developer API
 * @access Private (requires auth token)
 * @body   { purchaseToken: string, productId: string, packageName: string }
 */
router.post("/android", authCheck, validateAndroidBody, verifyAndroid);

/**
 * @route  POST /verify/webhook/apple
 * @desc   Apple App Store Server Notifications v2 webhook receiver
 * @access Public (called by Apple servers — no auth middleware)
 * @body   { signedPayload: string }
 */
router.post("/webhook/apple", appleWebhook);

/**
 * @route  POST /verify/webhook/google
 * @desc   Google Real-Time Developer Notifications (Pub/Sub) webhook receiver
 * @access Public (called by Google — no auth middleware)
 * @body   { message: { data: string (base64) } }
 */
router.post("/webhook/google", googleWebhook);

/**
 * @route  POST /verify/restore/ios
 * @desc   Restore an iOS subscription (reinstall / new device / account switch).
 *         Checks DB first; re-verifies with Apple if data is stale (>1 hour).
 *         Re-links the subscription record to the currently authenticated user.
 * @access Private (requires auth token)
 * @body   { transactionId: string }
 */
router.post("/restore/ios", authCheck, validateIosBody, restoreIos);

/**
 * @route  POST /verify/restore/android
 * @desc   Restore an Android subscription (reinstall / new device / account switch).
 *         Checks DB first; re-verifies with Google Play if data is stale (>1 hour).
 *         Re-links the subscription record to the currently authenticated user.
 * @access Private (requires auth token)
 * @body   { purchaseToken: string, productId: string, packageName: string }
 */
router.post("/restore/android", authCheck, validateAndroidBody, restoreAndroid);

export default router;

