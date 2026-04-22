import express from "express";
import * as outfitController from "../controllers/Outfit.controller.js";
import { authCheck } from "../middlewares/auth.middleware.js";
import { checkCredit } from "../middlewares/credits.middleware.js";
import { SingleuploadMiddleware, uploadMiddleware } from "../middlewares/awsUpload.middleware.js";
const OutfitRoutes = express.Router();

OutfitRoutes.post(
  "/getOutfit",
  authCheck,
  checkCredit("aiStylist"),
  outfitController.getOutfitController
);

OutfitRoutes.get(
  "/getAiGeneratedOutfit",
  authCheck,
  outfitController.getAiGeneratedOutfitController
);

OutfitRoutes.patch(
  "/updateOutfitFavorite/:id",
  authCheck,
  outfitController.updateOutfitFavoriteStatusController
);


OutfitRoutes.post(
  "/createOutfit",
  authCheck, SingleuploadMiddleware,
  outfitController.createOutfitController
);
OutfitRoutes.put(
  "/updateOutfit/:id",
  authCheck,
  SingleuploadMiddleware,
  outfitController.updateOutfitController
);
OutfitRoutes.delete(
  "/deleteOutfit/:id",
  authCheck,
  outfitController.deleteOutfitController
);
OutfitRoutes.get(
  "/showOutfits",
  authCheck,
  outfitController.getUserOutfitsController
);
OutfitRoutes.get(
  "/DetailsOutfit/:id",
  authCheck,
  outfitController.getOutfitByIdController
);

export default OutfitRoutes;
