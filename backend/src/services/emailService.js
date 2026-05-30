const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// ── Gmail SMTP Transporter ─────────────────────────────────────────────────────
// Uses Gmail App Password — works on Render (port 587 is NOT blocked).
// No custom domain needed. Sends to ANY email address.
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS (STARTTLS) — required for port 587
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false, // Prevent cert issues on some hosting environments
    },
  });
};

/**
 * Send an OTP Verification email to the user using Gmail SMTP (Nodemailer).
 * @param {string} email - Recipient email address
 * @param {string} name  - Recipient display name
 * @param {string} otp   - 6-digit OTP code
 */
const sendOtpEmail = async (email, name, otp) => {
  // ── Local Dev Fallback (no Gmail credentials configured) ───────────────────
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    logger.warn('Gmail credentials not configured in environment variables.');

    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log('\n' + '='.repeat(60));
      console.log(`✉️  [LOCAL DEV FALLBACK] OTP EMAIL SIMULATION FOR: ${email}`);
      console.log(`👤 Name: ${name}`);
      console.log(`🔑 Code: ${otp}`);
      console.log('='.repeat(60) + '\n');
      return true;
    }

    throw new Error('Email service is not configured (Missing GMAIL_USER or GMAIL_APP_PASSWORD).');
  }

  // ── HTML Email Template ────────────────────────────────────────────────────
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0f172a; color: #f8fafc;">
      <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 25px;">
        <span style="font-size: 32px;">🚇</span>
        <h1 style="margin: 10px 0 0 0; font-size: 24px; color: #6366f1; font-weight: 800; letter-spacing: -0.5px;">Delhi MetroPulse</h1>
        <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8;">Email Verification</p>
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

  // ── Send Email ─────────────────────────────────────────────────────────────
  try {
    logger.info(`Attempting Gmail SMTP send to ${email}...`);

    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"Delhi MetroPulse" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `🚇 ${otp} is your Smart Metro Tracker Verification Code`,
      html: htmlContent,
    });

    logger.info(`Verification email sent successfully to ${email}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error(`Gmail SMTP send failed for ${email}: ${error.message}`);

    // Local dev fallback on SMTP failure
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      console.log('\n' + '='.repeat(60));
      console.log(`✉️  [LOCAL DEV SMTP FAILURE FALLBACK] OTP FOR: ${email}`);
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
