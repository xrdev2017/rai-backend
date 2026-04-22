import express from "express";
import multer from "multer";
import { authCheck } from "../middlewares/auth.middleware.js";
import { checkCredit } from "../middlewares/credits.middleware.js";
import { virtualTryOnController } from "../controllers/VirtualTryOn.controller.js";

const VirtualTryOnRoutes = express.Router();

// Use memory storage so we can forward the buffer directly to the Python API
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * POST /virtualTryOn/try
 * Accepts multipart/form-data:
 *   - user_image       : image file (required)
 *   - outfit_image_url : string    (required)
 */
VirtualTryOnRoutes.post(
  "/try-on",
  authCheck,
  checkCredit("vto"),
  upload.single("user_image"),
  virtualTryOnController
);

export default VirtualTryOnRoutes;
