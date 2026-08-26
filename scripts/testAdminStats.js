const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const { getAdminDashboardStats } = require('../controllers/applicationController');
const User = require('../models/User');
const Application = require('../models/Application');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function testStats() {
  console.log('🧪 Running Admin Stats Backend Verification...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // Mock request & response
    const req = {};
    let responseJson = null;
    let statusCode = 200;

    const res = {
      status: function (code) {
        statusCode = code;
        return this;
      },
      json: function (data) {
        responseJson = data;
        return this;
      }
    };

    await getAdminDashboardStats(req, res, (err) => {
      if (err) throw err;
    });

    console.log(`Response Code: ${statusCode}`);
    console.log(`Success status: ${responseJson?.success}`);
    
    const chartData = responseJson?.data?.chartData;
    console.log(`Chart Data entries: ${chartData ? chartData.length : 0}`);
    if (chartData && chartData.length > 0) {
      console.log('Sample entry:', JSON.stringify(chartData[0]));
      const hasApps = chartData.some(d => 'apps' in d);
      const hasInstant = chartData.some(d => 'instantServices' in d);
      if (hasApps && hasInstant) {
        console.log('✅ PASS: Both apps and instantServices daily stats are present in the response.');
      } else {
        console.error('❌ FAIL: Missing apps or instantServices properties in chartData.');
      }
    } else {
      console.error('❌ FAIL: chartData is empty or missing.');
    }

  } catch (err) {
    console.error('❌ Unexpected exception:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

testStats();
