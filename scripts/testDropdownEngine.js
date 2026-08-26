const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const User = require('../models/User');
const InstantService = require('../models/InstantService');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');
const instantServiceController = require('../controllers/instantServiceController');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

// Intercept neoapiClient invocation to run offline
const neoapiClient = require('../services/neoapi/neoapiClient');
const originalNeoapiCall = neoapiClient.executeService;
neoapiClient.executeService = async (endpoint, method, payload) => {
  console.log(`    ☁️  [MOCK NEOAPI EXECUTION] Endpoint: "${endpoint}" | Method: "${method}" | Payload:`, JSON.stringify(payload));
  return {
    success: true,
    status: 'success',
    transaction_id: 'mock-tx-999',
    message: 'Mock verification completed',
    rctype_received: payload.rctype
  };
};

async function runTests() {
  console.log('🧪 ===============================================');
  console.log('🧪 SEVAINEST DYNAMIC DROPDOWN CONFIG ENGINE TESTS');
  console.log('🧪 ===============================================');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  }

  let agent, admin;

  try {
    // 1. Setup mock users
    await User.deleteMany({ email: { $in: ['dd_agent@test.com', 'dd_admin@test.com'] } });
    
    agent = await User.create({
      name: 'Dropdown Agent',
      email: 'dd_agent@test.com',
      password: 'password123',
      role: 'agent',
      walletBalance: 1000,
      isActivated: true,
      status: 'active',
      isEmailVerified: true
    });

    admin = await User.create({
      name: 'Dropdown Admin',
      email: 'dd_admin@test.com',
      password: 'password123',
      role: 'admin',
      isActivated: true,
      status: 'active',
      isEmailVerified: true
    });

    console.log('✅ Created mock test users.');

    // Helper to simulate admin controller create
    const createServiceViaController = async (paramsArray) => {
      const req = {
        user: { id: admin._id.toString(), role: admin.role },
        headers: {},
        socket: {},
        body: {
          name: 'Dropdown Test Service',
          description: 'Testing configuration dropdown options',
          category: 'Test Category',
          provider: 'neoapi',
          endpoint: '/v1/mock/dropdown-test',
          method: 'POST',
          parameters: JSON.stringify(paramsArray),
          responseFields: JSON.stringify([]),
          serviceAmount: 10
        }
      };

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

      let nextErr = null;
      await instantServiceController.createInstantService(req, res, (err) => {
        nextErr = err;
      });

      if (nextErr) {
        throw nextErr;
      }
      return { statusCode, responseJson };
    };

    // Helper to simulate agent controller execute
    const executeServiceViaController = async (svcId, formInputs) => {
      const req = {
        user: { id: agent._id.toString(), role: agent.role },
        headers: {},
        socket: {},
        params: { id: svcId.toString() },
        body: { formData: formInputs },
        ip: '127.0.0.1'
      };

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

      let nextErr = null;
      await instantServiceController.executeInstantService(req, res, (err) => {
        nextErr = err;
      });

      if (nextErr) {
        throw nextErr;
      }
      return { statusCode, responseJson };
    };

    console.log('\n--- Running Backend Save Validation Tests ---');

    // Test 1: Dropdown select with empty options array
    try {
      await createServiceViaController([
        { name: 'rctype', label: 'RC Type', type: 'select', required: true, options: [] }
      ]);
      console.error('❌ Test 1 Failed: Allowed saving select parameter with empty options list.');
    } catch (err) {
      console.log('✅ Test 1 Passed: Correctly rejected empty options list. Error:', err.message);
    }

    // Test 2: Dropdown options with empty label
    try {
      await createServiceViaController([
        {
          name: 'rctype',
          label: 'RC Type',
          type: 'select',
          required: true,
          options: [
            { label: '', value: '1' }
          ]
        }
      ]);
      console.error('❌ Test 2 Failed: Allowed saving select parameter with empty option label.');
    } catch (err) {
      console.log('✅ Test 2 Passed: Correctly rejected empty option label. Error:', err.message);
    }

    // Test 3: Dropdown options with empty value
    try {
      await createServiceViaController([
        {
          name: 'rctype',
          label: 'RC Type',
          type: 'select',
          required: true,
          options: [
            { label: 'Chip', value: '' }
          ]
        }
      ]);
      console.error('❌ Test 3 Failed: Allowed saving select parameter with empty option value.');
    } catch (err) {
      console.log('✅ Test 3 Passed: Correctly rejected empty option value. Error:', err.message);
    }

    // Test 4: Duplicate API values in dropdown options
    try {
      await createServiceViaController([
        {
          name: 'rctype',
          label: 'RC Type',
          type: 'select',
          required: true,
          options: [
            { label: 'Chip', value: '1' },
            { label: 'Alternative Chip', value: '1' }
          ]
        }
      ]);
      console.error('❌ Test 4 Failed: Allowed saving duplicate API values.');
    } catch (err) {
      console.log('✅ Test 4 Passed: Correctly rejected duplicate API values. Error:', err.message);
    }

    // Test 5: Duplicate Labels in dropdown options
    try {
      await createServiceViaController([
        {
          name: 'rctype',
          label: 'RC Type',
          type: 'select',
          required: true,
          options: [
            { label: 'Chip', value: '1' },
            { label: 'Chip', value: '2' }
          ]
        }
      ]);
      console.error('❌ Test 5 Failed: Allowed saving duplicate display labels.');
    } catch (err) {
      console.log('✅ Test 5 Passed: Correctly rejected duplicate display labels. Error:', err.message);
    }

    // Test 6: Validate standard TEXT field works
    let validService;
    try {
      await InstantService.deleteMany({ name: 'Dropdown Test Service' });
      const result = await createServiceViaController([
        { name: 'vehicle_no', label: 'Vehicle Number', type: 'text', required: true }
      ]);
      console.log('✅ Test 6 Passed: Standard TEXT field parameter saved successfully.');
      validService = result.responseJson.data;
    } catch (err) {
      console.error('❌ Test 6 Failed: Could not save standard TEXT parameter:', err.message);
    }

    // Test 7: Validate dropdown configuration saves correctly
    let dropdownService;
    try {
      await InstantService.deleteMany({ name: 'Dropdown Test Service' });
      const result = await createServiceViaController([
        {
          name: 'rctype',
          label: 'RC Type',
          type: 'select',
          required: true,
          options: [
            { label: 'Chip', value: '1' },
            { label: 'No Chip', value: '2' },
            { label: 'Chip New', value: '3' },
            { label: 'No Chip New', value: '4' }
          ]
        }
      ]);
      console.log('✅ Test 7 Passed: Dropdown select parameter configuration saved successfully.');
      dropdownService = result.responseJson.data;
    } catch (err) {
      console.error('❌ Test 7 Failed: Could not save dropdown parameter:', err.message);
    }

    console.log('\n--- Running Backend execution validation & security ---');

    // Test 8: Agent submits a valid mapped value (e.g. "1" for "Chip")
    try {
      const execResult = await executeServiceViaController(dropdownService._id, { rctype: '1' });
      console.log(`✅ Test 8 Passed: Allowed execution with valid option value "1" (Chip). Result:`, execResult.responseJson.success);
    } catch (err) {
      console.error('❌ Test 8 Failed: Rejected valid option value "1":', err.message);
    }

    // Test 9: Agent submits another valid mapped value (e.g. "3" for "Chip New")
    try {
      const execResult = await executeServiceViaController(dropdownService._id, { rctype: '3' });
      console.log(`✅ Test 9 Passed: Allowed execution with valid option value "3" (Chip New). Result:`, execResult.responseJson.success);
    } catch (err) {
      console.error('❌ Test 9 Failed: Rejected valid option value "3":', err.message);
    }

    // Test 10: Agent submits invalid options value (e.g. "999") - SECURITY CHECK
    try {
      const execResult = await executeServiceViaController(dropdownService._id, { rctype: '999' });
      if (execResult.statusCode === 400 && !execResult.responseJson.success) {
        console.log('✅ Test 10 Passed: Backend security correctly blocked and rejected invalid value "999". Message:', execResult.responseJson.message);
      } else {
        console.error('❌ Test 10 Failed: Did not reject invalid value "999", response code:', execResult.statusCode);
      }
    } catch (err) {
      console.error('❌ Test 10 Failed: Unexpected exception on security check:', err.message);
    }

    // Test 11: Agent submits empty required value
    try {
      const execResult = await executeServiceViaController(dropdownService._id, { rctype: '' });
      if (execResult.statusCode === 400 && !execResult.responseJson.success) {
        console.log('✅ Test 11 Passed: Correctly rejected empty required field. Message:', execResult.responseJson.message);
      } else {
        console.error('❌ Test 11 Failed: Did not reject empty required field, response code:', execResult.statusCode);
      }
    } catch (err) {
      console.error('❌ Test 11 Failed: Unexpected exception:', err.message);
    }

  } finally {
    // Restore neoapi Client
    neoapiClient.executeService = originalNeoapiCall;

    // Clean test database setup
    await User.deleteMany({ email: { $in: ['dd_agent@test.com', 'dd_admin@test.com'] } });
    await InstantService.deleteMany({ name: 'Dropdown Test Service' });
    await InstantServiceTransaction.deleteMany({ serviceName: 'Dropdown Test Service' });

    console.log('\n🧹 Cleaned up test database.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    console.log('🏁 All test cases finished.');
  }
}

runTests();
