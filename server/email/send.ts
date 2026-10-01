// Email transport — ported from WMS server/utils/sendEmail.js. Two modes chosen from server/.env:
//   1. SMTP  → set EMAIL_HOST (+ EMAIL_PORT / EMAIL_SECURE)
//   2. Gmail → leave EMAIL_HOST empty, set EMAIL_USER + EMAIL_PASS (an App Password)
import nodemailer from 'nodemailer';
import { config } from '../config';
import { APP_NAME, type EmailMessage } from './templates';

const { host, port, secure, user, pass, from } = config.email;

const transporter =
  user || host
    ? nodemailer.createTransport(host ? { host, port, secure, auth: user ? { user, pass } : undefined } : { service: 'gmail', auth: { user, pass } })
    : null;

export const emailMode = host ? `SMTP ${host}:${port}` : user ? 'Gmail' : 'off';

/** Check the settings at start-up, so a broken setup shows now rather than when someone forgets a password. */
export const verifyEmailTransport = async (): Promise<boolean> => {
  if (!transporter) return false;
  try {
    await transporter.verify();
    console.log(`📧 Email ready (${emailMode})`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Email not reachable (${emailMode}): ${message}`);
    if (/Invalid login|BadCredentials|535/i.test(message) && !host) {
      console.warn('   ↳ Gmail rejected the App Password — create a new one at myaccount.google.com/apppasswords and put it in EMAIL_PASS.');
    }
    return false;
  }
};

/** Send an email. Returns true when it went out, false otherwise (callers should check). */
export const sendEmail = async (to: string, { subject, html, text }: EmailMessage): Promise<boolean> => {
  if (!transporter) {
    console.warn(`Email not configured — skipped message to ${to}.`);
    return false;
  }
  try {
    await transporter.sendMail({ from: from || `"${APP_NAME}" <${user}>`, to, subject, html, text });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Email to ${to} failed (${emailMode}): ${message}`);
    if (/limit exceeded|rate limit|4\.7\.0|5\.4\.5/i.test(message)) {
      console.error('   ↳ Daily sending limit reached — it resets tomorrow. For a permanent fix set EMAIL_HOST to an SMTP server.');
    }
    return false;
  }
};
