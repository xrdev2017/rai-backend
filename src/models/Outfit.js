import mongoose from "mongoose";
const { Schema } = mongoose;

const outfitSchema = new Schema(
  {
    title: { type: String, required: false },
    image: { type: String, },
    season: { type: [String], default: [] },
    style: { type: mongoose.Schema.Types.ObjectId, ref: "Style" },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    generateType: {
      type: String,
      enum: ["manual", "ai_generated"],
      default: "manual"
    },
    outfitId: { type: String },
    usage: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    favorite: { type: Boolean, default: false },
    count: { type: Number, default: 0 }
  },
  { timestamps: true }
);

outfitSchema.index({ user: 1, title: 1, image: 1 }, { unique: true });

export default mongoose.model("Outfit", outfitSchema);
