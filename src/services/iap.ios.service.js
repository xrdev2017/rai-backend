import axios from "axios";
import { generateAppleJWT } from "../utils/inAppPurchase.js";
import jwt from "jsonwebtoken";

/**
 * Verifies an iOS in-app purchase by transactionId using the Apple App Store Server API.
 * Uses /inApps/v1/transactions/{transactionId} — same endpoint Postman confirmed works.
 * Tries sandbox first; falls back to production if not found.
 *
 * @param {string} transactionId
 * @returns {Promise<{ status: string, expiryDate: string|null, productId: string|null, raw: object }>}
 */
export async function verifyIosSubscription(transactionId) {
  const jwtToken = generateAppleJWT();

  const tryVerify = async (baseUrl) => {
    const url = `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    console.log(`[Apple IAP] Trying: ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    console.log(`[Apple IAP] Status: ${response.status}`);
    return response;
  };

  try {

    const BASE_URL = process.env.ENV === "PROD" ? process.env.APPLE_PROD_URL : process.env.APPLE_SANDBOX_URL;

    let response = await tryVerify(BASE_URL);

    // If not found in sandbox, try production
    if (response.status === 404) {
      console.log("[Apple IAP] Not found in sandbox, trying production...");
      response = await tryVerify(APPLE_PROD_URL);
    }

    if (response.status !== 200) {
      const err = new Error(
        `Apple API error (${response.status}): ${response.data?.errorCode || ""} - ${response.data?.errorMessage || JSON.stringify(response.data)}`
      );
      err.statusCode = response.status;
      err.appleError = response.data;
      throw err;
    }

    // Apple returns { signedTransactionInfo: "<JWS>" }
    const { signedTransactionInfo } = response.data;
    if (!signedTransactionInfo) {
      throw new Error("Apple response missing signedTransactionInfo");
    }

    const data = jwt.decode(signedTransactionInfo);

    return data;
  } catch (error) {
    console.log("[Apple IAP] Error in verifyIosSubscription:", error.message ?? error);
    throw error;
  }
}
