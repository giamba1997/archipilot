import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const supabase = getAdminClient();

    // Collect all user data for GDPR export
    const [
      { data: profile },
      { data: userData },
      { data: members },
      { data: notifications },
      { data: pvSends },
      { data: comments },
      { data: analytics },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("user_data").select("*").eq("user_id", user.id).single(),
      supabase.from("project_members").select("*").eq("user_id", user.id),
      supabase.from("notifications").select("*").eq("user_id", user.id),
      supabase.from("pv_sends").select("*").eq("user_id", user.id),
      supabase.from("comments").select("*").eq("user_id", user.id),
      supabase.from("analytics_events").select("*").eq("user_id", user.id),
    ]);

    const exportData = {
      _exportDate: new Date().toISOString(),
      _format: "ArchiPilot GDPR Data Export",
      _userId: user.id,
      _email: user.email,
      profile: profile || null,
      projects: userData?.projects || [],
      collaborations: members || [],
      notifications: notifications || [],
      pvSends: pvSends || [],
      comments: comments || [],
      analytics: analytics || [],
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    return new Response(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="archipilot-export-${user.id.slice(0, 8)}.json"`,
        ...corsHeaders(req),
      },
    });
  } catch (err) {
    console.error("export-data error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
