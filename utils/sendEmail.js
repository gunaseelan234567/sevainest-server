const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  console.log(`📧 Attempting to send email via ${process.env.EMAIL_HOST} as ${process.env.EMAIL_USER}...`);
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
 
  const message = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };
 
  try {
    const info = await transporter.sendMail(message);
    console.log(`✅ Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Email sending failed: ${error.message}`);
    throw error; // Rethrow to let the caller handle it if needed
  }
};

module.exports = sendEmail;
