const mongoose = require('mongoose');
const User = require('../models/User');

const ATLAS_URI = 'mongodb://sevainestofficial_db_user:tEyQ4BI4i10Xfq86@ac-wj3i77w-shard-00-00.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-01.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-02.77vvets.mongodb.net:27017/sevainest?ssl=true&replicaSet=atlas-2u8s8l-shard-0&authSource=admin&appName=Cluster1';

async function run() {
  console.log('Connecting to Atlas...');
  await mongoose.connect(ATLAS_URI);
  console.log('Connected to Atlas!');
  
  const total = await User.countDocuments({});
  console.log('Total users in Atlas DB:', total);
  
  const roles = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);
  console.log('Roles breakdown in Atlas DB:');
  roles.forEach(r => console.log(`- Role: ${r._id || 'undefined'}, Count: ${r.count}`));

  process.exit(0);
}

run().catch(err => {
  console.error('Error connecting to Atlas:', err);
  process.exit(1);
});
