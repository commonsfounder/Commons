// Commons — one-time onboarding email to all existing users
// Run with: node send_onboarding.js
//
// Requirements:
//   npm install @supabase/supabase-js resend
//
// Fill in your keys below before running.

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://ytkdhtuxzumplvpygrvi.supabase.co';
const SUPABASE_SERVICE_KEY = 'PASTE_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE'; // NOT the anon key
const RESEND_API_KEY   = 'PASTE_YOUR_RESEND_API_KEY_HERE';
const FROM_EMAIL       = 'hello@joincommons.org';
const FROM_NAME        = 'Commons';
// ─────────────────────────────────────────────────────────────────────────────

const db     = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

function emailHtml(name) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(28,43,43,0.1);">

    <!-- Header -->
    <div style="background:#F7F5F0;padding:32px 40px 24px;text-align:center;border-bottom:1px solid rgba(28,43,43,0.08);">
      <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:12px;">
        <div style="width:10px;height:10px;border-radius:50%;background:#2ABFBF;display:inline-block;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#2ABFBF;opacity:0.6;display:inline-block;"></div>
        <div style="width:10px;height:10px;border-radius:50%;background:#2ABFBF;opacity:0.3;display:inline-block;"></div>
      </div>
      <div style="font-family:Georgia,serif;font-size:28px;font-weight:700;color:#1C2B2B;letter-spacing:-0.5px;">Commons</div>
      <div style="font-size:13px;color:#7A9090;margin-top:4px;">Find your village.</div>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="font-size:16px;color:#1C2B2B;margin:0 0 16px;line-height:1.6;">
        Hi ${name},
      </p>
      <p style="font-size:15px;color:#1C2B2B;margin:0 0 16px;line-height:1.6;">
        Commons is live — and your community is waiting.
      </p>
      <p style="font-size:14px;color:#7A9090;margin:0 0 24px;line-height:1.7;">
        Help someone with something they need, earn tokens. Need something yourself, spend them. No money changes hands — just people looking out for each other.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0;">
        <a href="https://joincommons.org" style="background:#2ABFBF;color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;letter-spacing:0.2px;">
          Open Commons
        </a>
      </div>

      <p style="font-size:13px;color:#7A9090;margin:24px 0 0;line-height:1.7;">
        Pass it on.<br>
        — The Commons team
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F7F5F0;padding:20px 40px;border-top:1px solid rgba(28,43,43,0.08);text-align:center;">
      <p style="font-size:11px;color:#7A9090;margin:0;line-height:1.6;">
        You're receiving this because you have a Commons account.<br>
        <a href="https://joincommons.org" style="color:#2ABFBF;text-decoration:none;">joincommons.org</a>
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

async function main() {
  console.log('Fetching users from Supabase...');

  // Pull all profiles (name + id)
  const { data: profiles, error: profilesErr } = await db
    .from('profiles')
    .select('id, name');

  if (profilesErr) {
    console.error('Error fetching profiles:', profilesErr.message);
    process.exit(1);
  }

  console.log(`Found ${profiles.length} profiles. Fetching emails from auth...`);

  // Pull emails from auth.users using service role
  const { data: { users }, error: usersErr } = await db.auth.admin.listUsers({ perPage: 1000 });

  if (usersErr) {
    console.error('Error fetching auth users:', usersErr.message);
    process.exit(1);
  }

  // Map id → email
  const emailMap = {};
  users.forEach(u => { emailMap[u.id] = u.email; });

  // Merge
  const recipients = profiles
    .map(p => ({ name: p.name, email: emailMap[p.id] }))
    .filter(r => r.email);

  console.log(`Sending to ${recipients.length} users...\n`);

  let sent = 0, failed = 0;

  for (const r of recipients) {
    try {
      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: r.email,
        subject: 'Your Commons community is waiting',
        html: emailHtml(r.name),
      });
      console.log(`✓ ${r.email}`);
      sent++;
      // Small delay to avoid rate limits
      await new Promise(res => setTimeout(res, 100));
    } catch (err) {
      console.error(`✗ ${r.email} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${sent} sent, ${failed} failed.`);
}

main();
