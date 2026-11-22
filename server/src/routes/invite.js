import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { SECRET } from '../auth.js';
import { applyInvitationResponse } from '../utils/invitation.js';

// Public one-click invitation response used by the buttons in the invitation email.
// GET only shows a confirm button (so email link scanners cannot trigger a decision); POST records it.
const r = Router();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = body => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Placement invitation</title>
<body style="font-family:system-ui,sans-serif;background:#f1f5f9;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;padding:32px;border-radius:12px;max-width:420px;box-shadow:0 2px 12px #0001;text-align:center">${body}</div></body>`;
const verify = t => { try { const p = jwt.verify(t, SECRET); return p.purpose === 'invite' ? p : null; } catch { return null; } };
const find = token => { const p = verify(token); return p && db.prepare('SELECT * FROM companies WHERE id=?').get(p.cid); };
const OK = ['accepted', 'declined'];

r.get('/respond', (req, res) => {
  const { token, decision } = req.query;
  const c = find(token);
  if (!c || !OK.includes(decision)) return res.status(400).send(page('<h2>Invalid or expired link</h2><p>Please log in to the portal to respond.</p>'));
  const accept = decision === 'accepted';
  res.send(page(`<h2>${accept ? 'Accept' : 'Decline'} invitation?</h2><p><b>${esc(c.name)}</b> — campus placements, MBM University, Jodhpur</p>
<form method="post" action="respond"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="decision" value="${esc(decision)}">
<button style="background:${accept ? '#16a34a' : '#dc2626'};color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:16px;cursor:pointer">Yes, ${accept ? 'accept' : 'decline'}</button></form>`));
});

r.post('/respond', async (req, res) => {
  const { token, decision } = req.body;
  const c = find(token);
  if (!c || !OK.includes(decision)) return res.status(400).send(page('<h2>Invalid or expired link</h2>'));
  // A response can only be recorded while pending (or to change a decline to accept) - stops the link being reused to reset the password
  if (c.invitation_status === 'accepted') return res.send(page('<h2>Already accepted</h2><p>Your login details were already emailed to you. Please check your inbox (and spam).</p>'));
  if (c.invitation_status === 'declined' && decision === 'declined') return res.send(page('<h2>Invitation declined</h2>'));
  const out = await applyInvitationResponse(c, decision);
  if (decision === 'declined') return res.send(page('<h2>Invitation declined</h2><p>Thank you. The TPO cell has been notified.</p>'));
  res.send(page(out.mailSent
    ? `<h2>✓ Invitation accepted</h2><p>Your login details have been emailed to <b>${esc(out.email)}</b>. Log in, fill in your company details and submit your drive.</p>`
    : `<h2>✓ Invitation accepted</h2><p>We could not send the email. Your login:</p><p><b>${esc(out.email)}</b><br>Password: <b>${esc(out.password)}</b></p>`));
});
export default r;
