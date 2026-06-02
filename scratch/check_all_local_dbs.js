const mongoose = require('mongoose');

async function run() {
  const dbs = [
    'ag-residancy', 'ag-residency', 'ag_residancy', 'ag_residency',
    'esevai', 'sevainest', 'sevainest_db', 'supermart', 'swiftmart',
    'tattveia', 'yuktron_hotel', 'yuktron_pos', 'yutron',
    'school_management', 'rs_hospitals', 'eyecareapple'
  ];

  for (const dbName of dbs) {
    const conn = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`);
    await new Promise(resolve => conn.once('open', resolve));
    try {
      const collections = await conn.db.listCollections().toArray();
      const userCol = collections.find(c => c.name === 'users');
      if (userCol) {
        const count = await conn.db.collection('users').countDocuments({});
        const agentCount = await conn.db.collection('users').countDocuments({ role: 'agent' });
        console.log(`DB: ${dbName} | Total Users: ${count} | Agents: ${agentCount}`);
      }
    } catch (err) {
      // ignore
    } finally {
      await conn.close();
    }
  }
  process.exit(0);
}

run();
