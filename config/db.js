const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Seed default instant service categories if none exist
    const InstantServiceCategory = require('../models/InstantServiceCategory');
    const count = await InstantServiceCategory.countDocuments();
    if (count === 0) {
      const defaultCategories = ['Aadhaar', 'PAN', 'Banking', 'GST', 'Verification', 'Other'];
      await InstantServiceCategory.insertMany(
        defaultCategories.map(name => ({ name }))
      );
      console.log('🌱 Seeded default instant service categories');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
