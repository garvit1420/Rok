import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { SECRET } from '../auth.js';

// Free email via any SMTP account (e.g. a Gmail address + App Password). Configure in server/.env
// (see .env.example). With no SMTP_USER/SMTP_PASS set, emailing is disabled and the app keeps working.
export const mailEnabled = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport;
const getTransport = () => transport ||= nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled()) return { sent: false, reason: 'Email is not configured on the server (set SMTP_USER and SMTP_PASS)' };
  try {
    await getTransport().sendMail({ from: process.env.MAIL_FROM || `"MBM Placement Cell" <${process.env.SMTP_USER}>`, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    console.error('Mail failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

const btn = (href, color, label) => `<a href="${esc(href)}" style="background:${color};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${label}</a>`;
const SIGN = 'Training & Placement Cell, MBM University, Jodhpur';

// 1) Invitation: Accept / Decline buttons only (no password yet)
export function sendInvitationEmail({ to, company, companyId, hrName, message }) {
  const url = process.env.APP_URL || 'http://localhost:5173';
  const token = jwt.sign({ cid: companyId, purpose: 'invite' }, SECRET, { expiresIn: '30d' });
  const yes = `${url}/api/invite/respond?decision=accepted&token=${token}`, no = `${url}/api/invite/respond?decision=declined&token=${token}`;
  const msg = message || 'You are invited to participate in the campus placements at MBM University, Jodhpur.';
  const text = `Dear ${hrName || 'HR Team'},\n\n${msg}\n\nTO ACCEPT: simply reply to this email with the word ACCEPT (or DECLINE). Your login details will be emailed to you right away.\n\nOr use these links:\nACCEPT:  ${yes}\nDECLINE: ${no}\n\nRegards,\n${SIGN}`;
  const html = `<p>Dear ${esc(hrName || 'HR Team')},</p><p>${esc(msg).replace(/\n/g, '<br>')}</p>
<p>Invitation for <b>${esc(company)}</b>:</p><p style="font-size:16px"><b>To accept, simply reply to this email with the word ACCEPT</b> (or DECLINE). Your login details will be emailed to you right away.</p>
<p>Or click: ${btn(yes, '#16a34a', 'Accept')}&nbsp;&nbsp;${btn(no, '#dc2626', 'Decline')}</p><p>Regards,<br>${esc(SIGN)}</p>`;
  return sendMail({ to, subject: 'Placement invitation – MBM University, Jodhpur', text, html });
}

// 2) After acceptance: login details so the company can fill in its details
export function sendCredentialsEmail({ to, company, tempPassword }) {
  const url = process.env.APP_URL || 'http://localhost:5173';
  const text = `Thank you for accepting the placement invitation for ${company}.\n\nYour login details:\nLogin: ${url}/login\nEmail: ${to}\nPassword: ${tempPassword}\n\nNext steps: log in, open "Profile" and fill in your company details (HR name, phone, website, about), then submit your drive.\nPlease change your password after logging in.\n\nRegards,\n${SIGN}`;
  const html = `<p>Thank you for accepting the placement invitation for <b>${esc(company)}</b>.</p>
<p><b>Your login details</b><br>Login: <a href="${esc(url)}/login">${esc(url)}/login</a><br>Email: <b>${esc(to)}</b><br>Password: <b>${esc(tempPassword)}</b></p>
<p><b>Next steps:</b> log in, open <i>Profile</i> and fill in your company details (HR name, phone, website, about), then submit your drive. Please change your password after logging in.</p>
<p>Regards,<br>${esc(SIGN)}</p>`;
  return sendMail({ to, subject: 'Your placement portal login – MBM University, Jodhpur', text, html });
}
