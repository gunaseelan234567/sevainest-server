const { supabase } = require('../config/supabase');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Uploads a file buffer to Supabase Storage and returns the public URL.
 * 
 * @param {Object} file - The file object from multer (must use memoryStorage)
 * @param {String} folder - The destination folder within the 'uploads' bucket (e.g., 'services', 'applications')
 * @returns {Promise<String>} - The public URL of the uploaded file
 */
const uploadToSupabase = async (file, folder = 'others') => {
  if (!file) return null;

  try {
    // Generate a secure, unique filename to prevent overwrites
    const ext = path.extname(file.originalname);
    const fileName = `${folder}/${Date.now()}-${uuidv4()}${ext}`;
    
    // Upload the file binary (buffer) to Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads') // Ensure this bucket is set to 'Public' in Supabase dashboard
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false // We use UUIDs, so we shouldn't ever overwrite
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`File upload failed: ${error.message}`);
    }

    // Get the permanent public URL
    const { data: publicUrlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Upload helper error:', err);
    throw err;
  }
};

module.exports = { uploadToSupabase };
