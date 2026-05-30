// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function: POST /api/send-otp
// Located at REPO ROOT /api/send-otp.js (Vercel reads from repo root)
//
// WHY THIS EXISTS:
//   Render free tier blocks all outbound SMTP (ports 25, 465, 587).
//   Vercel serverless functions run on AWS Lambda which does NOT block port 587.
//   So we do the email-sending here on Vercel, OTP verification stays on Render.
// ─────────────────────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

// ── MongoDB connection (cached across warm Lambda invocations) ─────────────
let cachedClient = null;

async function getDb() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

// ── Gmail SMTP transporter ─────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ── HTML Email Template ────────────────────────────────────────────────────
function buildEmailHtml(name, otp) {
  return `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:500px;margin:0 auto;padding:20px;border:1px solid #1e293b;border-radius:12px;background-color:#0f172a;color:#f8fafc;">
      <div style="text-align:center;border-bottom:1px solid #334155;padding-bottom:20px;margin-bottom:25px;">
        <span style="font-size:32px;">🚇</span>
        <h1 style="margin:10px 0 0 0;font-size:24px;color:#6366f1;font-weight:800;">Delhi MetroPulse</h1>
        <p style="margin:5px 0 0 0;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Email Verification</p>
      </div>
      <div style="padding:0 10px;">
        <h2 style="font-size:18px;margin-top:0;color:#ffffff;">Welcome, ${name}!</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.6;">
          Use the code below to verify your email and activate your Delhi MetroPulse account.
        </p>
        <div style="background-color:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;text-align:center;margin:25px 0;">
          <p style="margin:0 0 10px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#6366f1;font-weight:700;">Your One-Time Passcode</p>
          <span style="font-size:38px;font-weight:900;letter-spacing:8px;color:#ffffff;font-family:monospace;">${otp}</span>
          <p style="margin:10px 0 0 0;font-size:11px;color:#f43f5e;">Valid for 10 minutes</p>
        </div>
        <p style="color:#64748b;font-size:12px;">If you did not request this, please ignore it. Do not share this code.</p>
      </div>
      <div style="text-align:center;border-top:1px solid #334155;padding-top:15px;margin-top:30px;font-size:11px;color:#64748b;">
        <p style="margin:0;">© ${new Date().getFullYear()} Delhi MetroPulse. All rights reserved.</p>
      </div>
    </div>
  `;
}

// ── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS headers (allow frontend origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { userId, email, name } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ success: false, message: 'userId and email are required' });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ success: false, message: 'Email service not configured on Vercel' });
  }

  if (!process.env.MONGODB_URI) {
    return res.status(500).json({ success: false, message: 'Database not configured on Vercel' });
  }

  try {
    // Step 1: Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Step 2: Hash OTP and save to MongoDB
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const mongoClient = await getDb();
    const dbName = process.env.MONGODB_URI.split('/').pop().split('?')[0] || 'metro_tracker';
    const db = mongoClient.db(dbName);

    const updateResult = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { otp: hashedOtp, otpExpiresAt } }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Step 3: Send email via Gmail SMTP (Vercel allows port 587!)
    const transporter = createTransporter();
    const displayName = name || email.split('@')[0];

    await transporter.sendMail({
      from: `"Delhi MetroPulse" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `🚇 ${otp} is your Smart Metro Tracker Verification Code`,
      html: buildEmailHtml(displayName, otp),
    });

    return res.status(200).json({ success: true, message: 'Verification code sent successfully' });

  } catch (err) {
    console.error('[send-otp] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not send verification email. Please try again.' });
  }
};
