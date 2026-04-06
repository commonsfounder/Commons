import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function welcomeHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Welcome to Commons</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; background-color: #131E1E !important; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .card-padding { padding: 32px 24px !important; }
      .hero-text { font-size: 38px !important; }
      .action-card { padding: 14px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#131E1E;-webkit-font-smoothing:antialiased;">

<!-- PREVIEW TEXT -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
  You're in. Commons is your village. 10 tokens to get started.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#131E1E;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:48px 20px 40px;">

      <!-- EMAIL WRAPPER -->
      <table role="presentation" class="email-container" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- ═══ LOGO HEADER ═══ -->
        <tr>
          <td align="center" style="padding-bottom:40px;">
            <!-- Dots + arrows logo -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
              <tr>
                <!-- Dot 1 - full opacity -->
                <td style="vertical-align:middle;">
                  <div style="width:13px;height:13px;border-radius:50%;background-color:#2ABFBF;display:inline-block;"></div>
                </td>
                <!-- Arrow 1 -->
                <td style="vertical-align:middle;padding:0 7px;">
                  <img src="https://i.imgur.com/placeholder.png" width="0" height="0" style="display:none;" alt="">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:0;line-height:0;">
                        <svg width="22" height="10" viewBox="0 0 22 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                          <line x1="0" y1="5" x2="14" y2="5" stroke="#2ABFBF" stroke-width="1.5" stroke-linecap="round"/>
                          <polyline points="10,1.5 14.5,5 10,8.5" fill="none" stroke="#2ABFBF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Dot 2 - 60% opacity -->
                <td style="vertical-align:middle;">
                  <div style="width:13px;height:13px;border-radius:50%;background-color:#1e8f8f;display:inline-block;"></div>
                </td>
                <!-- Arrow 2 -->
                <td style="vertical-align:middle;padding:0 7px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:0;line-height:0;">
                        <svg width="22" height="10" viewBox="0 0 22 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                          <line x1="0" y1="5" x2="14" y2="5" stroke="#2ABFBF" stroke-width="1.5" stroke-linecap="round"/>
                          <polyline points="10,1.5 14.5,5 10,8.5" fill="none" stroke="#2ABFBF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Dot 3 - 30% opacity -->
                <td style="vertical-align:middle;">
                  <div style="width:13px;height:13px;border-radius:50%;background-color:#2ABFBF;opacity:0.28;display:inline-block;"></div>
                </td>
              </tr>
            </table>
            <!-- Wordmark -->
            <div style="margin-top:14px;">
              <span style="font-family:Georgia,'Playfair Display','Times New Roman',serif;font-size:28px;font-weight:700;color:#F0EDE6;letter-spacing:-0.5px;">Commons</span>
            </div>
          </td>
        </tr>

        <!-- ═══ MAIN CARD ═══ -->
        <tr>
          <td style="background-color:#1A2A2A;border-radius:20px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- Top teal accent bar -->
              <tr>
                <td style="background:linear-gradient(90deg,#2ABFBF 0%,#1a9090 60%,rgba(42,191,191,0) 100%);height:3px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>

              <!-- Card body -->
              <tr>
                <td class="card-padding" style="padding:44px 44px 40px;">

                  <!-- YOU'RE IN -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td>
                        <p class="hero-text" style="margin:0 0 6px;font-family:Georgia,'Playfair Display','Times New Roman',serif;font-size:46px;font-weight:700;color:#F0EDE6;line-height:1.1;letter-spacing:-1px;">
                          You're in.
                        </p>
                        <p style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:400;color:#2ABFBF;letter-spacing:0.3px;">
                          Welcome, ${firstName}.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- BODY TEXT -->
                  <p style="margin:0 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;color:#A8BFC0;line-height:1.75;">
                    Commons is your village. A community where people show up for each other — no money, no awkward obligations. Just people helping people.
                  </p>

                  <!-- TOKEN CALLOUT BOX -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px;">
                    <tr>
                      <td style="background-color:#111A1A;border:1px solid rgba(42,191,191,0.3);border-radius:14px;padding:20px 24px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;width:40px;">
                              <!-- Token icon circle -->
                              <div style="width:36px;height:36px;border-radius:50%;background-color:rgba(42,191,191,0.15);border:1px solid rgba(42,191,191,0.4);text-align:center;line-height:36px;font-size:16px;">
                                <span style="color:#2ABFBF;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">◈</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;padding-left:16px;">
                              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:500;color:#2ABFBF;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:3px;">Starting balance</p>
                              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#F0EDE6;">10 tokens</p>
                            </td>
                            <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
                              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#2ABFBF;opacity:0.7;">Ready to use</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- SECTION LABEL -->
                  <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#F4A261;text-transform:uppercase;letter-spacing:1.8px;">
                    Get started
                  </p>

                  <!-- ACTION CARDS -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
                    <!-- Step 1 -->
                    <tr>
                      <td style="border-radius:12px;">
                        <a href="https://joincommons.org" target="_blank" style="display:block;background-color:#111A1A;border-radius:12px;padding:16px 20px;text-decoration:none;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;width:32px;">
                              <div style="width:28px;height:28px;border-radius:50%;background-color:rgba(244,162,97,0.18);text-align:center;line-height:28px;">
                                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#F4A261;">1</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;padding-left:14px;">
                              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#F0EDE6;">Post something you can offer</p>
                              <p style="margin:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#6A8A8A;">Skills, time, a favour — anything helps.</p>
                            </td>
                          </tr>
                        </table>
                        </a>
                      </td>
                    </tr>
                    <tr><td style="height:8px;font-size:0;">&nbsp;</td></tr>
                    <!-- Step 2 -->
                    <tr>
                      <td style="border-radius:12px;">
                        <a href="https://joincommons.org" target="_blank" style="display:block;background-color:#111A1A;border-radius:12px;padding:16px 20px;text-decoration:none;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;width:32px;">
                              <div style="width:28px;height:28px;border-radius:50%;background-color:rgba(244,162,97,0.13);text-align:center;line-height:28px;">
                                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#F4A261;">2</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;padding-left:14px;">
                              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#F0EDE6;">Find someone who needs help</p>
                              <p style="margin:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#6A8A8A;">Browse requests from people around you.</p>
                            </td>
                          </tr>
                        </table>
                        </a>
                      </td>
                    </tr>
                    <tr><td style="height:8px;font-size:0;">&nbsp;</td></tr>
                    <!-- Step 3 -->
                    <tr>
                      <td style="border-radius:12px;">
                        <a href="https://joincommons.org" target="_blank" style="display:block;background-color:#111A1A;border-radius:12px;padding:16px 20px;text-decoration:none;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align:middle;width:32px;">
                              <div style="width:28px;height:28px;border-radius:50%;background-color:rgba(244,162,97,0.08);text-align:center;line-height:28px;">
                                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;color:#F4A261;opacity:0.7;">3</span>
                              </div>
                            </td>
                            <td style="vertical-align:middle;padding-left:14px;">
                              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#F0EDE6;">Connect with people near you</p>
                              <p style="margin:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#6A8A8A;">Join groups. Build your local network.</p>
                            </td>
                          </tr>
                        </table>
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- CTA BUTTON -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
                    <tr>
                      <td style="border-radius:12px;background-color:#2ABFBF;">
                        <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->
                        <a href="https://joincommons.org" target="_blank"
                           style="background-color:#2ABFBF;border-radius:12px;color:#1C2B2B;display:inline-block;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;padding:16px 36px;text-decoration:none;text-align:center;-webkit-text-size-adjust:none;letter-spacing:0.2px;">
                          Open Commons &rarr;
                        </a>
                        <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%">&nbsp;</i><![endif]-->
                      </td>
                    </tr>
                  </table>

                  <!-- SIGN OFF -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="border-top:1px solid rgba(240,237,230,0.08);padding-top:28px;">
                        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#A8BFC0;line-height:1.6;font-style:italic;">
                          Welcome to the village.
                        </p>
                        <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#F0EDE6;">
                          — Commons
                        </p>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ═══ FOOTER ═══ -->
        <tr>
          <td align="center" style="padding-top:32px;padding-bottom:8px;">
            <p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#3D5A5A;font-weight:500;">
              joincommons.org
            </p>
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#2E4A4A;line-height:1.6;">
              You're receiving this because you signed up for Commons.<br>
              <a href="https://joincommons.org/unsubscribe" style="color:#3D5A5A;text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- END EMAIL WRAPPER -->

    </td>
  </tr>
</table>

</body>
</html>`;
}

function welcomeText(firstName: string): string {
  return [
    `Hey ${firstName}, you're in.`,
    '',
    'Commons is a community where people show up for each other. No money, no awkward favours — just people helping people.',
    '',
    "You've got 10 tokens to get started. A few things you can do right now:",
    '· Post something you can offer',
    '· Browse what people need',
    '· Find people to connect with',
    '',
    'joincommons.org',
    '',
    'Welcome to the village.',
    '— Commons',
  ].join('\n');
}

