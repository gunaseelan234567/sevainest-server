const crypto = require('crypto');
const net = require('net');
const dns = require('dns').promises;
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { uploadFile } = require('../../utils/s3Storage');
const InstantServiceFile = require('../../models/InstantServiceFile');

// Private IP ranges check for SSRF protection
function isPrivateIp(ip) {
  if (!ip) return true;
  
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 127) return true; // 127.0.0.0/8
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 Link-local
    if (parts[0] === 0) return true; // 0.0.0.0/8
    return false;
  }
  
  if (net.isIPv6(ip)) {
    const canonical = ip.toLowerCase();
    if (canonical === '::1' || canonical === '0:0:0:0:0:0:0:1') return true;
    if (canonical.startsWith('fe80:')) return true; // Link-local
    if (canonical.startsWith('fc00:') || canonical.startsWith('fd00:')) return true; // Unique Local Address
    return false;
  }
  
  return true;
}

// URL Safety evaluation (SSRF Guard)
async function isUrlSafe(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname;
    
    if (net.isIP(hostname)) {
      return !isPrivateIp(hostname);
    }
    
    // Resolve DNS addresses
    const addresses = await dns.resolve(hostname).catch(async () => {
      const res = await dns.lookup(hostname);
      return [res.address];
    });
    
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        return false;
      }
    }
    
    return true;
  } catch (err) {
    return false;
  }
}

// Magic Byte signature inspection
function detectMimeAndType(buffer) {
  if (!buffer || buffer.length < 3) return null;

  // 1. PDF: %PDF- (25 50 44 46 2d)
  if (buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d) {
    return { mimeType: 'application/pdf', fileType: 'pdf' };
  }

  // 2. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', fileType: 'jpeg' };
  }

  // 3. PNG: 89 50 4E 47
  if (buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47) {
    return { mimeType: 'image/png', fileType: 'png' };
  }

  // 4. GIF: GIF87a or GIF89a
  if (buffer.length >= 6) {
    const gifHeader = buffer.slice(0, 6).toString('ascii');
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return { mimeType: 'image/gif', fileType: 'gif' };
    }
  }

  return null;
}

/**
 * Normalizes, validates, and stores a document from raw base64, URL, buffer or data URI.
 * Enforces SSRF blocks, magic byte inspection, size limits, and records S3 metadata.
 */
async function processDocument({
  transactionId,
  providerField,
  label,
  configuredType,
  configuredFileType,
  value
}) {
  if (!transactionId) {
    throw new Error('Transaction ID is required for document processing');
  }
  if (!value) {
    throw new Error('Document value payload is empty');
  }

  // Determine size limit (default 10MB)
  const maxMb = Number(process.env.INSTANT_SERVICE_MAX_FILE_SIZE_MB) || 10;
  const maxSizeBytes = maxMb * 1024 * 1024;

  let buffer;
  let source = 'base64';

  if (Buffer.isBuffer(value)) {
    buffer = value;
    source = 'buffer';
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('data:')) {
      source = 'data_uri';
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid Data URI format');
      }
      buffer = Buffer.from(match[2], 'base64');
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      source = 'url';
      if (!(await isUrlSafe(trimmed))) {
        throw new Error(`SSRF Blocked: URL '${trimmed}' resolves to an unsafe or local IP address`);
      }
      const response = await axios.get(trimmed, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: maxSizeBytes,
        maxRedirects: 3,
      });
      buffer = Buffer.from(response.data);
    } else {
      source = 'base64';
      const base64Str = trimmed.replace(/\s+/g, '');
      const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
      if (base64Str.length === 0 || base64Str.length % 4 !== 0 || !base64Regex.test(base64Str)) {
        throw new Error('Invalid or malformed raw Base64 payload');
      }
      buffer = Buffer.from(base64Str, 'base64');
    }
  } else {
    throw new Error('Unsupported document value representation');
  }

  // Validate Buffer size
  if (!buffer || buffer.length === 0) {
    throw new Error('Decoded document payload is empty');
  }
  if (buffer.length > maxSizeBytes) {
    throw new Error(`Document payload size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds configured limit (${maxMb} MB)`);
  }

  // Inspect magic bytes signature
  const detected = detectMimeAndType(buffer);
  if (!detected) {
    throw new Error('Unsupported or corrupt file binary signature (failed magic-byte inspection)');
  }

  // Enforce configured type mapping rules
  const normalizedFileType = configuredFileType ? configuredFileType.trim().toLowerCase() : '';
  const detectedType = detected.fileType;

  if (normalizedFileType === 'image') {
    if (!['jpeg', 'png', 'gif'].includes(detectedType)) {
      throw new Error(`Mismatched file type. Configured: image, Detected actual binary: ${detectedType}`);
    }
  } else if (normalizedFileType && normalizedFileType !== detectedType) {
    throw new Error(`Mismatched file type. Configured: ${normalizedFileType}, Detected actual binary: ${detectedType}`);
  }

  // Calculate integrity checksum
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  // Generate unique file identifiers
  const fileId = uuidv4();
  const fileExt = detectedType;
  const sanitizedLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'document';
  const fileName = `${sanitizedLabel}-${fileId}.${fileExt}`;
  
  // Storage structure: instant-services/transactions/{transactionId}/{fileName}
  const storageKey = `instant-services/transactions/${transactionId.toString()}/${fileName}`;

  // Upload to S3
  await uploadFile({
    buffer,
    key: storageKey,
    contentType: detected.mimeType,
  });

  // Create metadata db document
  const serviceFile = await InstantServiceFile.create({
    transactionId,
    providerField,
    label,
    type: configuredType || (detectedType === 'pdf' ? 'file' : 'image'),
    fileType: detectedType,
    mimeType: detected.mimeType,
    fileName,
    storageKey,
    size: buffer.length,
    providerSourceType: source,
    checksum,
    status: 'stored',
  });

  return {
    isRef: true,
    fileId: serviceFile._id.toString(),
    label,
    type: serviceFile.type,
    fileType: serviceFile.fileType,
  };
}

module.exports = {
  processDocument,
  isPrivateIp,
  isUrlSafe,
  detectMimeAndType,
};
