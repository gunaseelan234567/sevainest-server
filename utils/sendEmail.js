const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  console.log(`📧 Attempting to send email via ${process.env.EMAIL_HOST} as ${process.env.EMAIL_USER}...`);
  const transporterConfig = {
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    family: 4 // Force IPv4 to avoid IPv6 ENETUNREACH errors on Railway
  };

  // Optimization for Gmail
  if (process.env.EMAIL_HOST === 'smtp.gmail.com') {
    // Keep family: 4 and auth, but use service: 'gmail'
    delete transporterConfig.host;
    delete transporterConfig.port;
    delete transporterConfig.secure;
    transporterConfig.service = 'gmail';
  }

  const transporter = nodemailer.createTransport(transporterConfig);
  
  const message = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };
 
  try {
    console.log(`📤 Sending email to ${options.email}...`);
    const info = await transporter.sendMail(message);
    console.log(`✅ Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Email sending failed:`, error);
    throw error;
  }
};

module.exports = sendEmail;
