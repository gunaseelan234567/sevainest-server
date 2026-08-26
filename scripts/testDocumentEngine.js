const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Load environment variables
dotenv.config();

// Force mock mode for document tests
process.env.NEOAPI_API_KEY = 'mock';

// Ensure mock environment variables are set before S3 client imports
process.env.AWS_S3_BUCKET = 'sevainest-test-bucket';
process.env.AWS_ACCESS_KEY_ID = 'mock-key-id';
process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret';
process.env.AWS_REGION = 'ap-south-1';

// Overwrite S3 storage helpers with mocks to run fully offline
const s3Storage = require('../utils/s3Storage');
s3Storage.uploadFile = async ({ buffer, key, contentType }) => {
  console.log(`    ☁️  [MOCK S3 UPLOAD] Stored key: "${key}" | MIME: ${contentType} | Size: ${buffer.length} bytes`);
  return { key, bucket: 'sevainest-test-bucket' };
};
s3Storage.getSignedDownloadUrl = async (key, expiresIn) => {
  return `https://s3.amazonaws.com/sevainest-test-bucket/${key}?signature=mock-sig&expires=${Date.now() + expiresIn * 1000}`;
};

// Mock axios.get for offline testing of remote URLs
const axios = require('axios');
const originalGet = axios.get;
axios.get = async (url, config) => {
  if (url && (url.includes('w3.org') || url.includes('pdf-test.pdf'))) {
    console.log(`    ☁️  [MOCK HTTP GET] Intercepted outbound request to: ${url}`);
    const mockPdfB64 = 'JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg==';
    return {
      data: Buffer.from(mockPdfB64, 'base64'),
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    };
  }
  return originalGet(url, config);
};

const User = require('../models/User');
const InstantService = require('../models/InstantService');
const InstantServiceTransaction = require('../models/InstantServiceTransaction');
const InstantServiceFile = require('../models/InstantServiceFile');
const instantServiceController = require('../controllers/instantServiceController');
const { isUrlSafe, isPrivateIp, detectMimeAndType } = require('../services/file/documentProcessor');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sevainest';

