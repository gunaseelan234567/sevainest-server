const mongoose = require('mongoose');
const User = require('../models/User');

const ATLAS_URI = 'mongodb://sevainestofficial_db_user:tEyQ4BI4i10Xfq86@ac-wj3i77w-shard-00-00.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-01.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-02.77vvets.mongodb.net:27017/sevainest?ssl=true&replicaSet=atlas-2u8s8l-shard-0&authSource=admin&appName=Cluster1';

async function run() {
  await mongoose.connect(ATLAS_URI);
  
  const count = await User.countDocuments({ role: 'agent', isDeleted: { $ne: true } });
  console.log('User.countDocuments({ role: "agent", isDeleted: { $ne: true } }):', count);

  const list = await User.find({ role: 'agent', isDeleted: { $ne: true } });
  console.log('List length:', list.length);

  // Group by status
  const statuses = {};
  list.forEach(u => {
    statuses[u.status] = (statuses[u.status] || 0) + 1;
  });
  console.log('Breakdown by status:', statuses);

  // How many have isDeleted !== true?
  console.log('Sample matching agents (first 5):');
  list.slice(0, 5).forEach(u => {
    console.log(`- Name: ${u.name}, Status: ${u.status}, isActivated: ${u.isActivated}, agentId: ${u.agentId}`);
  });

  process.exit(0);
}

run();
