const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const total = await User.countDocuments({});
  console.log('Total users in DB:', total);
  
  const roles = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);
  console.log('Roles breakdown:');
  roles.forEach(r => console.log(`- Role: ${r._id || 'undefined'}, Count: ${r.count}`));
  
  const sample = await User.find({}).limit(5);
  console.log('Sample user roles and names:');
  sample.forEach(s => console.log(`- ${s.name} (${s.email}): role=${s.role}, status=${s.status}`));

  process.exit(0);
}

run();
