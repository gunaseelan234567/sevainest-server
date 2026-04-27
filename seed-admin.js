const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'admin@esevai.com' });

    if (adminExists) {
      console.log('ℹ️ Admin user already exists. Skipping...');
    } else {
      const hashedPassword = await bcrypt.hash('Admin@123', 10);
      
      const admin = await User.create({
        name: 'Super Admin',
        email: 'admin@esevai.com',
        password: 'Admin@123', // The model handles hashing if configured, but seed.js hashes manually.
        role: 'admin',
        walletBalance: 50000,
        status: 'active',
        isActivated: true
      });

      console.log('👤 Super Admin created successfully!');
      console.log('   Email: admin@esevai.com');
      console.log('   Pass: Admin@123');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding admin:', err.message);
    process.exit(1);
  }
};

seedAdmin();
