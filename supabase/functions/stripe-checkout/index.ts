import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { authenticateUser, getAdminClient } from "../_shared/auth.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_URL = Deno.env.get("APP_URL") || "https://archipilot-delta.vercel.app";

/** Stripe price IDs — to be configured in Stripe Dashboard */
const PRICE_IDS: Record<string, Record<string, string>> = {
  pro: {
    month: Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID") || "price_pro_monthly",
    year: Deno.env.get("STRIPE_PRO_YEARLY_PRICE_ID") || "price_pro_yearly",
  },
  team: {
    month: Deno.env.get("STRIPE_TEAM_MONTHLY_PRICE_ID") || "price_team_monthly",
    year: Deno.env.get("STRIPE_TEAM_YEARLY_PRICE_ID") || "price_team_yearly",
  },
};

serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const user = await authenticateUser(req);
    const { plan, period = "month" } = await req.json();

    if (!plan || !PRICE_IDS[plan]) {
      throw new Error("Plan invalide. Choisissez 'pro' ou 'team'.");
    }

    const priceId = PRICE_IDS[plan][period];
    if (!priceId) throw new Error("Période invalide.");

    const supabase = getAdminClient();

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: user.email,
          "metadata[user_id]": user.id,
        }),
      });

      const customer = await customerRes.json();
      if (customer.error) throw new Error(customer.error.message);
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create Stripe Checkout session
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${APP_URL}?checkout=success`,
        cancel_url: `${APP_URL}?checkout=cancel`,
        "metadata[user_id]": user.id,
        "metadata[plan]": plan,
        "subscription_data[metadata][user_id]": user.id,
        "subscription_data[metadata][plan]": plan,
      }),
    });

    const session = await sessionRes.json();
    if (session.error) throw new Error(session.error.message);

    return jsonResponse(req, { url: session.url });
  } catch (err) {
    console.error("stripe-checkout error:", err);
    return jsonResponse(req, { error: err.message }, 400);
  }
});
