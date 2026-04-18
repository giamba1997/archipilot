import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const supabase = getAdminClient();

    // Get the Stripe customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      throw new Error("Aucun abonnement actif. Souscrivez d'abord un plan.");
    }

    // Create a Stripe Customer Portal session
    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: profile.stripe_customer_id,
        return_url: APP_URL,
      }),
    });

    const portal = await portalRes.json();
    if (portal.error) throw new Error(portal.error.message);

    return jsonResponse(req, { url: portal.url });
  } catch (err) {
    console.error("stripe-portal error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
