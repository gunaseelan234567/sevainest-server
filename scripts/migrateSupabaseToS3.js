require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const { uploadFile, generateS3Key } = require('../utils/s3Storage');

// Import Models
const Application = require('../models/Application');
const FundRequest = require('../models/FundRequest');
const Product = require('../models/Product');
const Pdf = require('../models/Pdf');
const Settings = require('../models/Settings');
const Service = require('../models/Service');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Downloads a file from a URL as a buffer.
 */
const downloadFile = async (url) => {
  const response = await axios({
    method: 'get',
    url: url,
    responseType: 'arraybuffer',
    timeout: 30000 // 30 seconds timeout
  });
  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type']
  };
};

/**
 * Extracts a clean filename from a URL.
 */
const getFileNameFromUrl = (url) => {
  try {
    const decodedUrl = decodeURIComponent(url);
    const parsed = new URL(decodedUrl);
    const pathname = parsed.pathname;
    return path.basename(pathname) || 'file.dat';
  } catch (err) {
    return 'file.dat';
  }
};

/**
 * Migrates a single file URL to S3.
 */
const migrateFile = async (url, folder, identifier) => {
  if (!url || !url.includes('supabase.co')) {
    return null; // Skip non-Supabase URLs
  }

  const originalName = getFileNameFromUrl(url);
  const key = generateS3Key(folder, identifier, originalName);

  console.log(`  [Migration] Downloading ${url} ...`);
  if (DRY_RUN) {
    console.log(`  [Dry Run] Would upload to S3 Key: ${key}`);
    return { key, url };
  }

  try {
    const { buffer, contentType } = await downloadFile(url);
    console.log(`  [Migration] Uploading to S3 Key: ${key} (${contentType}) ...`);
    await uploadFile({
      buffer,
      key,
      contentType
    });
    return { key, url };
  } catch (err) {
    console.error(`  [ERROR] Failed to migrate file: ${url}`, err.message);
    throw err;
  }
};

