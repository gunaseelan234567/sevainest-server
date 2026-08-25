const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const User = require('../models/User');
const InstantService = require('../models/InstantService');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const instantServiceController = require('../controllers/instantServiceController');
const neoapiClient = require('../services/neoapi/neoapiClient');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function runTests() {
  console.log('🧪 Starting Instant Services Verification Tests...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully.');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  }

  try {
    // 1. Get or Create Test Agent User
    let agent = await User.findOne({ role: 'agent' });
    if (!agent) {
      console.log('Creating a test agent user...');
      agent = await User.create({
        name: 'Test Agent',
        email: 'testagent@sevainest.in',
        password: 'password123',
        role: 'agent',
        walletBalance: 100,
        isActivated: true,
        status: 'active',
        isEmailVerified: true
      });
    } else {
      // Top up balance for tests
      agent.walletBalance = 100;
      agent.isActivated = true;
      agent.status = 'active';
      await agent.save();
    }
    console.log(`👤 Using Agent: ${agent.name} (Wallet: ₹${agent.walletBalance})`);

    // 2. Create an Instant Service Configuration
    // Delete existing test service if exists
    await InstantService.deleteMany({ name: 'Test Aadhaar Verification' });
    
    const service = await InstantService.create({
      name: 'Test Aadhaar Verification',
      description: 'Verifies Aadhaar and retrieves user details instantly',
      category: 'Aadhaar',
      provider: 'neoapi',
      endpoint: '/v1/aadhaar/verify',
      method: 'POST',
      parameters: [
        { name: 'aadhaar', label: 'Aadhaar Number', type: 'text', required: true, placeholder: 'Enter 12-digit Aadhaar' }
      ],
      serviceAmount: 15,
      status: 'active'
    });
    console.log(`✅ Created Instant Service: "${service.name}" | Amount: ₹${service.serviceAmount}`);

    // 3. Test Successful Execution Flow
    console.log('\n--- Test Case 1: Successful Execution & Wallet Charge ---');
    const req = {
      user: { id: agent._id.toString() },
      params: { id: service._id.toString() },
      body: { formData: { aadhaar: '123456789012' } },
      ip: '127.0.0.1'
    };

    let responseJson = null;
    const res = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        responseJson = data;
        return this;
      }
    };

    // Trigger execute controller
    await instantServiceController.executeInstantService(req, res, (err) => {
      if (err) throw err;
    });

    console.log(`Response Code: ${res.statusCode || 200}`);
    console.log(`Response success: ${responseJson.success}`);
    
    // Refresh agent
    const updatedAgentSuccess = await User.findById(agent._id);
    console.log(`Wallet Balance After Success: ₹${updatedAgentSuccess.walletBalance} (Expected: ₹85)`);
    
    if (updatedAgentSuccess.walletBalance === 85) {
      console.log('✅ Wallet Deduction Test: PASSED');
    } else {
      console.error('❌ Wallet Deduction Test: FAILED');
    }

    // Verify Transaction Log
    const txn = await InstantServiceTransaction.findById(responseJson.transactionId);
    console.log(`Transaction Log Status: ${txn.status} (Expected: success)`);
    console.log(`Transaction Log Masked Input:`, txn.requestData);
    console.log(`Transaction Log Masked Output Name:`, txn.result?.data?.fullName);

    if (txn.status === 'success' && txn.requestData.aadhaar === '********9012') {
      console.log('✅ Transaction Masking & Logging Test: PASSED');
    } else {
      console.error('❌ Transaction Masking & Logging Test: FAILED');
    }

    // 4. Test Failed Request Rollback (Wallet Refund)
    console.log('\n--- Test Case 2: Failed Execution & Wallet Refund ---');
    
    // Temporarily corrupt base URL to force NeoAPI connection error if it tries to call real api
    process.env.NEOAPI_API_KEY = 'real_key'; // Avoid bypass mock
    process.env.NEOAPI_BASE_URL = 'http://invalid-url-that-will-fail-fast';
    
    const reqFail = {
      user: { id: agent._id.toString() },
      params: { id: service._id.toString() },
      body: { formData: { aadhaar: '123456789012' } },
      ip: '127.0.0.1'
    };

    let failResponseJson = null;
    const resFail = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        failResponseJson = data;
        return this;
      }
    };

    await instantServiceController.executeInstantService(reqFail, resFail, (err) => {
      if (err) throw err;
    });

    console.log(`Response Code: ${resFail.statusCode || 200}`);
    console.log(`Response success: ${failResponseJson.success}`);
    console.log(`Response message: ${failResponseJson.message}`);

    const updatedAgentFailed = await User.findById(agent._id);
    console.log(`Wallet Balance After Failure: ₹${updatedAgentFailed.walletBalance} (Expected: ₹85 - since balance is refunded)`);

    if (updatedAgentFailed.walletBalance === 85) {
      console.log('✅ Wallet Rollback Refund Test: PASSED');
    } else {
      console.error('❌ Wallet Rollback Refund Test: FAILED');
    }

    // Restore environment variables
    process.env.NEOAPI_API_KEY = 'test_api_key';
    process.env.NEOAPI_BASE_URL = 'https://core.neoapi.io';

    // 5. Test Inactive Service Block
    console.log('\n--- Test Case 3: Inactive Service Block ---');
    service.status = 'inactive';
    await service.save();

    const reqInactive = {
      user: { id: agent._id.toString() },
      params: { id: service._id.toString() },
      body: { formData: { aadhaar: '123456789012' } },
      ip: '127.0.0.1'
    };

    let inactiveResponseJson = null;
    const resInactive = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        inactiveResponseJson = data;
        return this;
      }
    };

    await instantServiceController.executeInstantService(reqInactive, resInactive, (err) => {
      if (err) throw err;
    });

    console.log(`Response Code: ${resInactive.statusCode || 200}`);
    console.log(`Response success: ${inactiveResponseJson.success}`);
    console.log(`Response message: ${inactiveResponseJson.message}`);

    const updatedAgentInactive = await User.findById(agent._id);
    console.log(`Wallet Balance After Inactive Block: ₹${updatedAgentInactive.walletBalance} (Expected: ₹85 - since execution is blocked)`);

    if (resInactive.statusCode === 400 && updatedAgentInactive.walletBalance === 85) {
      console.log('✅ Inactive Service Block Test: PASSED');
    } else {
      console.error('❌ Inactive Service Block Test: FAILED');
    }

    // Clean up test data
    await InstantService.deleteMany({ name: 'Test Aadhaar Verification' });
    console.log('\n🧹 Cleaned up test configurations.');

  } catch (err) {
    console.error('❌ Test execution encountered an error', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Tests finished.');
  }
}

runTests();
