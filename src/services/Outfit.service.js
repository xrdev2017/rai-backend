import Community from "../models/Community.js";
import Outfit from "../models/Outfit.js";
import Style from "../models/Style.js";
import User from "../models/User.js";
import { createNotification } from "./Notification.service.js";
import axios from "axios";

// Create Outfit
export const createOutfit = async (userId, data) => {
  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  const { title, image, season, style } = data;

  // Find style IDs
  const styles = await Style.find({ name: { $in: style } }, "_id name"); // get both _id and name
  const styleIds = styles.map(s => s._id);

  // Check duplicate for same user
  const exists = await Outfit.findOne({ user: userId, title, image });
  if (exists) {
    throw new Error("Outfit with same title and image already exists for this user");
  }

  // Create outfit
  const outfit = new Outfit({ user: userId, title, image, season, style: styleIds });
  await Community.create({ post: outfit._id, user: userId });

  // Notify followers
  const user = await User.findById(userId).populate("followers", "_id");
  const followerIds = user.followers.map(f => f._id);

  for (const fid of followerIds) {
    await createNotification({
      userId: fid,
      postId: outfit._id
    });
  }

  // Save outfit and populate user info and style names
  const savedOutfit = await outfit.save();
  const populatedOutfit = await Outfit.findById(savedOutfit._id)
    .populate("user")           // full user info
    .populate("style", "name"); // populate style names only

  return populatedOutfit;
};



// Get all outfits of a user
export const getUserOutfits = async (userId) => {
  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");
  return await Outfit.find({ user: userId }).lean();
};

// Get single outfit details
export const getOutfitById = async (outfitId, userId) => {

  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  return await Outfit.findOne({ _id: outfitId, user: userId }).lean();
};

// Update Outfit
export const updateOutfit = async (outfitId, userId, data) => {

  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  const { title, image, style } = data;


  // Find style IDs
  const styles = await Style.find({ name: { $in: style } }, "_id name"); // get both _id and name
  const styleIds = styles.map(s => s._id);

  // Prevent duplicate check on update
  if (title && image) {
    const duplicate = await Outfit.findOne({
      _id: { $ne: outfitId },
      user: userId,
      title,

      style: styleIds,
      image,
    });
    if (duplicate) throw new Error("Outfit with same title and image already exists");
  }
  // Update the outfit and return the updated document
  const updatedOutfit = await Outfit.findOneAndUpdate(
    { _id: outfitId, user: userId },
    { $set: data },
    { new: true }
  )
    // Populate style (only return name) and user (return all info)
    .populate({
      path: 'style',
      select: 'name', // only style name
    })
    .populate('user'); // return full user document

  return updatedOutfit;
};


// Delete Outfit
export const deleteOutfit = async (outfitId, userId) => {
  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  return await Outfit.findOneAndDelete({ _id: outfitId, user: userId });
};

export const updateOutfitFavoriteStatus = async (outfitId, userId, favorite) => {
  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  return await Outfit.findOneAndUpdate(
    { _id: outfitId, user: userId },
    { $set: { favorite } },
    { new: true }
  );
};

export const getOutfit = async (query, userId) => {
  try {
    const payload = {
      query: query,
      user: userId
    };

    // Call the external python API
    const response = await axios.post(
      `${process.env.PYTHON_API_URL}/get_outfit`,
      payload,
      {
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("python response getOutfit : =========================================================\n", response.data);

    const responseData = response.data;

    if (responseData?.status && responseData?.image_url) {
      const outfitData = {
        user: userId,
        image: responseData.image_url,
        generateType: "ai_generated",
        outfitId: responseData?.outfit_id || null,
        title: responseData?.title || null,
        season: [responseData?.season] || null,
      };

      const addOutfit = await Outfit.insertOne(outfitData);
      responseData.outfit_id = addOutfit._id;
    }

    return responseData;
  } catch (error) {
    console.error("Error fetching outfit:", error.message);
    throw new Error("Failed to fetch outfit: " + error.message);
  }
};

export const getAiGeneratedOutfit = async (userId, page = 1, limit = 10, search) => {
  const user1 = await User.findById({ _id: userId });
  if (!user1) throw new Error("User not found");
  if (user1.disabled) throw new Error("Account has disabled");

  const pageNumber = Number.isNaN(Number(page)) ? 1 : Math.max(1, Number(page));
  const limitNumber = Number.isNaN(Number(limit)) ? 10 : Math.max(1, Number(limit));
  const skip = (pageNumber - 1) * limitNumber;

  const filter = { user: userId };
  if (search) {
    filter.title = { $regex: search, $options: "i" };
  }

  const [items, totalItems] = await Promise.all([
    Outfit.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    Outfit.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalItems / limitNumber) || 1;

  return {
    items,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      totalItems,
      totalPages,
    },
  };
};
