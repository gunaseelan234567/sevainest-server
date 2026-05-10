const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const agentsInDb = await User.find({ role: 'agent' });
    
    const agentsPath = path.join(__dirname, '../agents.json');
    const agentsJson = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));
    const jsonEmails = new Set(agentsJson.map(a => a.email?.toLowerCase()));

    const missingInJson = agentsInDb.filter(a => !jsonEmails.has(a.email.toLowerCase()));

    console.log(`Agents in DB: ${agentsInDb.length}`);
    console.log(`Agents in JSON: ${agentsJson.length}`);
    console.log(`Agents in DB but NOT in JSON: ${missingInJson.length}`);
    missingInJson.forEach(a => console.log(`- ${a.email} (${a.name})`));

    process.exit(0);
}

check();
