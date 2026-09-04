const { PDFDocument } = require('pdf-lib');
const { decryptPDF } = require('@pdfsmaller/pdf-decrypt');

/**
 * Loads a PDF buffer into a pdf-lib PDFDocument instance.
 * Catches password-protected and corrupted documents.
 * 
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<PDFDocument>}
 */
exports.loadPdf = async (buffer) => {
  try {
    // If pdf-lib throws an error, it is caught here
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    return pdfDoc;
  } catch (err) {
    if (err.message && (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('decrypt'))) {
      throw new Error('PDF is password protected.');
    }
    throw new Error('Invalid PDF file.');
  }
};

/**
 * Detects if a PDF buffer is password protected (encrypted).
 * 
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<Boolean>}
 */
exports.isEncrypted = async (buffer) => {
  try {
    await PDFDocument.load(buffer, { ignoreEncryption: false });
    return false;
  } catch (err) {
    if (err.message && (err.message.includes('encrypted') || err.message.includes('password') || err.message.includes('decrypt'))) {
      console.log('[CardProcessing] Protected PDF detected');
      return true;
    }
    return false;
  }
};

/**
 * Attempts to decrypt an encrypted PDF buffer using the supplied password.
 * 
 * @param {Buffer} buffer - PDF file buffer
 * @param {String} password - decryption password
 * @returns {Promise<Buffer>} - decrypted PDF buffer
 */
