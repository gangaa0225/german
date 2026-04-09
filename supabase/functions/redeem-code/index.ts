import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAILS = ["gangaa0225@gmail.com"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response("Unauthorized", { status: 401 });

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return new Response("Unauthorized", { status: 401 });
    if (!ADMIN_EMAILS.includes(user.email!)) return new Response("Forbidden", { status: 403 });

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, userId, premiumUntil, months } = await req.json();

    if (action === "list") {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw error;
      return new Response(JSON.stringify({ users: data.users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "grant") {
      if (!userId || !premiumUntil || typeof premiumUntil !== "number") {
        return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { premium: true, premiumUntil }
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "revoke") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { premium: false, premiumUntil: null }
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Admin-only: generate a premium code
    if (action === "generate-code") {
      if (!months || typeof months !== "number" || ![3, 6, 12].includes(months)) {
        return new Response(JSON.stringify({ error: "Invalid months value" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const code = "GERMAN-" + crypto.randomUUID().replace(/-/g, "").substring(0, 6).toUpperCase();
      const { error } = await adminClient.from("premium_codes").insert([{ code, months }]);
      if (error) throw error;
      return new Response(JSON.stringify({ code }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response("Unknown action", { status: 400 });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
