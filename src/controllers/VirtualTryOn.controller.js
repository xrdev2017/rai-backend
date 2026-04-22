import { virtualTryOn } from "../services/VirtualTryOn.service.js";
import { consumeCredit } from "../middlewares/credits.middleware.js";

/**
 * POST /virtualTryOn/try
 * Body (multipart/form-data):
 *   - user_image   : image file (required)
 *   - outfit_image_url : string  (required)
 */
export const virtualTryOnController = async (req, res, next) => {
  try {
    const { outfit_image_url } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "user_image file is required" });
    }
    if (!outfit_image_url || outfit_image_url.trim().length === 0) {
      return res.status(400).json({ message: "outfit_image_url is required" });
    }

    const result = await virtualTryOn(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      outfit_image_url
    );

    if (result?.success) {
      await consumeCredit(req.headers.user_id, "vto");
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};
