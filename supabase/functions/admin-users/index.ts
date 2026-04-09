import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1. Verify caller is logged in
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return json({ error: "Код оруулна уу." }, 400);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 2. Fetch the code row
    const { data: codeRow, error: fetchErr } = await adminClient
      .from("premium_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!codeRow) return json({ error: "Код олдсонгүй." }, 404);
    if (codeRow.used_by) return json({ error: "Энэ код аль хэдийн ашиглагдсан." }, 409);

    // 3. Atomically consume the code — verify update actually claimed it
    const { data: consumedRow, error: updateErr } = await adminClient
      .from("premium_codes")
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq("code", codeRow.code)
      .is("used_by", null) // only update if still unclaimed
      .select("code")
      .maybeSingle();

    if (updateErr) throw updateErr;

    if (!consumedRow) {
      // Another request claimed it between our fetch and update
      return json({ error: "Энэ код аль хэдийн ашиглагдсан." }, 409);
    }

    // 4. Calculate premiumUntil — extend from existing expiry if user is already premium
    const months = codeRow.months || 3;
    const currentPremiumUntil =
      typeof user.user_metadata?.premiumUntil === "number"
        ? user.user_metadata.premiumUntil
        : 0;
    const base = Math.max(Date.now(), currentPremiumUntil);
    const premiumUntil = base + months * 30 * 24 * 60 * 60 * 1000;

    // 5. Grant premium
    const { error: grantErr } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: { premium: true, premiumUntil }
    });
    if (grantErr) throw grantErr;

    return json({ ok: true, months, premiumUntil });

  } catch (err) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});
