import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const payload = await req.json();

    // Only handle new profile inserts
    if (payload.type !== "INSERT" || !payload.record) {
      return new Response("ok", { status: 200 });
    }

    const profile = payload.record;
    const firstName = profile.name.split(" ")[0];
    const balance = profile.balance ?? 50;

    // Get the user's email from auth.users via admin client
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !user?.email) {
      console.error("Could not get user email:", error);
      return new Response("no email", { status: 200 });
    }

    const text = [
      `Hey ${firstName},`,
      ``,
      `You're in.`,
      ``,
      `Commons is a community where people show up for each other. No money, no awkward favours — just people helping people.`,
      ``,
      `Here's how it works: earn tokens by contributing, spend tokens when you need something. The chain keeps moving.`,
      ``,
      `You've got ${balance} tokens to get started. Use them well.`,
      ``,
      `A few things you can do right now:`,
      `— Post something you can offer`,
      `— Browse what people need`,
      `— Add people you know`,
      ``,
      `Welcome to the village.`,
      ``,
      `— Commons`,
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Commons <hello@joincommons.org>",
        to: user.email,
        subject: "Welcome to Commons",
        text,
      }),
    });

    const data = await res.json();
    console.log("Resend response:", JSON.stringify(data));
    return new Response(JSON.stringify(data), { status: 200 });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
