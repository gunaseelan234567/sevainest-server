/**
 * eSevai Connect — Database Seed Script
 * Run: node seed.js
 * Clears existing users & services, then inserts fresh seed data.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Service = require('./models/Service');

dotenv.config();

const seedUsers = [
  {
    name: 'Super Admin',
    email: 'admin@esevai.com',
    password: 'Admin@123',
    role: 'admin',
    walletBalance: 50000,
    phone: '9999999999',
    shopAddress: 'Sevainest HQ, Chennai',
    isActivated: true,
    status: 'active',
    isEmailVerified: true,
    isPaid: true,
    paymentStatus: 'paid'
  },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────
const seed = async () => {
  // Production protection safeguard
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('❌ FATAL ERROR: Database seeding is BLOCKED in production mode to prevent accidental data deletion! Use --force to override.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Service.deleteMany({});
    console.log('🗑️  Cleared existing users and services');

    // Hash passwords manually (bypasses pre-save hook for bulk inserts)
    const hashedUsers = await Promise.all(
      seedUsers.map(async (u) => ({
        ...u,
        password: await bcrypt.hash(u.password, 10),
      }))
    );

    const insertedUsers = await User.insertMany(hashedUsers);
    console.log(`👤 Inserted ${insertedUsers.length} users:`);
    insertedUsers.forEach((u) =>
      console.log(`   • [${u.role.toUpperCase()}] ${u.name} — ${u.email}`)
    );

    console.log('\n🎉 Seed complete!\n');
    console.log('─────────────────────────────────────────');
    console.log('Test Credentials:');
    console.log('  Admin  → admin@esevai.com   / Admin@123');
    console.log('─────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
