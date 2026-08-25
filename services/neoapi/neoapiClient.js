const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Execute request to NeoAPI.
 * Securely handles the API key and performs execution.
 * If credentials are not configured or set to mock keys, returns a simulated response.
 *
 * @param {String} endpoint - The NeoAPI endpoint path (e.g. /v1/aadhaar/verify)
 * @param {String} method - HTTP method (GET or POST)
 * @param {Object} data - Form parameters passed from agent
 * @returns {Promise<Object>} - API response
 */
exports.executeService = async (endpoint, method = 'POST', data = {}) => {
  const apiKey = process.env.NEOAPI_API_KEY;
  const baseUrl = process.env.NEOAPI_BASE_URL || 'https://core.neoapi.io';

  // Construct absolute URL
  let url = endpoint;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  }

  // Handle Mock Execution for development/testing
  if (!apiKey || apiKey === 'test_api_key' || apiKey === 'mock') {
    logger.log(`[MOCK NEOAPI] Simulating request to: ${url} [${method}]`);
    logger.log(`[MOCK NEOAPI] Input Data (Masked):`, maskDummyValues(data));

    // Wait slightly to simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Dynamic mock response based on the endpoint
    const urlLower = url.toLowerCase();
    if (urlLower.includes('aadhaar')) {
      const aadhaarNum = data.aadhaar || data.aadhaarNo || data.aadhaarNumber || '123456789012';
      return {
        success: true,
        referenceId: `MOCK-ADR-${Date.now()}`,
        data: {
          fullName: 'Rajesh Kumar Swami',
          gender: 'MALE',
          dob: '28-11-1991',
          careOf: 'S/O: Mohan Lal Swami',
          address: {
            house: 'Plot 42',
            street: 'Gopalpura Bypass',
            landmark: 'Near Metro Pillar 80',
            loc: 'Gopalpura',
            po: 'Jaipur',
            dist: 'Jaipur',
            state: 'Rajasthan',
            pc: '302018',
          },
          maskedMobile: '******5521',
          photo: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' // Tiny 1x1 mock PNG
        }
      };
    }

    if (urlLower.includes('pan')) {
      const panNum = (data.pan || data.panNo || data.panNumber || 'ABCDE1234F').toUpperCase();
      return {
        success: true,
        referenceId: `MOCK-PAN-${Date.now()}`,
        data: {
          pan: panNum,
          firstName: 'RAJESH',
          middleName: 'KUMAR',
          lastName: 'SWAMI',
          fullName: 'RAJESH KUMAR SWAMI',
          status: 'EXISTING AND ACTIVE',
          category: 'INDIVIDUAL',
          aadhaarLinked: true,
        }
      };
    }

    if (urlLower.includes('bank') || urlLower.includes('account')) {
      const accNum = data.accountNumber || data.accountNo || '9123456789012';
      return {
        success: true,
        referenceId: `MOCK-BNK-${Date.now()}`,
        data: {
          accountNumber: accNum,
          ifsc: data.ifsc || 'SBIN0001234',
          fullName: 'RAJESH KUMAR SWAMI',
          bankName: 'STATE BANK OF INDIA',
          accountStatus: 'ACTIVE',
          bankTxnId: `TXN-${Math.floor(Math.random() * 10000000)}`
        }
      };
    }

    if (urlLower.includes('gst')) {
      const gstin = (data.gstin || '08AAPCS1023F1Z5').toUpperCase();
      return {
        success: true,
        referenceId: `MOCK-GST-${Date.now()}`,
        data: {
          gstin: gstin,
          tradeName: 'SWAMI DIGITAL SEVA CENTER',
          legalName: 'RAJESH KUMAR SWAMI',
          registrationDate: '01/04/2021',
          gstinStatus: 'ACTIVE',
          taxpayerType: 'COMPOSITION',
          stateCode: '08',
        }
      };
    }

    // Default mock response for other endpoints
    return {
      success: true,
      referenceId: `MOCK-GEN-${Date.now()}`,
      data: {
        message: 'Mock generic verification successful',
        submittedParameters: data,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Real NeoAPI call
  try {
    const config = {
      method: method.toUpperCase(),
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      timeout: 30000, // 30 seconds timeout
    };

    const requestData = { ...data, apikey: apiKey };

    if (config.method === 'GET') {
      config.params = requestData;
    } else {
      config.data = requestData;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    logger.error(`❌ NeoAPI execution failure on ${endpoint}: ${error.message}`);
    if (error.response) {
      logger.error(`NeoAPI Response Error Payload:`, error.response.data);
      throw new Error(error.response.data?.message || `NeoAPI request failed with status code ${error.response.status}`);
    }
    throw error;
  }
};

/**
 * Utility to mask parameter values for mock logs
 */
function maskDummyValues(data) {
  if (!data) return data;
  const masked = { ...data };
  const sensitiveKeys = ['aadhaar', 'pan', 'account', 'ifsc', 'gstin'];
  for (const key in masked) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k)) && typeof masked[key] === 'string') {
      const val = masked[key].trim();
      masked[key] = val.length > 4 ? '*'.repeat(val.length - 4) + val.slice(-4) : '****';
    }
  }
  return masked;
}
