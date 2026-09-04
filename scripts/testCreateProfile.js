const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const CardProcessingProfile = require('../models/CardProcessingProfile');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function test() {
  console.log('Connecting...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');
  
  try {
    console.log('Creating profile...');
    const profile = await CardProcessingProfile.create({
      name: 'Draft Card Profile',
      code: 'draft-' + Date.now(),
      description: 'Staged profile config',
      crop: { x: 0, y: 0, width: 1, height: 1 },
      output: { width: 85.6, height: 54, unit: 'mm', dpi: 300 },
      createdBy: new mongoose.Types.ObjectId() // Mock user ID
    });
    console.log('Created!', profile);
  } catch (err) {
    console.error('Error!', err);
  } finally {
    await mongoose.connection.close();
  }
}
test();
