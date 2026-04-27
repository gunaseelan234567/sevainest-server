const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

dotenv.config();

const checkUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOne({ email: 'admin@esevai.com' }).select('+password');
    if (user) {
      console.log('User found:', user.email);
      const isMatch = await bcrypt.compare('Admin@123', user.password);
      console.log('Password "Admin@123" match:', isMatch);
    } else {
      console.log('User not found');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkUser();
