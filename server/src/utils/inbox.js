import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import db from '../db.js';
import { mailEnabled } from './mail.js';
import { applyInvitationResponse } from './invitation.js';

// Reads replies to invitation emails: a company replies "ACCEPT" (or "DECLINE") and gets its login emailed.
// Only looks at unread mail FROM companies whose invitation is still pending, so your other mail is never touched.

// The new text of a reply, without the quoted original (which itself contains the word ACCEPT).
export function replyText(body) {
  const out = [];
  for (const line of String(body || '').split(/\r?\n/)) {
    if (/^\s*>/.test(line) || /^\s*On .+wrote:?\s*$/i.test(line) || /^-{2,}\s*(Original|Forwarded)/i.test(line) || /^\s*From:\s/i.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

export function decide(text) {
  if (/\b(decline|declined|reject|not interested|no thanks)\b/i.test(text)) return 'declined';
  if (/\b(accept|accepted|yes|agree|confirm)\b/i.test(text)) return 'accepted';
  return null;
}

async function pollOnce() {
  const pending = db.prepare(`SELECT c.*, u.email FROM companies c JOIN users u ON u.id=c.user_id WHERE c.invitation_status IN ('invited','declined')`).all();
  if (!pending.length) return;
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, logger: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    for (const c of pending) {
      const uids = await client.search({ seen: false, from: c.email }, { uid: true });
      for (const uid of uids || []) {
        const msg = await client.fetchOne(uid, { source: true }, { uid: true });
        const mail = await simpleParser(msg.source);
        // The sender must really be that address (Gmail records SPF/DKIM results), not a spoofed From
        const auth = String(mail.headers.get('authentication-results') || '');
        const fromOk = (mail.from?.value || []).some(a => a.address?.toLowerCase() === c.email.toLowerCase());
        const decision = decide(replyText(mail.text));
        if (fromOk && /dkim=pass|spf=pass/i.test(auth) && decision) {
          const fresh = db.prepare('SELECT * FROM companies WHERE id=?').get(c.id);
          if (fresh.invitation_status === 'accepted' || (fresh.invitation_status === 'declined' && decision === 'declined')) { /* nothing to do */ }
          else { await applyInvitationResponse(fresh, decision, 'email reply'); console.log(`Invitation reply from ${c.email}: ${decision}`); }
        }
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      }
    }
  } finally { lock.release(); await client.logout(); }
}

export function startInboxWatcher() {
  if (!mailEnabled()) return;
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { await pollOnce(); } catch (e) { console.error('Inbox check failed:', e.message); } finally { running = false; }
  };
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000);
  console.log('Watching inbox for invitation replies (every 60s)');
}
