const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const CardProcessingProfile = require('../models/CardProcessingProfile');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function fixDeleted() {
  try {
    console.log('Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');
    
    // Find all soft-deleted profiles
    const deletedProfiles = await CardProcessingProfile.find({ isDeleted: true });
    console.log(`Found ${deletedProfiles.length} soft-deleted profiles in database.`);
    
    let updatedCount = 0;
    for (const profile of deletedProfiles) {
      if (!profile.code.includes('-deleted-')) {
        const oldCode = profile.code;
        profile.code = `${oldCode}-deleted-${Date.now()}`;
        await profile.save();
        console.log(`Renamed deleted profile code: '${oldCode}' -> '${profile.code}'`);
        updatedCount++;
      }
    }
    
    console.log(`Successfully cleaned up ${updatedCount} profiles.`);
  } catch (err) {
    console.error('Error running database cleanup:', err);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

fixDeleted();
