/**
 * eSevai Connect — Database Seed Script
 * Run: node seed.js
 * Clears existing users & services, then inserts fresh seed data.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Service = require('./models/Service');

dotenv.config();

const seedUsers = [
  {
    name: 'Super Admin',
    email: 'admin@esevai.com',
    password: 'Admin@123',
    role: 'admin',
    walletBalance: 50000,
    phone: '9999999999',
    shopAddress: 'Sevainest HQ, Chennai'
  },
  {
    name: 'Ravi Kumar',
    email: 'ravi@esevai.com',
    password: 'Agent@123',
    role: 'agent',
    walletBalance: 3500,
    phone: '9876543210',
    shopAddress: 'Ravi Digital Center, Madurai'
  },
  {
    name: 'Priya Devi',
    email: 'priya@esevai.com',
    password: 'Agent@123',
    role: 'agent',
    walletBalance: 7200,
    phone: '9876543211',
    shopAddress: 'Priya e-Sevai, Coimbatore'
  },
  {
    name: 'Mohammed Faiz',
    email: 'faiz@esevai.com',
    password: 'Agent@123',
    role: 'agent',
    walletBalance: 1800,
    phone: '9876543212',
    shopAddress: 'Faiz Smart Services, Trichy'
  },
];

// ─── Services ────────────────────────────────────────────────────────────────
const buildServices = (adminId) => [
  {
    title: 'Aadhaar Card Enrollment',
    category: 'Identity',
    chargeAmount: 50,
    status: 'active',
    description: 'New Aadhaar card enrollment for citizens without a UID.',
    createdBy: adminId,
    formFields: [
      { label: 'Full Name', name: 'fullName', type: 'text', required: true, placeholder: 'Enter full name as per birth certificate' },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Gender', name: 'gender', type: 'dropdown', required: true, options: ['Male', 'Female', 'Transgender'] },
      { label: 'Mobile Number', name: 'mobile', type: 'text', required: true, placeholder: '10-digit mobile number' },
      { label: 'Address', name: 'address', type: 'textarea', required: true, placeholder: 'Full residential address' },
      { label: 'Proof of Identity (Scan)', name: 'idProof', type: 'file', required: true, allowedTypes: ['pdf', 'jpg', 'png'] },
    ],
  },
  {
    title: 'PAN Card Application',
    category: 'Taxation',
    chargeAmount: 120,
    status: 'active',
    description: 'Apply for a new PAN card for income tax purposes.',
    createdBy: adminId,
    formFields: [
      { label: 'Applicant Full Name', name: 'fullName', type: 'text', required: true, placeholder: 'As per Aadhaar' },
      { label: 'Father\'s Name', name: 'fatherName', type: 'text', required: true, placeholder: 'Father\'s full name' },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Applicant Type', name: 'applicantType', type: 'dropdown', required: true, options: ['Individual', 'HUF', 'Company', 'Trust'] },
      { label: 'Email Address', name: 'email', type: 'text', required: true, placeholder: 'applicant@example.com' },
      { label: 'Aadhaar Number', name: 'aadhaar', type: 'text', required: true, placeholder: '12-digit Aadhaar number' },
      { label: 'Proof of Address', name: 'addressProof', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
    ],
  },
  {
    title: 'Driving Licence (New)',
    category: 'Transport',
    chargeAmount: 300,
    status: 'active',
    description: 'Apply for a new driving licence for two-wheelers or four-wheelers.',
    createdBy: adminId,
    formFields: [
      { label: 'Full Name', name: 'fullName', type: 'text', required: true, placeholder: 'Name as on Aadhaar' },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Vehicle Class', name: 'vehicleClass', type: 'dropdown', required: true, options: ['MC 50CC', 'MC EX50CC', 'LMV', 'HMV', 'LMV + HMV'] },
      { label: 'Blood Group', name: 'bloodGroup', type: 'dropdown', required: true, options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
      { label: 'Mobile Number', name: 'mobile', type: 'text', required: true },
      { label: 'Aadhaar Card (Scan)', name: 'aadhaarScan', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
      { label: 'Passport Photo', name: 'photo', type: 'file', required: true, allowedTypes: ['jpg', 'png'] },
      { label: 'Medical Certificate', name: 'medCert', type: 'file', required: false, allowedTypes: ['pdf'] },
    ],
  },
  {
    title: 'Passport Application',
    category: 'Identity',
    chargeAmount: 500,
    status: 'active',
    description: 'Fresh passport application for first-time applicants.',
    createdBy: adminId,
    formFields: [
      { label: 'Full Name', name: 'fullName', type: 'text', required: true, placeholder: 'As per birth certificate' },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Place of Birth', name: 'placeOfBirth', type: 'text', required: true },
      { label: 'Gender', name: 'gender', type: 'dropdown', required: true, options: ['Male', 'Female', 'Transgender'] },
      { label: 'Applicant Type', name: 'applicantType', type: 'dropdown', required: true, options: ['Normal', 'Tatkaal'] },
      { label: 'Father\'s Name', name: 'fatherName', type: 'text', required: true },
      { label: 'Mother\'s Name', name: 'motherName', type: 'text', required: true },
      { label: 'Aadhaar Number', name: 'aadhaar', type: 'text', required: true, placeholder: '12-digit Aadhaar' },
      { label: 'Birth Certificate (Scan)', name: 'birthCert', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
    ],
  },
  {
    title: 'Income Certificate',
    category: 'Revenue',
    chargeAmount: 80,
    status: 'active',
    description: 'Obtain an official income certificate issued by the Revenue Department.',
    createdBy: adminId,
    formFields: [
      { label: 'Applicant Name', name: 'name', type: 'text', required: true },
      { label: 'Annual Income (₹)', name: 'income', type: 'number', required: true, placeholder: 'Enter annual income in rupees' },
      { label: 'Occupation', name: 'occupation', type: 'dropdown', required: true, options: ['Agriculture', 'Business', 'Government Employee', 'Private Employee', 'Self-Employed', 'Other'] },
      { label: 'Purpose of Certificate', name: 'purpose', type: 'textarea', required: true, placeholder: 'e.g., Scholarship application, loan request…' },
      { label: 'Aadhaar Card (Scan)', name: 'aadhaar', type: 'file', required: true, allowedTypes: ['pdf', 'jpg', 'png'] },
      { label: 'Ration Card (Scan)', name: 'rationCard', type: 'file', required: false, allowedTypes: ['pdf', 'jpg'] },
    ],
  },
  {
    title: 'Caste Certificate',
    category: 'Revenue',
    chargeAmount: 80,
    status: 'active',
    description: 'Apply for SC / ST / OBC caste certificate for government benefits.',
    createdBy: adminId,
    formFields: [
      { label: 'Applicant Name', name: 'name', type: 'text', required: true },
      { label: 'Caste', name: 'caste', type: 'text', required: true, placeholder: 'Exact caste name' },
      { label: 'Category', name: 'category', type: 'dropdown', required: true, options: ['SC', 'ST', 'OBC', 'MBC'] },
      { label: 'Father\'s Name', name: 'fatherName', type: 'text', required: true },
      { label: 'Address', name: 'address', type: 'textarea', required: true },
      { label: 'Community Certificate (Previous)', name: 'prevCert', type: 'file', required: false, allowedTypes: ['pdf', 'jpg'] },
      { label: 'Aadhaar Card', name: 'aadhaar', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
    ],
  },
  {
    title: 'Land Registration',
    category: 'Land & Property',
    chargeAmount: 1500,
    status: 'active',
    description: 'Register land or property documents with the Sub-Registrar office.',
    createdBy: adminId,
    formFields: [
      { label: 'Seller\'s Name', name: 'sellerName', type: 'text', required: true },
      { label: 'Buyer\'s Name', name: 'buyerName', type: 'text', required: true },
      { label: 'Survey Number', name: 'surveyNo', type: 'text', required: true, placeholder: 'Land survey number' },
      { label: 'District', name: 'district', type: 'text', required: true },
      { label: 'Taluk', name: 'taluk', type: 'text', required: true },
      { label: 'Village', name: 'village', type: 'text', required: true },
      { label: 'Extent (in acres)', name: 'extent', type: 'number', required: true },
      { label: 'Sale Deed Value (₹)', name: 'saleValue', type: 'number', required: true },
      { label: 'Sale Deed Document', name: 'deed', type: 'file', required: true, allowedTypes: ['pdf'] },
    ],
  },
  {
    title: 'Voter ID Card',
    category: 'Elections',
    chargeAmount: 0,
    status: 'active',
    description: 'Enrol as a new voter to get your EPIC (Voter ID) card.',
    createdBy: adminId,
    formFields: [
      { label: 'Full Name', name: 'fullName', type: 'text', required: true },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Gender', name: 'gender', type: 'dropdown', required: true, options: ['Male', 'Female', 'Other'] },
      { label: 'Constituency', name: 'constituency', type: 'text', required: true, placeholder: 'Your assembly constituency' },
      { label: 'Residential Address', name: 'address', type: 'textarea', required: true },
      { label: 'Aadhaar Copy', name: 'aadhaar', type: 'file', required: true, allowedTypes: ['pdf', 'jpg', 'png'] },
      { label: 'Recent Passport Photo', name: 'photo', type: 'file', required: true, allowedTypes: ['jpg', 'png'] },
    ],
  },
  {
    title: 'Birth Certificate',
    category: 'Vital Records',
    chargeAmount: 60,
    status: 'active',
    description: 'Obtain an official birth certificate from the Municipal / Panchayat office.',
    createdBy: adminId,
    formFields: [
      { label: 'Child\'s Full Name', name: 'childName', type: 'text', required: true },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Place of Birth', name: 'placeOfBirth', type: 'dropdown', required: true, options: ['Government Hospital', 'Private Hospital', 'Home', 'Other'] },
      { label: 'Father\'s Name', name: 'fatherName', type: 'text', required: true },
      { label: 'Mother\'s Name', name: 'motherName', type: 'text', required: true },
      { label: 'Hospital Discharge Summary', name: 'dischargeDoc', type: 'file', required: false, allowedTypes: ['pdf', 'jpg'] },
    ],
  },
  {
    title: 'Old Age Pension',
    category: 'Social Welfare',
    chargeAmount: 0,
    status: 'active',
    description: 'Apply for the government\'s old age monthly pension scheme for senior citizens.',
    createdBy: adminId,
    formFields: [
      { label: 'Applicant Name', name: 'name', type: 'text', required: true },
      { label: 'Date of Birth', name: 'dob', type: 'date', required: true },
      { label: 'Annual Family Income (₹)', name: 'income', type: 'number', required: true },
      { label: 'Bank Account Number', name: 'bankAccount', type: 'text', required: true },
      { label: 'IFSC Code', name: 'ifsc', type: 'text', required: true, placeholder: 'e.g. SBIN0001234' },
      { label: 'Bank Name', name: 'bankName', type: 'text', required: true },
      { label: 'Aadhaar Card', name: 'aadhaar', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
      { label: 'Age Proof Document', name: 'ageProof', type: 'file', required: true, allowedTypes: ['pdf', 'jpg'] },
      { label: 'Bank Passbook (First Page)', name: 'passbook', type: 'file', required: true, allowedTypes: ['pdf', 'jpg', 'png'] },
      { label: 'Self Declaration', name: 'selfDeclaration', type: 'checkbox', required: true },
    ],
  },
];

// ─── Main Seed Function ───────────────────────────────────────────────────────
const seed = async () => {
  // Production protection safeguard
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL ERROR: Database seeding is BLOCKED in production mode to prevent accidental data deletion!');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Service.deleteMany({});
    console.log('🗑️  Cleared existing users and services');

    // Hash passwords manually (bypasses pre-save hook for bulk inserts)
    const hashedUsers = await Promise.all(
      seedUsers.map(async (u) => ({
        ...u,
        password: await bcrypt.hash(u.password, 10),
      }))
    );

    const insertedUsers = await User.insertMany(hashedUsers);
    console.log(`👤 Inserted ${insertedUsers.length} users:`);
    insertedUsers.forEach((u) =>
      console.log(`   • [${u.role.toUpperCase()}] ${u.name} — ${u.email}`)
    );

    // Link all services to the admin user
    const admin = insertedUsers.find((u) => u.role === 'admin');
    const services = buildServices(admin._id);

    const insertedServices = await Service.insertMany(services);
    console.log(`\n🏛️  Inserted ${insertedServices.length} services:`);
    insertedServices.forEach((s) =>
      console.log(`   • [${s.category}] ${s.title} — ₹${s.chargeAmount}`)
    );

    console.log('\n🎉 Seed complete!\n');
    console.log('─────────────────────────────────────────');
    console.log('Test Credentials:');
    console.log('  Admin  → admin@esevai.com   / Admin@123');
    console.log('  Agent  → ravi@esevai.com    / Agent@123');
    console.log('  Agent  → priya@esevai.com   / Agent@123');
    console.log('  Agent  → faiz@esevai.com    / Agent@123');
    console.log('─────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
