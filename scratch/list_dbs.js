const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  console.log('Databases list:');
  dbs.databases.forEach(db => console.log(`- ${db.name}`));

  // Show collections in current DB
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in current DB:');
  for (const col of collections) {
    const count = await mongoose.connection.db.collection(col.name).countDocuments({});
    console.log(`- ${col.name}: ${count} documents`);
  }

  process.exit(0);
}

run();
