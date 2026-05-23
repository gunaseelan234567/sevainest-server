const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// Config
const DRY_RUN = process.argv.includes('--dry-run');

// Supabase Init
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Models
const Application = require('../models/Application');
const Service = require('../models/Service');
const Product = require('../models/Product');
const Pdf = require('../models/Pdf');
const FundRequest = require('../models/FundRequest');
const Settings = require('../models/Settings');

/**
 * Reads a local file, uploads it to Supabase, and returns the new public URL.
 * @param {String} localUrl - The old database url (e.g. '/uploads/services/img.png')
 * @returns {Promise<String|null>} - The new Supabase public URL or null if skipped/failed
 */
async function processAndUploadFile(localUrl) {
  if (!localUrl || !localUrl.startsWith('/uploads/')) {
    return null; // Not a local upload
  }

  const filePath = path.join(__dirname, '..', localUrl);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`   ⚠️ Warning: File not found locally: ${filePath}`);
    return null;
  }

  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would upload: ${filePath}`);
    return `https://placeholder.supabase.co/storage/v1/object/public${localUrl}`;
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    const ext = path.extname(filePath);
    
    // Extract folder name from the old URL (e.g. 'services' from '/uploads/services/...')
    const parts = localUrl.split('/');
    const folder = parts[2] || 'others'; 
    
    const newFileName = `${folder}/migrated-${Date.now()}-${uuidv4()}${ext}`;

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(newFileName, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(newFileName);

    console.log(`   ✅ Uploaded: ${newFileName}`);
    return publicUrlData.publicUrl;

  } catch (err) {
    console.error(`   ❌ Failed to upload ${localUrl}:`, err.message);
    return null; // Skip on error so we don't break the whole process
  }
}

// ------------------------------------------------------------------
// MIGRATION RUNNERS
// ------------------------------------------------------------------

async function migrateServices() {
  console.log('\n--- Migrating Services ---');
  const services = await Service.find({ imageUrl: { $regex: '^/uploads/' } });
  console.log(`Found ${services.length} services to migrate.`);
  
  let count = 0;
  for (const service of services) {
    const newUrl = await processAndUploadFile(service.imageUrl);
    if (newUrl && !DRY_RUN) {
      service.imageUrl = newUrl;
      await service.save();
      count++;
    }
  }
  console.log(`Completed Services. Updated: ${count}`);
}

async function migrateProducts() {
  console.log('\n--- Migrating Products ---');
  const products = await Product.find({ imageUrl: { $regex: '^/uploads/' } });
  console.log(`Found ${products.length} products to migrate.`);
  
  let count = 0;
  for (const product of products) {
    const newUrl = await processAndUploadFile(product.imageUrl);
    if (newUrl && !DRY_RUN) {
      product.imageUrl = newUrl;
      await product.save();
      count++;
    }
  }
  console.log(`Completed Products. Updated: ${count}`);
}

async function migratePdfs() {
  console.log('\n--- Migrating PDFs ---');
  const pdfs = await Pdf.find({ 
    $or: [
      { fileUrl: { $regex: '^/uploads/' } },
      { imageUrl: { $regex: '^/uploads/' } }
    ]
  });
  console.log(`Found ${pdfs.length} PDFs to migrate.`);
  
  let count = 0;
  for (const pdf of pdfs) {
    let updated = false;
    
    if (pdf.fileUrl && pdf.fileUrl.startsWith('/uploads/')) {
      const newFileUrl = await processAndUploadFile(pdf.fileUrl);
      if (newFileUrl && !DRY_RUN) {
        pdf.fileUrl = newFileUrl;
        updated = true;
      }
    }
    
    if (pdf.imageUrl && pdf.imageUrl.startsWith('/uploads/')) {
      const newImageUrl = await processAndUploadFile(pdf.imageUrl);
      if (newImageUrl && !DRY_RUN) {
        pdf.imageUrl = newImageUrl;
        updated = true;
      }
    }

    if (updated && !DRY_RUN) {
      await pdf.save();
      count++;
    }
  }
  console.log(`Completed PDFs. Updated: ${count}`);
}

async function migrateFundRequests() {
  console.log('\n--- Migrating Fund Requests ---');
  const requests = await FundRequest.find({ proofImage: { $regex: '^/uploads/' } });
  console.log(`Found ${requests.length} fund requests to migrate.`);
  
  let count = 0;
  for (const req of requests) {
    const newUrl = await processAndUploadFile(req.proofImage);
    if (newUrl && !DRY_RUN) {
      req.proofImage = newUrl;
      await req.save();
      count++;
    }
  }
  console.log(`Completed Fund Requests. Updated: ${count}`);
}

async function migrateSettings() {
  console.log('\n--- Migrating Settings ---');
  const settings = await Settings.find({ manualPaymentQR: { $regex: '^/uploads/' } });
  console.log(`Found ${settings.length} settings to migrate.`);
  
  let count = 0;
  for (const setting of settings) {
    const newUrl = await processAndUploadFile(setting.manualPaymentQR);
    if (newUrl && !DRY_RUN) {
      setting.manualPaymentQR = newUrl;
      await setting.save();
      count++;
    }
  }
  console.log(`Completed Settings. Updated: ${count}`);
}

async function migrateApplications() {
  console.log('\n--- Migrating Applications ---');
  
  const apps = await Application.find({
    $or: [
      { 'approvedDoc.fileUrl': { $regex: '^/uploads/' } },
      { 'uploadedFiles.fileUrl': { $regex: '^/uploads/' } }
    ]
  });
  
  console.log(`Found ${apps.length} applications to migrate.`);
  
  let count = 0;
  for (const app of apps) {
    let updated = false;

    // Migrate approved document
    if (app.approvedDoc && app.approvedDoc.fileUrl && app.approvedDoc.fileUrl.startsWith('/uploads/')) {
      const newUrl = await processAndUploadFile(app.approvedDoc.fileUrl);
      if (newUrl && !DRY_RUN) {
        app.approvedDoc.fileUrl = newUrl;
        updated = true;
      }
    }

    // Migrate array of uploaded files
    if (app.uploadedFiles && app.uploadedFiles.length > 0) {
      for (let i = 0; i < app.uploadedFiles.length; i++) {
        const fileObj = app.uploadedFiles[i];
        if (fileObj.fileUrl && fileObj.fileUrl.startsWith('/uploads/')) {
          const newUrl = await processAndUploadFile(fileObj.fileUrl);
          if (newUrl && !DRY_RUN) {
            app.uploadedFiles[i].fileUrl = newUrl;
            updated = true;
          }
        }
      }
    }

    if (updated && !DRY_RUN) {
      // mongoose arrays need explicit markModified sometimes but this should work
      app.markModified('approvedDoc');
      app.markModified('uploadedFiles');
      await app.save();
      count++;
    }
  }
  console.log(`Completed Applications. Updated: ${count}`);
}

// ------------------------------------------------------------------
// MAIN EXECUTION
// ------------------------------------------------------------------

async function runMigration() {
  if (DRY_RUN) {
    console.log('🚀 RUNNING IN DRY-RUN MODE (No database changes will be made)');
  } else {
    console.log('🚀 RUNNING MIGRATION (Uploading to Supabase & Updating DB)');
  }

  try {
    // Connect to DB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 MongoDB Connected');

    // Run Migrations
    await migrateServices();
    await migrateProducts();
    await migratePdfs();
    await migrateFundRequests();
    await migrateSettings();
    await migrateApplications();

    console.log('\n🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY');
  } catch (err) {
    console.error('\n💥 FATAL MIGRATION ERROR:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

runMigration();
