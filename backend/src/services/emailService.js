const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Create reusable transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send an OTP Verification email to the user using Gmail SMTP.
 */
const sendOtpEmail = async (email, name, otp) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.warn('SMTP credentials are not configured in environment variables.');
    // Only do console fallback in true local dev (no VERCEL env, not production)
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log('\n' + '='.repeat(60));
      console.log(`✉️  [LOCAL DEV FALLBACK] OTP EMAIL SIMULATION FOR: ${email}`);
      console.log(`👤 Name: ${name}`);
      console.log(`🔑 Code: ${otp}`);
      console.log('='.repeat(60) + '\n');
      return true;
    }
    throw new Error('SMTP credentials are not configured.');
  }

  // HTML Email Template with Metro Tracker Branding
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0f172a; color: #f8fafc;">
      <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 25px;">
        <span style="font-size: 32px;">🚇</span>
        <h1 style="margin: 10px 0 0 0; font-size: 24px; color: #6366f1; font-weight: 800; letter-spacing: -0.5px;">Delhi MetroPulse</h1>
        <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8;">Email Verification Core</p>
      </div>
      
      <div style="padding: 0 10px;">
        <h2 style="font-size: 18px; margin-top: 0; color: #ffffff;">Welcome, ${name}!</h2>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
          Thank you for signing up for Delhi MetroPulse. To activate your account and secure your commute preferences, please verify your email address.
        </p>
        
        <div style="background-color: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
          <p style="margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #6366f1; font-weight: 700;">Your One-Time Passcode</p>
          <span style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #ffffff; font-family: monospace;">${otp}</span>
          <p style="margin: 10px 0 0 0; font-size: 11px; color: #f43f5e;">Valid for 10 minutes</p>
        </div>
        
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          If you did not request this email, please ignore it. Do not share this code with anyone.
        </p>
      </div>
      
      <div style="text-align: center; border-top: 1px solid #334155; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #64748b;">
        <p style="margin: 0;">© ${new Date().getFullYear()} Delhi MetroPulse. All rights reserved.</p>
        <p style="margin: 5px 0 0 0;">Live GPS · Shortest Path BFS · Dynamic Telemetry</p>
      </div>
    </div>
  `;

  try {
    logger.info(`Attempting Gmail SMTP send to ${email}...`);
    const info = await transporter.sendMail({
      from: `"Delhi MetroPulse" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `🚇 ${otp} is your Smart Metro Tracker Verification Code`,
      html: htmlContent,
    });
    logger.info(`Verification email sent successfully to ${email}. MessageId: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error(`SMTP sending failed for ${email}: ${error.message}`);
    
    // In local development, fall back to simulation log if the actual SMTP connection fails
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log('\n' + '='.repeat(60));
      console.log(`✉️  [LOCAL DEV SMTP FAILURE FALLBACK] OTP EMAIL FOR: ${email}`);
      console.log(`👤 Name: ${name}`);
      console.log(`🔑 Code: ${otp}`);
      console.log('='.repeat(60) + '\n');
      return true;
    }
    
    throw new Error('Could not send verification email. Please try again later.');
  }
};

module.exports = {
  sendOtpEmail,
};
