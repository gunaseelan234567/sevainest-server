const mongoose = require('mongoose');
const User = require('../models/User');

const ATLAS_URI = 'mongodb://sevainestofficial_db_user:tEyQ4BI4i10Xfq86@ac-wj3i77w-shard-00-00.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-01.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-02.77vvets.mongodb.net:27017/sevainest?ssl=true&replicaSet=atlas-2u8s8l-shard-0&authSource=admin&appName=Cluster1';

async function run() {
  await mongoose.connect(ATLAS_URI);
  const admins = await User.find({ role: 'admin' });
  console.log('Admins in Atlas:');
  admins.forEach(a => {
    console.log(`- ${a.name} (${a.email}): status=${a.status}, isActivated=${a.isActivated}, isDeleted=${a.isDeleted}`);
  });
  process.exit(0);
}

run();
