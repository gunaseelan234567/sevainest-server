const { Resend } = require('resend');

const sendEmail = async (options) => {
  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log(`📨 Attempting to send email to ${options.email} via Resend...`);

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM_EMAIL || 'onboarding@resend.dev',
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html || options.message.replace(/\n/g, '<br>'),
    });

    if (error) {
      console.error(`❌ Resend error:`, error);
      throw new Error(error.message);
    }

    console.log(`✅ Email sent successfully via Resend: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`❌ Email sending failed:`, err.message);
    throw err;
  }
};

module.exports = sendEmail;
