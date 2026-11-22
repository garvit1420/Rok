import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db.js';
import { notifyRole } from './notify.js';
import { sendCredentialsEmail } from './mail.js';

// Records a company's answer to the invitation. On "accepted" it creates a password and emails the login details.
// Shared by the email Accept/Decline buttons and by replies read from the inbox.
export async function applyInvitationResponse(c, decision, via = 'email') {
  if (decision === 'declined') {
    db.prepare('UPDATE companies SET invitation_status=? WHERE id=?').run('declined', c.id);
    notifyRole('tpo', 'Invitation declined', `${c.name} has declined the placement invitation (${via}).`);
    return { decision };
  }
  db.prepare('UPDATE companies SET invitation_status=? WHERE id=?').run('accepted', c.id);
  notifyRole('tpo', 'Invitation accepted', `${c.name} has accepted the placement invitation (${via}).`);
  const u = db.prepare('SELECT id, email FROM users WHERE id=?').get(c.user_id);
  const pw = crypto.randomBytes(5).toString('hex');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pw, 10), u.id);
  const mail = await sendCredentialsEmail({ to: u.email, company: c.name, tempPassword: pw });
  notifyRole('tpo', 'Company login sent', mail.sent ? `Login details were emailed to ${c.name} (${u.email}).` : `Could not email login details to ${c.name} (${u.email}).`);
  return { decision, email: u.email, mailSent: mail.sent, password: mail.sent ? null : pw };
}
