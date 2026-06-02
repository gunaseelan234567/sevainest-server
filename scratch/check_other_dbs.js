const mongoose = require('mongoose');

async function run() {
  const dbs = ['sevainest', 'sevainest_db', 'esevai'];
  for (const dbName of dbs) {
    const conn = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`);
    await new Promise(resolve => conn.once('open', resolve));
    try {
      const collections = await conn.db.listCollections().toArray();
      const userCol = collections.find(c => c.name === 'users');
      if (userCol) {
        const count = await conn.db.collection('users').countDocuments({});
        console.log(`Database: ${dbName} | users count: ${count}`);
        const roles = await conn.db.collection('users').aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ]).toArray();
        console.log('Roles:');
        roles.forEach(r => console.log(`  - ${r._id}: ${r.count}`));
      } else {
        console.log(`Database: ${dbName} | no users collection`);
      }
    } catch (err) {
      console.log(`Error in ${dbName}:`, err.message);
    } finally {
      await conn.close();
    }
  }
  process.exit(0);
}

run();
