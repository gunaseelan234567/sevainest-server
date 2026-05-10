const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const users = await User.find({ role: 'agent' });
    console.log(`Total agents: ${users.length}`);

    const emails = {};
    const agentIds = {};
    const duplicates = [];

    users.forEach(user => {
      // Check for duplicate emails
      const email = user.email.toLowerCase();
      if (emails[email]) {
        duplicates.push({ type: 'email', value: email, id1: emails[email], id2: user._id });
      } else {
        emails[email] = user._id;
      }

      // Check for duplicate agentIds
      if (user.agentId) {
        if (agentIds[user.agentId]) {
          duplicates.push({ type: 'agentId', value: user.agentId, id1: agentIds[user.agentId], id2: user._id });
        } else {
          agentIds[user.agentId] = user._id;
        }
      }
    });

    if (duplicates.length > 0) {
      console.log('Duplicates found:');
      console.log(JSON.stringify(duplicates, null, 2));
    } else {
      console.log('No duplicates found.');
    }

    // Check for pending agents
    const pending = users.filter(u => u.status === 'pending');
    console.log(`Pending agents: ${pending.length}`);
    pending.forEach(u => console.log(` - ${u.email} (${u._id})`));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
