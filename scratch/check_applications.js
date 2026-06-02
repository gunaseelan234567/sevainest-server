const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://sevainestofficial_db_user:tEyQ4BI4i10Xfq86@ac-wj3i77w-shard-00-00.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-01.77vvets.mongodb.net:27017,ac-wj3i77w-shard-00-02.77vvets.mongodb.net:27017/sevainest?ssl=true&replicaSet=atlas-2u8s8l-shard-0&authSource=admin&appName=Cluster1';

async function run() {
  console.log('Connecting to Atlas...');
  await mongoose.connect(ATLAS_URI);
  console.log('Connected!');

  const db = mongoose.connection.db;
  const count = await db.collection('applications').countDocuments({});
  console.log('Total applications in Atlas DB:', count);

  const sample = await db.collection('applications').find({}).limit(5).toArray();
  console.log('Sample applications:');
  sample.forEach(app => {
    console.log(`- ID: ${app.applicationId || app._id}, agentId: ${app.agentId}, serviceId: ${app.serviceId}, status: ${app.status}`);
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
