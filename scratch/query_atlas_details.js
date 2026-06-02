const mongoose = require('mongoose');
const User = require('../models/User');

const ATLAS_URI = 'mongodb://sevainestofficial_db_user:tEyQ4BI4i10Xfq86@ac-wj3i77w-shard-00-00.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-01.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-02.77vvets.mongodb.net:27017/sevainest?ssl=true&replicaSet=atlas-2u8s8l-shard-0&authSource=admin&appName=Cluster1';

async function run() {
  console.log('Connecting to Atlas...');
  await mongoose.connect(ATLAS_URI);
  console.log('Connected!');

  const total = await User.countDocuments({});
  console.log('Total documents in users:', total);

  // Group by role, status, isActivated, paymentStatus, isDeleted
  const stats = await User.aggregate([
    {
      $group: {
        _id: {
          role: '$role',
          status: '$status',
          isActivated: '$isActivated',
          paymentStatus: '$paymentStatus',
          isDeleted: '$isDeleted'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  console.log('\n--- Group Breakdown in Atlas ---');
  stats.forEach(s => {
    console.log(JSON.stringify(s._id) + ' => Count: ' + s.count);
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