exports.decryptPdf = async (buffer, password) => {
  console.log('[CardProcessing] Attempting PDF decryption');
  
  // 1. Read encryption parameters to log method
  let revision = 0;
  let version = 0;
  try {
    const { PDFDocument, PDFName } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    const trailer = pdfDoc.context.trailerInfo;
    const encryptRef = trailer.Encrypt;
    if (encryptRef) {
      const encryptObj = pdfDoc.context.lookup(encryptRef);
      const R = encryptObj.lookup(PDFName.of('R'));
      const V = encryptObj.lookup(PDFName.of('V'));
      revision = R ? Number(R.toString()) : 0;
      version = V ? Number(V.toString()) : 0;
    }
  } catch (err) {
    // Ignore parameter reading errors
  }
  
  console.log(`[CardProcessing] Encryption method detected (R=${revision}, V=${version})`);

  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { exec } = require('child_process');

  const qpdfPath = 'C:/Users/gunas/.gemini/antigravity-ide/brain/87d5515e-8c92-4d43-8020-8ffcfc575da3/scratch/qpdf/qpdf-12.4.0-msvc64/bin/qpdf.exe';
  const tempId = Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  const tempInput = path.join(os.tmpdir(), `input_${tempId}.pdf`);
  const tempOutput = path.join(os.tmpdir(), `output_${tempId}.pdf`);

  fs.writeFileSync(tempInput, buffer);

  return new Promise((resolve, reject) => {
    const cmd = `"${qpdfPath}" --decrypt --password=${password} "${tempInput}" "${tempOutput}"`;
    exec(cmd, (err, stdout, stderr) => {
      // Clean up input file
      try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch (e) {}

      if (err) {
        // Clean up output file if created
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}

        const errOutput = (stderr || stdout || '').toLowerCase();
        if (errOutput.includes('password') || errOutput.includes('invalid') || errOutput.includes('incorrect') || err.code === 2) {
          console.log('[CardProcessing] Password validation failed: INVALID_PASSWORD');
          const error = new Error('The password you entered is incorrect. Please try again.');
          error.code = 'INVALID_PASSWORD';
          return reject(error);
        } else {
          console.log('[CardProcessing] Password validation failed: UNSUPPORTED_ENCRYPTION');
          const error = new Error('The PDF document uses an unsupported encryption method.');
          error.code = 'UNSUPPORTED_ENCRYPTION';
          return reject(error);
        }
      }

      try {
        const decryptedBuffer = fs.readFileSync(tempOutput);
        // Clean up output file
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
        
        console.log('[CardProcessing] Password accepted');
        console.log('[CardProcessing] Decryption successful');
        resolve(decryptedBuffer);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
};

/**
 * Custom PDF decryption helper for V=4, R=4 (AES-128) PDF documents.
 */
async function decryptPdfV4(buffer, password) {
  const { PDFName, PDFHexString, PDFString, PDFDict, PDFArray, PDFRawStream } = require('pdf-lib');
  const crypto = require('crypto');

  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const context = pdfDoc.context;
  const trailer = context.trailerInfo;

  const encryptRef = trailer.Encrypt;
  if (!encryptRef) throw new Error('PDF is not encrypted');

  const encryptObj = context.lookup(encryptRef);
  if (!(encryptObj instanceof PDFDict)) throw new Error('Invalid Encrypt dictionary');

  const R = encryptObj.lookup(PDFName.of('R'));
  const V = encryptObj.lookup(PDFName.of('V'));
  const Length = encryptObj.lookup(PDFName.of('Length'));
  const P = encryptObj.lookup(PDFName.of('P'));
  const O = encryptObj.lookup(PDFName.of('O'));
  const U = encryptObj.lookup(PDFName.of('U'));

  const version = V ? (typeof V.asNumber === 'function' ? V.asNumber() : Number(V.toString())) : 0;
  const revision = R ? (typeof R.asNumber === 'function' ? R.asNumber() : Number(R.toString())) : 0;

  const permissions = P ? (typeof P.asNumber === 'function' ? P.asNumber() : Number(P.toString())) : 0;
  const lengthBits = Length ? (typeof Length.asNumber === 'function' ? Length.asNumber() : Number(Length.toString())) : 128;
  const keyLength = lengthBits / 8;

  const PADDING = new Uint8Array([
    0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
    0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
  ]);

  function padPassword(pwdStr) {
    const pwdBytes = Buffer.isBuffer(pwdStr) || pwdStr instanceof Uint8Array ? Buffer.from(pwdStr) : Buffer.from(pwdStr, 'utf8');
    const padded = new Uint8Array(32);
    if (pwdBytes.length >= 32) {
      padded.set(pwdBytes.slice(0, 32));
    } else {
      padded.set(pwdBytes);
      padded.set(PADDING.slice(0, 32 - pwdBytes.length), pwdBytes.length);
    }
    return padded;
  }

  function rc4Decrypt(key, data) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) % 256;
      const temp = s[i];
      s[i] = s[j];
      s[j] = temp;
    }
    let i = 0;
    j = 0;
    const out = Buffer.alloc(data.length);
    for (let k = 0; k < data.length; k++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      const temp = s[i];
      s[i] = s[j];
      s[j] = temp;
      const r = s[(s[i] + s[j]) % 256];
      out[k] = data[k] ^ r;
    }
    return out;
  }

  function decryptAES128(key, data) {
    if (data.length < 32) return data;
    const iv = data.slice(0, 16);
    const ciphertext = data.slice(16);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  function computeFileKeyRev34(pwdBytes, ownerKey, userKey, p, fileId, keyLength, encryptMetadata) {
    const hashCtx = crypto.createHash('md5');
    hashCtx.update(pwdBytes);
    hashCtx.update(ownerKey);
    
    const pBuf = Buffer.alloc(4);
    pBuf.writeInt32LE(p);
    hashCtx.update(pBuf);
    
    hashCtx.update(fileId);
    
    if (encryptMetadata === false) {
      const metaBuf = Buffer.alloc(4);
      metaBuf.fill(0xFF);
      hashCtx.update(metaBuf);
    }
    
    let hash = hashCtx.digest();
    for (let i = 0; i < 50; i++) {
      hash = crypto.createHash('md5').update(hash.slice(0, keyLength)).digest();
    }
    
    return hash.slice(0, keyLength);
  }

  function validateUserPasswordRev34(pwdStr, ownerKey, userKey, p, fileId, keyLength, encryptMetadata) {
    const padded = padPassword(pwdStr);
    const fileKey = computeFileKeyRev34(padded, ownerKey, userKey, p, fileId, keyLength, encryptMetadata);
    
    const hashInput = Buffer.concat([PADDING, fileId]);
    const hash = crypto.createHash('md5').update(hashInput).digest();
    
    let result = rc4Decrypt(fileKey, hash);
    for (let i = 1; i <= 19; i++) {
      const iterKey = Buffer.alloc(fileKey.length);
      for (let k = 0; k < fileKey.length; k++) {
        iterKey[k] = fileKey[k] ^ i;
      }
      result = rc4Decrypt(iterKey, result);
    }
    
    if (Buffer.compare(result.slice(0, 16), Buffer.from(userKey).slice(0, 16)) === 0) {
      return fileKey;
    }
    return null;
  }

  function validateOwnerPasswordRev34(pwdStr, ownerKey, userKey, p, fileId, keyLength, encryptMetadata) {
    const padded = padPassword(pwdStr);
    let hash = crypto.createHash('md5').update(padded).digest();
    for (let i = 0; i < 50; i++) {
      hash = crypto.createHash('md5').update(hash).digest();
    }
    
    const ownerDecryptKey = hash.slice(0, keyLength);
    
    let result = Buffer.from(ownerKey);
    for (let i = 19; i >= 0; i--) {
      const iterKey = Buffer.alloc(ownerDecryptKey.length);
      for (let k = 0; k < ownerDecryptKey.length; k++) {
        iterKey[k] = ownerDecryptKey[k] ^ i;
      }
      result = rc4Decrypt(iterKey, result);
    }
    
    const recoveredUserPwd = result.slice(0, 32);
    const fileKey = validateUserPasswordRev34(recoveredUserPwd, ownerKey, userKey, p, fileId, keyLength, encryptMetadata);
    return fileKey;
  }

  function deriveObjectKey(fileKey, objId, genId, isAES) {
    const hashCtx = crypto.createHash('md5');
    hashCtx.update(fileKey);
    
    const objBuf = Buffer.alloc(5);
    objBuf[0] = objId & 0xFF;
    objBuf[1] = (objId >> 8) & 0xFF;
    objBuf[2] = (objId >> 16) & 0xFF;
    objBuf[3] = genId & 0xFF;
    objBuf[4] = (genId >> 8) & 0xFF;
    hashCtx.update(objBuf);
    
    if (isAES) {
      hashCtx.update(Buffer.from([0x41, 0x6C, 0x50, 0x72])); // 'AlPr'
    }
    
    const hash = hashCtx.digest();
    const len = Math.min(fileKey.length + 5, 16);
    return hash.slice(0, len);
  }

  function extractBytes(pdfObj) {
    if (!pdfObj) return null;
    if (pdfObj instanceof PDFHexString) {
      const clean = pdfObj.asString().replace(/[^0-9a-fA-F]/g, '');
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    if (pdfObj instanceof PDFString) {
      return pdfObj.asBytes();
    }
    const str = pdfObj.toString();
    if (str.startsWith('<') && str.endsWith('>')) {
      const clean = str.slice(1, -1).replace(/[^0-9a-fA-F]/g, '');
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    return null;
  }

  const ownerKey = extractBytes(O);
  const userKey = extractBytes(U);

  if (!ownerKey || !userKey) {
    throw new Error('Missing /O or /U in standard PDF encryption dictionary');
  }

  let fileId = new Uint8Array(0);
  const idArray = trailer.ID;
  if (idArray) {
    if (Array.isArray(idArray) && idArray.length > 0) {
      fileId = extractBytes(idArray[0]) || new Uint8Array(0);
    } else if (idArray instanceof PDFArray) {
      const firstId = idArray.lookup(0);
      fileId = extractBytes(firstId) || new Uint8Array(0);
    }
  }

  const EncryptMetadata = encryptObj.get(PDFName.of('EncryptMetadata'));
  const encryptMetadata = EncryptMetadata ? EncryptMetadata.toString() !== 'false' : true;

  // Determine algorithm from CFM
  const CF = encryptObj.lookup(PDFName.of('CF'));
  const StmF = encryptObj.lookup(PDFName.of('StmF'));
  let isAES = false;
  if (CF instanceof PDFDict) {
    const defaultCFName = StmF ? StmF.asString().replace(/^\//, '') : 'StdCF';
    const defaultCF = CF.lookup(PDFName.of(defaultCFName));
    if (defaultCF instanceof PDFDict) {
      const CFM = defaultCF.lookup(PDFName.of('CFM'));
      if (CFM && CFM.asString() === '/AESV2') {
        isAES = true;
      }
    }
  }

  console.log('[CardProcessing] Attempting PDF decryption');
  console.log(`[CardProcessing] Encryption method detected (R=${revision}, V=${version})`);

  let fileKey = validateUserPasswordRev34(password, ownerKey, userKey, permissions, fileId, keyLength, encryptMetadata);
  if (!fileKey) {
    fileKey = validateOwnerPasswordRev34(password, ownerKey, userKey, permissions, fileId, keyLength, encryptMetadata);
  }

  if (!fileKey) {
    console.log('[CardProcessing] Password validation failed: INVALID_PASSWORD');
    const err = new Error('Incorrect password. The provided password does not match the user or owner password.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  console.log('[CardProcessing] Password accepted');

  // Derive the encryption object reference number so we can skip it during traversal
  const encryptRefNum = encryptRef && encryptRef.objectNumber ? encryptRef.objectNumber : null;

  const dec = (data, objId, genId) => {
    if (isAES) {
      // Try AES-128 first (spec-compliant for /CFM /AESV2)
      try {
        const aesKey = deriveObjectKey(fileKey, objId, genId, true);
        return decryptAES128(aesKey, data);
      } catch (e) {
        // Fallback to RC4 (some generators declare AESV2 but use RC4)
        const rc4Key = deriveObjectKey(fileKey, objId, genId, false);
        return rc4Decrypt(rc4Key, data);
      }
    } else {
      const objKey = deriveObjectKey(fileKey, objId, genId, false);
      return rc4Decrypt(objKey, data);
    }
  };

  function bytesToHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function decryptStringsInDict(dict, decFunc) {
    for (const [key, value] of dict.entries()) {
      const n = key.asString();
      if (n === '/Length' || n === '/Filter' || n === '/DecodeParms') continue;

      if (value instanceof PDFHexString || value instanceof PDFString) {
        const bytes = value.asBytes();
        if (bytes.length === 0) continue;
        try {
          const decrypted = await decFunc(bytes);
          dict.set(key, PDFHexString.of(bytesToHex(decrypted)));
        } catch (err) {
          // ignore
        }
      } else if (value instanceof PDFDict) {
        await decryptStringsInDict(value, decFunc);
      } else if (value instanceof PDFArray) {
        await decryptStringsInArray(value, decFunc);
      }
    }
  }

  async function decryptStringsInArray(arr, decFunc) {
    for (const el of arr.asArray()) {
      if (el instanceof PDFDict) {
        await decryptStringsInDict(el, decFunc);
      } else if (el instanceof PDFArray) {
        await decryptStringsInArray(el, decFunc);
      }
    }
  }

  const indirectObjects = context.enumerateIndirectObjects();
  for (const [ref, obj] of indirectObjects) {
    const objId = ref.objectNumber;
    const genId = ref.generationNumber;

    // Skip the encryption dictionary object itself
    if (encryptRefNum !== null && objId === encryptRefNum) continue;

    // Skip signature dictionaries and XRef streams
    if (obj instanceof PDFDict && !(obj instanceof PDFRawStream)) {
      const type = obj.get(PDFName.of('Type'));
      if (type && type.toString() === '/Sig') continue;
    }
    if (obj instanceof PDFRawStream && obj.dict) {
      const type = obj.dict.get(PDFName.of('Type'));
      if (type) {
        const typeName = type.toString();
        if (typeName === '/XRef' || typeName === '/Sig') continue;
      }
    }

    if (obj instanceof PDFRawStream) {
      try {
        const streamData = obj.contents;
        const decrypted = dec(streamData, objId, genId);
        obj.contents = decrypted;
      } catch (err) {
        // ignore decryption failures on individual streams
      }

      // Also decrypt strings within the stream's dictionary
      if (obj.dict) {
        await decryptStringsInDict(obj.dict, (data) => dec(data, objId, genId));
      }
    }

    if (!(obj instanceof PDFRawStream)) {
      if (obj instanceof PDFDict) {
        await decryptStringsInDict(obj, (data) => dec(data, objId, genId));
      } else if (obj instanceof PDFArray) {
        await decryptStringsInArray(obj, (data) => dec(data, objId, genId));
      }
    }
  }

  // Remove the /Encrypt entry from the trailer (trailerInfo is a plain JS object)
  delete trailer.Encrypt;

  console.log('[CardProcessing] Decryption successful');

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

/**
 * Gets the total pages in a PDF document.
 * 
 * @param {PDFDocument} pdfDoc
 * @returns {Number}
 */
exports.getPageCount = (pdfDoc) => {
  return pdfDoc.getPageCount();
};

/**
 * Gets dimensions of a specific page (1-indexed).
 * 
 * @param {PDFDocument} pdfDoc
 * @param {Number} pageNumber - 1-based page number
 * @returns {Object} { width, height }
 */
exports.getPageDimensions = (pdfDoc, pageNumber) => {
  const pageCount = pdfDoc.getPageCount();
  if (pageNumber < 1 || pageNumber > pageCount) {
    throw new Error(`Invalid page number. Document only has ${pageCount} page(s).`);
  }
  const page = pdfDoc.getPage(pageNumber - 1);
  return page.getSize(); // Returns { width, height }
};
