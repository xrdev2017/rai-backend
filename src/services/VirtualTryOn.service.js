import axios from "axios";
import FormData from "form-data";

/**
 * Calls the Python virtual try-on API.
 * @param {Buffer} imageBuffer - The user image file buffer.
 * @param {string} imageMimetype - MIME type of the user image (e.g., "image/jpeg").
 * @param {string} imageOriginalname - Original filename of the user image.
 * @param {string} outfitImageUrl - The URL of the outfit image.
 * @returns {Promise<object>} - The response from the Python API.
 */
export const virtualTryOn = async (imageBuffer, imageMimetype, imageOriginalname, outfitImageUrl) => {
  try {
    const formData = new FormData();

    // Append the user's image as a binary file
    formData.append("user_image", imageBuffer, {
      filename: imageOriginalname,
      contentType: imageMimetype,
    });

    // Append the outfit image URL as a string field
    formData.append("outfit_image_url", outfitImageUrl);

    const response = await axios.post(
      `${process.env.PYTHON_API_URL}/virtual_tryon`,
      formData,
      {
        headers: {
          accept: "application/json",
          ...formData.getHeaders(),
        },
      }
    );

    // console.log("virtual try on response : ", response);

    if (response.data.status) {
      return {
        success: true,
        message: "Virtual try-on successful",
        data: {
          tryOnImage: response.data.image_url,
        }
      };
    } else {
      return {
        success: false,
        message: "Virtual try-on failed",
        data: response.data
      };
    }

  } catch (error) {
    console.error("Error calling virtual try-on API:", error.message);
    throw new Error("Virtual try-on failed: " + error.message);
  }
};
