const fs = require('fs');
const path = require('path');

const agentsPath = path.join(__dirname, '../agents.json');
const agentsData = JSON.parse(fs.readFileSync(agentsPath, 'utf-8'));

const emailCounts = {};
const duplicateEmails = [];

agentsData.forEach(agent => {
    if (agent.email) {
        const email = agent.email.toLowerCase();
        emailCounts[email] = (emailCounts[email] || 0) + 1;
        if (emailCounts[email] === 2) {
            duplicateEmails.push(email);
        }
    }
});

console.log(`Total Agents in JSON: ${agentsData.length}`);
console.log(`Unique Emails: ${Object.keys(emailCounts).length}`);
console.log(`Duplicate Emails Count: ${duplicateEmails.length}`);
if (duplicateEmails.length > 0) {
    console.log(`Sample Duplicates:`, duplicateEmails.slice(0, 5));
}
