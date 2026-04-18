import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 1x1 transparent PNG
const PIXEL = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualAQAAAABJRU5ErkJggg=="
), c => c.charCodeAt(0));

serve(async (req) => {
  const url = new URL(req.url);
  const pvId = url.searchParams.get("pvId");

  if (pvId) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from("pv_reads").insert({
        pv_id: pvId,
        read_at: new Date().toISOString(),
        ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
        user_agent: req.headers.get("user-agent") || "",
      });
    } catch (e) {
      console.error("track-pv-read error:", e);
    }
  }

  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
});
