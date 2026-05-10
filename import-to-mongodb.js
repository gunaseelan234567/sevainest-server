const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

/**
 * import-to-mongodb.js (Mapping Fixed Version)
 * 
 * Maps WordPress exported fields to the local Mongoose schema.
 * Uses wp_user_id for linking Agents and Wallets correctly.
 */

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function importData() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully! 🚀');

    const db = mongoose.connection.db;

    // 1. IMPORT AGENTS -> users collection
    console.log('\n--- Importing Agents ---');
    const agentsPath = path.join(__dirname, 'agents.json');
    const agentWpToMongoId = {};

    if (fs.existsSync(agentsPath)) {
      const agentsData = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
      console.log(`Clearing 'users' collection (agents only)...`);
      await db.collection('users').deleteMany({ role: 'agent' });

      const hashedPassword = await bcrypt.hash('Agent@123', 10);
      const seenEmails = new Set();
      const agentsToInsert = agentsData
        .filter(agent => {
          if (!agent.email) return true;
          const email = agent.email.toLowerCase();
          if (seenEmails.has(email)) return false;
          seenEmails.add(email);
          return true;
        })
        .map(agent => ({
          name: agent.name || 'Unknown Agent',
          email: (agent.email || `agent_${agent.wp_user_id}@test.com`).toLowerCase(),
          phone: agent.mobile || '',
          password: hashedPassword,
          role: 'agent',
          walletBalance: 0,
          status: agent.status === 'approved' ? 'active' : 'pending',
          isActivated: agent.status === 'approved',
          wp_user_id: agent.wp_user_id, // FIXED: Using wp_user_id for mapping
          createdAt: agent.created_at ? new Date(agent.created_at) : new Date(),
          updatedAt: agent.created_at ? new Date(agent.created_at) : new Date()
        }));

      const result = await db.collection('users').insertMany(agentsToInsert);
      console.log(`✅ Inserted ${result.insertedCount} agents.`);

      // Create mapping using wp_user_id
      const insertedAgents = await db.collection('users').find({ role: 'agent' }).toArray();
      insertedAgents.forEach(a => {
        if (a.wp_user_id) agentWpToMongoId[a.wp_user_id] = a._id;
      });
    }

    // 2. IMPORT SERVICES -> services collection
    console.log('\n--- Importing Services ---');
    const servicesPath = path.join(__dirname, 'services.json');
    const serviceWpToMongoId = {};
    const adminUser = await db.collection('users').findOne({ role: 'admin' });
    const adminId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

    if (fs.existsSync(servicesPath)) {
      const servicesData = JSON.parse(fs.readFileSync(servicesPath, 'utf-8'));
      console.log(`Clearing 'services' collection...`);
      await db.collection('services').deleteMany({});

      const servicesToInsert = servicesData.map(s => ({
        title: s.title,
        category: s.category || 'General',
        chargeAmount: s.amount || 0,
        status: s.status === 'active' ? 'active' : 'inactive',
        description: s.title,
        imageUrl: s.image_url,
        createdBy: adminId,
        wp_id: s.wp_id,
        formFields: (s.form_schema || []).map(f => ({
          label: f.label,
          name: f.name,
          type: ['text', 'textarea', 'number', 'date', 'dropdown', 'checkbox', 'file'].includes(f.type) ? f.type : 'text',
          required: f.required || false,
          options: f.options || []
        }))
      }));

      const result = await db.collection('services').insertMany(servicesToInsert);
      console.log(`✅ Inserted ${result.insertedCount} services.`);

      const insertedServices = await db.collection('services').find().toArray();
      insertedServices.forEach(s => {
        if (s.wp_id) serviceWpToMongoId[s.wp_id] = s._id;
      });
    }

    // 3. IMPORT WALLETS -> Update users collection
    console.log('\n--- Updating Wallets (Balances) ---');
    const walletsPath = path.join(__dirname, 'wallets.json');
    if (fs.existsSync(walletsPath)) {
      const walletsData = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
      let updateCount = 0;
      for (const wallet of walletsData) {
        // Match using wp_user_id
        if (agentWpToMongoId[wallet.wp_user_id]) {
          await db.collection('users').updateOne(
            { _id: agentWpToMongoId[wallet.wp_user_id] },
            { $set: { walletBalance: wallet.balance || 0 } }
          );
          updateCount++;
        }
      }
      console.log(`✅ Updated wallet balances for ${updateCount} agents.`);
    }

    // 4. IMPORT APPLICATIONS -> applications collection
    console.log('\n--- Importing Applications ---');
    const appsPath = path.join(__dirname, 'applications.json');
    if (fs.existsSync(appsPath)) {
      const appsData = JSON.parse(fs.readFileSync(appsPath, 'utf-8'));
      console.log(`Clearing 'applications' collection...`);
      await db.collection('applications').deleteMany({});

      const appsToInsert = [];
      for (const app of appsData) {
        const agentId = agentWpToMongoId[app.agent_id]; // Matches wp_user_id
        const serviceId = serviceWpToMongoId[app.service_id]; // Matches wp_id

        if (!agentId || !serviceId) continue;

        appsToInsert.push({
          applicationId: app.application_no,
          serviceId: serviceId,
          agentId: agentId,
          formData: app.form_json || {},
          status: ['pending', 'approved', 'rejected', 'returned'].includes(app.status) ? app.status : 'pending',
          chargeDeducted: app.amount || 0,
          createdAt: new Date(app.created_at),
          updatedAt: new Date(app.updated_at)
        });
      }

      if (appsToInsert.length > 0) {
        const result = await db.collection('applications').insertMany(appsToInsert);
        console.log(`✅ Successfully inserted ${result.insertedCount} applications.`);
      } else {
        console.log('ℹ️ No valid applications to insert.');
      }
    }

    console.log('\n✨ Import process completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during import:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

importData();
