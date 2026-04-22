import { z } from "zod";

// ── iOS validation schema ─────────────────────────────────────────────────────
const iosSchema = z.object({
  transactionId: z
    .string({ required_error: "transactionId is required" })
    .min(1, "transactionId must not be empty"),
});

// ── Android validation schema ─────────────────────────────────────────────────
const androidSchema = z.object({
  purchaseToken: z
    .string({ required_error: "purchaseToken is required" })
    .min(1, "purchaseToken must not be empty"),
  productId: z
    .string({ required_error: "productId is required" })
    .min(1, "productId must not be empty"),
  packageName: z
    .string({ required_error: "packageName is required" })
    .min(1, "packageName must not be empty"),
});

/**
 * Formats Zod validation errors into a readable string.
 *
 * @param {import('zod').ZodError} zodError
 * @returns {string}
 */
function formatZodErrors(zodError) {
  return zodError.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
}

/**
 * Middleware to validate iOS verify request body.
 */
export function validateIosBody(req, res, next) {
  const result = iosSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formatZodErrors(result.error),
    });
  }
  req.body = result.data; // sanitized
  next();
}

/**
 * Middleware to validate Android verify request body.
 */
export function validateAndroidBody(req, res, next) {
  const result = androidSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: formatZodErrors(result.error),
    });
  }
  req.body = result.data; // sanitized
  next();
}