async function runTests() {
  console.log('🧪 ==========================================');
  console.log('🧪 SEVAINEST GLOBAL DOCUMENT ENGINE TEST SUITE');
  console.log('🧪 ==========================================');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
    process.exit(1);
  }

  let agent1, agent2, admin;
  let service;

  try {
    // 1. Setup mock users
    await User.deleteMany({ email: { $in: ['agent1@test.com', 'agent2@test.com', 'admin@test.com'] } });
    
    agent1 = await User.create({
      name: 'Agent One',
      email: 'agent1@test.com',
      password: 'password123',
      role: 'agent',
      walletBalance: 1000,
      isActivated: true,
      status: 'active',
      isEmailVerified: true
    });

    agent2 = await User.create({
      name: 'Agent Two',
      email: 'agent2@test.com',
      password: 'password123',
      role: 'agent',
      walletBalance: 1000,
      isActivated: true,
      status: 'active',
      isEmailVerified: true
    });

    admin = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin',
      isActivated: true,
      status: 'active',
      isEmailVerified: true
    });

    console.log('✅ Created mock test users.');

    // 2. Setup testing helper structures
    const createTestService = async (responseFields) => {
      await InstantService.deleteMany({ name: 'Document Test Service' });
      return await InstantService.create({
        name: 'Document Test Service',
        description: 'Verifies dynamic document return fields',
        category: 'Test Category',
        provider: 'neoapi',
        endpoint: '/v1/mock/type-endpoint',
        method: 'POST',
        parameters: [
          { name: 'doc_type', label: 'Doc Type', type: 'text', required: true }
        ],
        responseFields,
        serviceAmount: 20,
        status: 'active'
      });
    };

    const runControllerExecution = async (svc, agentUser, formInputs) => {
      const req = {
        user: { id: agentUser._id.toString(), role: agentUser.role },
        params: { id: svc._id.toString() },
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

      await instantServiceController.executeInstantService(req, res, (err) => {
        if (err) throw err;
      });

      return { statusCode, responseJson };
    };

    // ==========================================
    // UNIT TESTS: Core Document Processor
    // ==========================================
    console.log('\n--- Running Unit Tests on signature detection & SSRF ---');
    
    // Test: Magic Byte signature detection
    const pdfBuf = Buffer.from('%PDF-1.4 minimal test PDF');
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const gifBuf = Buffer.from('GIF89a transparent gif content');
    const txtBuf = Buffer.from('plain text header data here');

    console.log(`PDF detect: ${detectMimeAndType(pdfBuf)?.fileType === 'pdf' ? 'PASS' : 'FAIL'}`);
    console.log(`JPEG detect: ${detectMimeAndType(jpegBuf)?.fileType === 'jpeg' ? 'PASS' : 'FAIL'}`);
    console.log(`PNG detect: ${detectMimeAndType(pngBuf)?.fileType === 'png' ? 'PASS' : 'FAIL'}`);
    console.log(`GIF detect: ${detectMimeAndType(gifBuf)?.fileType === 'gif' ? 'PASS' : 'FAIL'}`);
    console.log(`TXT detect (expect null): ${detectMimeAndType(txtBuf) === null ? 'PASS' : 'FAIL'}`);

    // Test: SSRF checks
    console.log(`Loopback IP direct block (127.0.0.1): ${isPrivateIp('127.0.0.1') ? 'PASS' : 'FAIL'}`);
    console.log(`Private subnet direct block (192.168.1.1): ${isPrivateIp('192.168.1.1') ? 'PASS' : 'FAIL'}`);
    console.log(`Public IP check (8.8.8.8): ${!isPrivateIp('8.8.8.8') ? 'PASS' : 'FAIL'}`);
    console.log(`SSRF URL resolve block (http://localhost/doc.pdf): ${!(await isUrlSafe('http://localhost/doc.pdf')) ? 'PASS' : 'FAIL'}`);

    // ==========================================
    // INTEGRATION TESTS: Execute flows
    // ==========================================
    console.log('\n--- Running Integration Tests (Execution flows) ---');

    // TEST CASE A: PDF Data URI Integration
    console.log('\nTEST A: PDF Data URI Parsing and Storage');
    service = await createTestService([
      { key: 'data.document', label: 'Reg Certificate', type: 'file', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/data-uri-pdf';
    await service.save();

    let result = await runControllerExecution(service, agent1, { doc_type: 'pdf' });
    console.log(`Status code: ${result.statusCode}`);
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`Full Response:`, JSON.stringify(result.responseJson, null, 2));
    console.log(`Has references returned:`, result.responseJson.data?.data?.document?.isRef === true);
    
    let dbTxn = await InstantServiceTransaction.findById(result.responseJson.transactionId);
    console.log(`No Base64 saved in DB:`, typeof dbTxn.result?.data?.document === 'object' && dbTxn.result?.data?.document?.isRef === true);
    console.log(`Reference points to file record:`, mongoose.isValidObjectId(dbTxn.result?.data?.document?.fileId));

    let fileRecord = await InstantServiceFile.findById(dbTxn.result?.data?.document?.fileId);
    console.log(`InstantServiceFile record created:`, !!fileRecord);
    console.log(`Correct file name:`, fileRecord?.fileName.startsWith('reg-certificate-'));
    console.log(`Correct storage prefix:`, fileRecord?.storageKey.startsWith('instant-services/transactions/'));

    // TEST CASE B: Raw Base64 PDF Integration
    console.log('\nTEST B: Raw Base64 PDF signature parsing');
    service = await createTestService([
      { key: 'data.document', label: 'Pan Doc', type: 'file', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/raw-base64-pdf';
    await service.save();

    result = await runControllerExecution(service, agent1, { doc_type: 'raw-pdf' });
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`File type detected as pdf:`, result.responseJson.data?.data?.document?.fileType === 'pdf');

    // TEST CASE C: JPEG Data URI Integration
    console.log('\nTEST C: JPEG Image preview mapping');
    service = await createTestService([
      { key: 'data.photo', label: 'Holder Photo', type: 'image', fileType: 'jpeg' }
    ]);
    service.endpoint = '/v1/mock/jpeg-data-uri';
    await service.save();

    result = await runControllerExecution(service, agent1, { doc_type: 'jpeg' });
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`File type detected as jpeg:`, result.responseJson.data?.data?.photo?.fileType === 'jpeg');

    // TEST CASE D: Remote URL Safety SSRF and Download Integration
    console.log('\nTEST D: Secure download from remote HTTPS URLs');
    service = await createTestService([
      { key: 'data.documentUrl', label: 'Tax Receipt', type: 'file', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/remote-pdf-url';
    await service.save();

    result = await runControllerExecution(service, agent1, { doc_type: 'url' });
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`File type fetched and stored:`, result.responseJson.data?.data?.documentUrl?.fileType === 'pdf');

    // TEST CASE E: Dynamic file_array Integration
    console.log('\nTEST E: Iterative Array files mapping');
    service = await createTestService([
      { key: 'data.documents', label: 'Tax PDFs', type: 'file_array', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/file-array';
    await service.save();

    result = await runControllerExecution(service, agent1, { doc_type: 'array' });
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`Array has multiple items:`, Array.isArray(result.responseJson.data?.data?.documents));
    console.log(`Item 1 is reference:`, result.responseJson.data?.data?.documents?.[0]?.isRef === true);
    console.log(`Item 2 is reference:`, result.responseJson.data?.data?.documents?.[1]?.isRef === true);

    // TEST CASE F: Nested response mapping path
    console.log('\nTEST F: Nested key path resolution');
    service = await createTestService([
      { key: 'data.data.certificate', label: 'Aadhaar Certificate', type: 'file', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/nested-document';
    await service.save();

    result = await runControllerExecution(service, agent1, { doc_type: 'nested' });
    console.log(`Success: ${result.responseJson.success}`);
    console.log(`Resolved nested value reference:`, result.responseJson.data?.data?.data?.certificate?.isRef === true);

    // ==========================================
    // FAILURE & REFUND TESTS (ROLLBACK VALIDATION)
    // ==========================================
    console.log('\n--- Running Failure, Rollback & Size Limit Tests ---');

    const checkRefund = async (testName, endpointStr, serviceFields, formInputs) => {
      console.log(`\nTEST: ${testName}`);
      const currentAgentStart = await User.findById(agent1._id);
      const beforeBal = currentAgentStart.walletBalance;
      
      const localService = await createTestService(serviceFields);
      localService.endpoint = endpointStr;
      await localService.save();

      const resObj = await runControllerExecution(localService, agent1, formInputs);
      console.log(`Execution status (expected 502): ${resObj.statusCode}`);
      console.log(`Success status (expected false): ${resObj.responseJson.success}`);
      console.log(`Error code logged (expected FILE_PROCESSING_FAILED): ${resObj.responseJson.code}`);

      // Refresh agent balance
      const freshAgent = await User.findById(agent1._id);
      console.log(`Wallet Balance before: ₹${beforeBal} | After failed: ₹${freshAgent.walletBalance}`);
      if (freshAgent.walletBalance === beforeBal) {
        console.log(`✅ ${testName}: Wallet Refund SUCCESS`);
      } else {
        console.error(`❌ ${testName}: Wallet Refund FAILED`);
      }
    };

    // TEST G: Invalid Base64 payload
    await checkRefund(
      'Invalid Base64 payload rejection',
      '/v1/mock/invalid-base64',
      [{ key: 'data.document', label: 'Doc', type: 'file', fileType: 'pdf' }],
      { doc_type: 'invalid-b64' }
    );

    // TEST H: Unsupported MIME format
    await checkRefund(
      'Unsupported File MIME rejection',
      '/v1/mock/unsupported-format',
      [{ key: 'data.document', label: 'Doc', type: 'file', fileType: 'pdf' }],
      { doc_type: 'txt' }
    );

    // TEST I: Oversized file payload
    await checkRefund(
      'Oversized payload rejection',
      '/v1/mock/oversized-document',
      [{ key: 'data.document', label: 'Doc', type: 'file', fileType: 'pdf' }],
      { doc_type: 'oversized' }
    );

    // TEST J: Spoofed signature check
    await checkRefund(
      'Wrong binary signature validation rejection',
      '/v1/mock/wrong-signature',
      [{ key: 'data.document', label: 'Doc', type: 'file', fileType: 'pdf' }],
      { doc_type: 'wrong-sig' }
    );

    // ==========================================
    // ACCESS CONTROL SECURITY TESTS
    // ==========================================
    console.log('\n--- Running File API Access Control Security Tests ---');
    
    // Create a transaction file record to test downloads
    service = await createTestService([
      { key: 'data.document', label: 'Secure Doc', type: 'file', fileType: 'pdf' }
    ]);
    service.endpoint = '/v1/mock/data-uri-pdf';
    await service.save();

    const execRes = await runControllerExecution(service, agent1, { doc_type: 'pdf' });
    const txnId = execRes.responseJson.transactionId;
    const fileId = execRes.responseJson.data?.data?.document?.fileId;

    const requestFileDownloadUrl = async (authAgent, transactionParam, fileParam) => {
      const req = {
        user: { id: authAgent._id.toString(), role: authAgent.role },
        params: { transactionId: transactionParam.toString(), fileId: fileParam.toString() }
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

      await instantServiceController.getTransactionFile(req, res, (err) => {
        if (err) throw err;
      });

      return { statusCode, responseJson };
    };

    // Test K: Authorized Agent accessing their own file
    console.log('\nTEST K: Authorized Agent accessing own files');
    let accessResult = await requestFileDownloadUrl(agent1, txnId, fileId);
    console.log(`Status (expected 200): ${accessResult.statusCode}`);
    console.log(`Success (expected true): ${accessResult.responseJson.success}`);
    console.log(`Returns Presigned S3 Link:`, accessResult.responseJson.url?.includes('signature=mock-sig'));

    // Test L: Unauthorized Agent accessing another agent's file (SSRF/B2B access block)
    console.log('\nTEST L: Unauthorized Agent accessing another agent\'s files (B2B Leak check)');
    accessResult = await requestFileDownloadUrl(agent2, txnId, fileId);
    console.log(`Status (expected 403): ${accessResult.statusCode}`);
    console.log(`Success (expected false): ${accessResult.responseJson.success}`);
    console.log(`Message: ${accessResult.responseJson.message}`);

    // Test M: Authorized Admin accessing agent's file
    console.log('\nTEST M: Admin auditing files');
    accessResult = await requestFileDownloadUrl(admin, txnId, fileId);
    console.log(`Status (expected 200): ${accessResult.statusCode}`);
    console.log(`Success (expected true): ${accessResult.responseJson.success}`);
    console.log(`Presigned link generated:`, !!accessResult.responseJson.url);

    // ==========================================
    // CLEANUP
    // ==========================================
    console.log('\n🧹 Cleaning up test configurations and user logs.');
    await User.deleteMany({ email: { $in: ['agent1@test.com', 'agent2@test.com', 'admin@test.com'] } });
    await InstantService.deleteMany({ name: 'Document Test Service' });
    await InstantServiceTransaction.deleteMany({ agentId: agent1._id });
    await InstantServiceFile.deleteMany({ transactionId: txnId });

    console.log('✅ All tests finished.');
  } catch (err) {
    console.error('❌ Test suite crashed with error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runTests();
