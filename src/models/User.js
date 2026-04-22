import { Schema, model } from "mongoose";
import bcrypt from "bcrypt";
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },

  name: { type: String },
  username: { type: String },
  phone: { type: String, unique: true, sparse: true },
  otp: { type: String },
  otpExpires: { type: Date },
  gender: { type: String },
  language: {
    type: String,
    enum: ["English", "Russian"],
    default: "English"
  },
  profileImage: { type: String, default: "" },
  dob: { type: String, default: "" },
  bio: { type: String, default: "" },
  location: { type: String, default: "" },
  followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: Schema.Types.ObjectId, ref: "User" }],
  blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  privacy: {
    profile: { type: String, enum: ["everyone", "only_me", "followers"], default: "everyone" },
    items: { type: String, enum: ["everyone", "only_me", "followers"], default: "everyone" },
    outfits: { type: String, enum: ["everyone", "only_me", "followers"], default: "everyone" },
    lookbooks: { type: String, enum: ["everyone", "only_me", "followers"], default: "everyone" }
  },
  // language: { type: String, default: "en" },

  notificationsEnabled: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  reports: [
    {
      reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
      message: { type: String, required: true },
      reportedAt: { type: Date, default: Date.now }
    }
  ],
  loginHistory: [
    {
      loginAt: { type: Date, required: true },
      logoutAt: { type: Date }
    }
  ],
  firstLogin: { type: Date },

  // ─── Generation Credits ──────────────────────────────────────────────────────
  // Tracks monthly usage limits for each AI feature.
  // Tiers:  Free → 3/3 | Basic → 30/0 (no VTO) | Pro → 60/30
  credits: {
    aiStylist: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: 3 },  // free tier default
    },
    vto: {
      used: { type: Number, default: 0 },
      limit: { type: Number, default: 3 },  // free tier default; 0 = feature blocked
    },
    // Timestamp of last monthly reset (set when a subscription is activated)
    resetAt: { type: Date },
  },
}, { timestamps: true });


export default model("User", userSchema);