const runMigration = async () => {
  console.log('==================================================');
  console.log('🚀 SEVAINEST SUPABASE TO S3 FILE MIGRATOR STARTED');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (No database/S3 changes)' : 'LIVE MIGRATION'}`);
  console.log('==================================================\n');

  try {
    // 1. Connect MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 2. Migrate Service Applications Uploads
    console.log('\n--- 📁 Applications (Uploaded files & Approved docs) ---');
    const apps = await Application.find({
      $or: [
        { 'uploadedFiles.storage': { $ne: 's3' } },
        { 'approvedDoc.fileUrl': { $regex: /supabase\.co/ }, 'approvedDoc.storage': { $ne: 's3' } }
      ]
    });
    console.log(`Found ${apps.length} applications potentially containing Supabase links.`);

    for (const app of apps) {
      console.log(`Processing Application ID: ${app.applicationId} (${app._id})`);
      let hasChanges = false;

      // Migrate Uploaded Files
      if (app.uploadedFiles && app.uploadedFiles.length > 0) {
        for (let i = 0; i < app.uploadedFiles.length; i++) {
          const file = app.uploadedFiles[i];
          if (file.fileUrl && file.fileUrl.includes('supabase.co') && file.storage !== 's3') {
            try {
              const res = await migrateFile(file.fileUrl, 'applications', app.applicationId);
              if (res) {
                file.storageKey = res.key;
                file.storage = 's3';
                file.fileUrl = `api/applications/${app._id}/files/${file._id}`;
                hasChanges = true;
              }
            } catch (err) {
              console.error(`  [Skip] Skipping file due to download/upload error`);
            }
          }
        }
      }

      // Migrate Approved Doc
      if (app.approvedDoc && app.approvedDoc.fileUrl && app.approvedDoc.fileUrl.includes('supabase.co') && app.approvedDoc.storage !== 's3') {
        try {
          const res = await migrateFile(app.approvedDoc.fileUrl, 'applications', app.applicationId);
          if (res) {
            app.approvedDoc.storageKey = res.key;
            app.approvedDoc.storage = 's3';
            app.approvedDoc.fileUrl = `api/applications/${app._id}/approved-doc`;
            hasChanges = true;
          }
        } catch (err) {
          console.error(`  [Skip] Skipping approved doc due to error`);
        }
      }

      if (hasChanges && !DRY_RUN) {
        await app.save();
        console.log(`  ✅ Application ${app.applicationId} updated in MongoDB.`);
      }
    }

    // 3. Migrate Wallet Fund Requests (Proof images)
    console.log('\n--- 📁 Wallet Offline Proofs ---');
    const fundRequests = await FundRequest.find({
      proofImage: { $regex: /supabase\.co/ },
      storage: { $ne: 's3' }
    });
    console.log(`Found ${fundRequests.length} offline fund requests containing Supabase links.`);

    for (const req of fundRequests) {
      console.log(`Processing Fund Request ID: ${req._id}`);
      try {
        const res = await migrateFile(req.proofImage, 'wallet-proofs', req._id.toString());
        if (res) {
          req.proofImageKey = res.key;
          req.storage = 's3';
          req.proofImage = `api/wallet/proofs/${req._id}`;
          if (!DRY_RUN) {
            await req.save();
            console.log(`  ✅ Fund Request ${req._id} updated in MongoDB.`);
          }
        }
      } catch (err) {
        console.error(`  [Skip] Skipping fund request due to error`);
      }
    }

    // 4. Migrate Products (Product Images)
    console.log('\n--- 📁 Products ---');
    const products = await Product.find({
      imageUrl: { $regex: /supabase\.co/ },
      storage: { $ne: 's3' }
    });
    console.log(`Found ${products.length} products containing Supabase links.`);

    for (const prod of products) {
      console.log(`Processing Product: ${prod.name} (${prod._id})`);
      try {
        const res = await migrateFile(prod.imageUrl, 'products', prod._id.toString());
        if (res) {
          prod.imageKey = res.key;
          prod.storage = 's3';
          prod.imageUrl = `api/products/images/${prod._id}`;
          if (!DRY_RUN) {
            await prod.save();
            console.log(`  ✅ Product ${prod.name} updated in MongoDB.`);
          }
        }
      } catch (err) {
        console.error(`  [Skip] Skipping product due to error`);
      }
    }

    // 5. Migrate PDFs
    console.log('\n--- 📁 PDFs ---');
    const pdfs = await Pdf.find({
      $or: [
        { fileUrl: { $regex: /supabase\.co/ }, storage: { $ne: 's3' } },
        { imageUrl: { $regex: /supabase\.co/ }, storage: { $ne: 's3' } }
      ]
    });
    console.log(`Found ${pdfs.length} PDFs containing Supabase links.`);

    for (const pdf of pdfs) {
      console.log(`Processing PDF: ${pdf.title} (${pdf._id})`);
      let hasChanges = false;

      if (pdf.fileUrl && pdf.fileUrl.includes('supabase.co') && pdf.storage !== 's3') {
        try {
          const res = await migrateFile(pdf.fileUrl, 'pdfs', `${pdf._id}/file`);
          if (res) {
            pdf.fileKey = res.key;
            pdf.storage = 's3';
            pdf.fileUrl = `api/pdfs/download-file/${pdf._id}`;
            hasChanges = true;
          }
        } catch (err) {
          console.error(`  [Skip] Skipping PDF file download due to error`);
        }
      }

      if (pdf.imageUrl && pdf.imageUrl.includes('supabase.co') && pdf.storage !== 's3') {
        try {
          const res = await migrateFile(pdf.imageUrl, 'pdfs', `${pdf._id}/image`);
          if (res) {
            pdf.imageKey = res.key;
            pdf.storage = 's3';
            pdf.imageUrl = `api/pdfs/images/${pdf._id}`;
            hasChanges = true;
          }
        } catch (err) {
          console.error(`  [Skip] Skipping PDF cover image due to error`);
        }
      }

      if (hasChanges && !DRY_RUN) {
        await pdf.save();
        console.log(`  ✅ PDF ${pdf.title} updated in MongoDB.`);
      }
    }

    // 6. Migrate Services (Service icons/images)
    console.log('\n--- 📁 Services ---');
    const servicesList = await Service.find({
      imageUrl: { $regex: /supabase\.co/ },
      storage: { $ne: 's3' }
    });
    console.log(`Found ${servicesList.length} services containing Supabase links.`);

    for (const srv of servicesList) {
      console.log(`Processing Service: ${srv.title} (${srv._id})`);
      try {
        const res = await migrateFile(srv.imageUrl, 'services', srv._id.toString());
        if (res) {
          srv.imageKey = res.key;
          srv.storage = 's3';
          srv.imageUrl = `api/services/images/${srv._id}`;
          if (!DRY_RUN) {
            await srv.save();
            console.log(`  ✅ Service ${srv.title} updated in MongoDB.`);
          }
        }
      } catch (err) {
        console.error(`  [Skip] Skipping service due to error`);
      }
    }

    // 7. Migrate Portal Settings (QR and Welcome images)
    console.log('\n--- 📁 Portal Settings ---');
    const settings = await Settings.findOne({ key: 'portal' });
    if (settings) {
      let hasChanges = false;

      if (settings.manualPaymentQR && settings.manualPaymentQR.includes('supabase.co') && settings.storage !== 's3') {
        console.log('Processing Settings Manual QR Image...');
        try {
          const res = await migrateFile(settings.manualPaymentQR, 'settings', 'qr');
          if (res) {
            settings.manualPaymentQRKey = res.key;
            settings.storage = 's3';
            settings.manualPaymentQR = `api/settings/qr`;
            hasChanges = true;
          }
        } catch (err) {
          console.error(`  [Skip] Skipping Settings manual QR due to error`);
        }
      }

      if (settings.welcomeImage && settings.welcomeImage.includes('supabase.co') && settings.storage !== 's3') {
        console.log('Processing Settings Welcome Banner Image...');
        try {
          const res = await migrateFile(settings.welcomeImage, 'settings', 'welcome');
          if (res) {
            settings.welcomeImageKey = res.key;
            settings.storage = 's3';
            settings.welcomeImage = `api/settings/welcome`;
            hasChanges = true;
          }
        } catch (err) {
          console.error(`  [Skip] Skipping Settings welcome image due to error`);
        }
      }

      if (hasChanges && !DRY_RUN) {
        await settings.save();
        console.log('  ✅ Portal Settings updated in MongoDB.');
      }
    } else {
      console.log('No portal settings document found.');
    }

    console.log('\n==================================================');
    console.log('🏁 MIGRATION COMPLETED SUCCESSFULLY');
    console.log('==================================================');
  } catch (err) {
    console.error('\n❌ CRITICAL ERRORS ENCOUNTERED DURING MIGRATION:', err);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed.');
  }
};

runMigration();