async function sendWelcome(email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const firstName = name.split(' ')[0] || 'there';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    'Commons <hello@joincommons.org>',
      to:      email,
      subject: 'Welcome to Commons',
      html:    welcomeHtml(firstName),
      text:    welcomeText(firstName),
    }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: JSON.stringify(data) };
  return { ok: true };
}

serve(async (req: Request) => {
  try {
    const body = await req.json();

    // ── Mode 1: Auth webhook (new signup) ──────────────────────────────
    if (body?.type === 'INSERT' && body?.record?.email) {
      const email = body.record.email;
      const name  = body.record.raw_user_meta_data?.name ?? '';
      const result = await sendWelcome(email, name);
      return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
    }

    // ── Mode 2: Blast to existing users ───────────────────────────────
    if (body?.blast === true) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing service role env vars' }), { status: 500 });
      }
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: usersData, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

      const users = usersData?.users ?? [];
      let sent = 0;
      const errors: string[] = [];

      for (const user of users) {
        const email = user.email;
        const name  = user.user_metadata?.name ?? '';
        if (!email) { errors.push('no email for user ' + user.id); continue; }
        const result = await sendWelcome(email, name);
        if (result.ok) { sent++; } else { errors.push(`${email}: ${result.error}`); }
        await new Promise(r => setTimeout(r, 100));
      }

      return new Response(JSON.stringify({ sent, failed: errors.length, total: users.length, errors }), { status: 200 });
    }

    // ── Mode 3: Single test send ───────────────────────────────────────
    if (body?.test_email) {
      const result = await sendWelcome(body.test_email, body.name ?? 'there');
      return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500 });
    }

    return new Response(JSON.stringify({ error: 'Unrecognised payload' }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
