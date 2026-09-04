const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const { logAdminAction } = require('../utils/auditLogger');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function test() {
  console.log('Connecting...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');
  
  try {
    console.log('Logging action...');
    await logAdminAction({
      adminId: new mongoose.Types.ObjectId(),
      role: 'admin',
      actionType: 'create',
      targetCollection: 'CardProcessingProfile',
      targetId: 'mock-target-id',
      newData: { foo: 'bar' },
      req: {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'Mozilla/5.0'
        }
      }
    });
    console.log('Logged!');
  } catch (err) {
    console.error('Error!', err);
  } finally {
    await mongoose.connection.close();
  }
}
test();
