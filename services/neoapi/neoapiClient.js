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
    
    // Testing endpoints for dynamic file mapping engine
    if (urlLower.includes('mock/data-uri-pdf')) {
      return {
        success: true,
        referenceId: `MOCK-DURIPDF-${Date.now()}`,
        data: {
          document: 'data:application/pdf;base64,JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg=='
        }
      };
    }

    if (urlLower.includes('mock/raw-base64-pdf')) {
      return {
        success: true,
        referenceId: `MOCK-RAWPDF-${Date.now()}`,
        data: {
          document: 'JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg=='
        }
      };
    }

    if (urlLower.includes('mock/jpeg-data-uri')) {
      return {
        success: true,
        referenceId: `MOCK-JPEG-${Date.now()}`,
        data: {
          photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
        }
      };
    }

    if (urlLower.includes('mock/remote-pdf-url')) {
      return {
        success: true,
        referenceId: `MOCK-URLPDF-${Date.now()}`,
        data: {
          documentUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf-test.pdf'
        }
      };
    }

    if (urlLower.includes('mock/file-array')) {
      return {
        success: true,
        referenceId: `MOCK-ARRAY-${Date.now()}`,
        data: {
          documents: [
            'data:application/pdf;base64,JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg==',
            'data:application/pdf;base64,JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg=='
          ]
        }
      };
    }

    if (urlLower.includes('mock/nested-document')) {
      return {
        success: true,
        referenceId: `MOCK-NESTED-${Date.now()}`,
        data: {
          data: {
            certificate: 'data:application/pdf;base64,JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg=='
          }
        }
      };
    }

    if (urlLower.includes('mock/invalid-base64')) {
      return {
        success: true,
        referenceId: `MOCK-INVBASE-${Date.now()}`,
        data: {
          document: 'not-base64-content!!'
        }
      };
    }

    if (urlLower.includes('mock/unsupported-format')) {
      return {
        success: true,
        referenceId: `MOCK-UNSUPPORTED-${Date.now()}`,
        data: {
          document: 'data:text/plain;base64,aGVsbG8gd29ybGQ='
        }
      };
    }

    if (urlLower.includes('mock/oversized-document')) {
      // Large array buffer simulation
      return {
        success: true,
        referenceId: `MOCK-OVERSIZE-${Date.now()}`,
        data: {
          document: 'data:application/pdf;base64,' + 'A'.repeat(1024 * 1024 * 15) // ~15MB base64 string
        }
      };
    }

    if (urlLower.includes('mock/wrong-signature')) {
      return {
        success: true,
        referenceId: `MOCK-WRONGSIG-${Date.now()}`,
        data: {
          document: 'data:application/pdf;base64,aGVsbG8gd29ybGQ=' // Configured as PDF, but binary is "hello world" plain text
        }
      };
    }

    if (urlLower.includes('mock/multiple-mixed')) {
      return {
        success: true,
        referenceId: `MOCK-MIXED-${Date.now()}`,
        data: {
          document: 'data:application/pdf;base64,JVBERi0xLjQKJVRlc3QgUERGCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDIgMCBSID4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdID4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTgwCiUlRU9GCg==',
          photo: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
        }
      };
    }

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
