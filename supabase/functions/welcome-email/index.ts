import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function welcomeBody(firstName: string): string {
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
    'Welcome to the village.',
    '',
    '— Commons',
  ].join('\n');
}

async function sendWelcome(email: string, name: string): Promise<boolean> {
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
      text:    welcomeBody(firstName),
    }),
  });
  return res.ok;
}

serve(async (req: Request) => {
  try {
    const body = await req.json();

    // ── Mode 1: Auth webhook (new signup) ──────────────────────────────
    // Supabase sends { type: "INSERT", record: { email, raw_user_meta_data } }
    if (body?.type === 'INSERT' && body?.record?.email) {
      const email = body.record.email;
      const name  = body.record.raw_user_meta_data?.name ?? '';
      const ok    = await sendWelcome(email, name);
      return new Response(JSON.stringify({ sent: ok }), { status: ok ? 200 : 500 });
    }

    // ── Mode 2: Blast to existing users ───────────────────────────────
    // POST with { blast: true } — queries all profiles and emails them all
    if (body?.blast === true) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing service role env vars' }), { status: 500 });
      }
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Get all users from auth.users via admin API
      const { data: usersData, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

      const users = usersData?.users ?? [];
      let sent = 0, failed = 0;

      for (const user of users) {
        const email = user.email;
        const name  = user.user_metadata?.name ?? '';
        if (!email) { failed++; continue; }
        const ok = await sendWelcome(email, name);
        ok ? sent++ : failed++;
        // Small delay to avoid Resend rate limits
        await new Promise(r => setTimeout(r, 100));
      }

      return new Response(JSON.stringify({ sent, failed, total: users.length }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unrecognised payload' }), { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
