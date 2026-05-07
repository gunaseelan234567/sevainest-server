const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Masked logging for debugging
  const maskedUser = process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}...` : 'MISSING';
  const maskedPass = process.env.EMAIL_PASS ? `${process.env.EMAIL_PASS.substring(0, 3)}...` : 'MISSING';
  console.log(`📧 Config: Host=${process.env.EMAIL_HOST}, Port=${process.env.EMAIL_PORT}, User=${maskedUser}, Pass=${maskedPass}`);

  const transporterConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: (process.env.EMAIL_PORT === '465' || !process.env.EMAIL_PORT),
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
    family: 4 // Strictly force IPv4
  };

  const transporter = nodemailer.createTransport(transporterConfig);
  
  const message = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };
 
  try {
    console.log(`📤 Sending email to ${options.email} via IPv4...`);
    const info = await transporter.sendMail(message);
    console.log(`✅ Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Email sending failed:`, error);
    throw error;
  }
};

module.exports = sendEmail;
