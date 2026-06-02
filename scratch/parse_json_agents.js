const fs = require('fs');
const path = require('path');

const agentsPath = path.join(__dirname, '../agents.json');
const agentsData = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));

const approved = agentsData.filter(a => a.status === 'approved');
const pending = agentsData.filter(a => a.status !== 'approved');

console.log('Total in JSON:', agentsData.length);
console.log('Approved in JSON:', approved.length);
console.log('Pending in JSON:', pending.length);
