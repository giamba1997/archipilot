import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getAdminClient } from "../_shared/auth.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

/** Verify Stripe webhook signature using the raw body and Stripe-Signature header. */
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(",").reduce((acc: Record<string, string>, part) => {
    const [key, value] = part.split("=");
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, "0")).join("");

  return expectedHex === sig;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  // Verify webhook signature
  const isValid = await verifySignature(body, signature, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error("Invalid Stripe webhook signature");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);
  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          await supabase
            .from("profiles")
            .update({
              plan,
              stripe_subscription_id: session.subscription,
              stripe_customer_id: session.customer,
            })
            .eq("id", userId);
          console.log(`User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;
        if (userId) {
          const status = subscription.status;
          if (status === "active" || status === "trialing") {
            const plan = subscription.metadata?.plan || "pro";
            await supabase.from("profiles").update({ plan }).eq("id", userId);
          } else if (status === "past_due" || status === "unpaid") {
            // Keep plan but flag as past_due — could show a warning in the UI
            console.log(`User ${userId} subscription is ${status}`);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.user_id;
        if (userId) {
          await supabase
            .from("profiles")
            .update({
              plan: "free",
              stripe_subscription_id: null,
            })
            .eq("id", userId);
          console.log(`User ${userId} downgraded to free`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
