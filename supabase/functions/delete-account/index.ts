import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const supabase = getAdminClient();

    // 1. Delete user photos from storage
    const { data: files } = await supabase.storage
      .from("project-files")
      .list(user.id, { limit: 1000 });

    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      await supabase.storage.from("project-files").remove(paths);
    }

    // 2. Delete user data from all tables (cascade should handle most via FK)
    // Delete in order to respect foreign key constraints
    await supabase.from("analytics_events").delete().eq("user_id", user.id);
    await supabase.from("rate_limits").delete().eq("user_id", user.id);
    await supabase.from("notifications").delete().eq("user_id", user.id);
    await supabase.from("pv_sends").delete().eq("user_id", user.id);
    await supabase.from("comments").delete().eq("user_id", user.id);
    await supabase.from("project_members").delete().eq("user_id", user.id);
    await supabase.from("project_members").delete().eq("owner_id", user.id);
    await supabase.from("user_data").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);

    // 3. Delete the auth user account
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      throw new Error("Échec de la suppression du compte. Contactez le support.");
    }

    return jsonResponse(req, { success: true, message: "Compte supprimé avec succès." });
  } catch (err) {
    console.error("delete-account error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
