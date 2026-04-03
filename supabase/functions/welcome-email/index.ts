import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

serve(async (req: Request) => {
  try {
    const body = await req.json();
    // Supabase Auth webhook sends the new user record under `record`
    const record = body?.record ?? body;

    const email     = record?.email ?? '';
    const fullName  = record?.raw_user_meta_data?.name ?? record?.user_metadata?.name ?? '';
    const firstName = fullName.split(' ')[0] || 'there';

    if (!email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), { status: 400 });
    }

    const emailBody = [
      `Hey ${firstName}, you're in.`,
      '',
      'Commons is a community where people show up for each other. No money, no awkward favours — just people helping people.',
      '',
      "You've got 10 tokens to get started. A few things you can do right now: post something you can offer, browse what people need, find people to connect with.",
      '',
      'Welcome to the village.',
      '',
      '— Commons',
    ].join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Commons <hello@joincommons.org>',
        to:   email,
        subject: 'Welcome to Commons',
        text: emailBody,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify({ success: res.ok, resend: data }), {
      status: res.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
