import { redirect } from "react-router";
import { authenticate, billing } from "../shopify.server";
import { updateStoreSettings } from "../mongo.server.js";

// Map plan name -> MongoDB plan value
const PLAN_MAP = {
  "Starter Plan": "starter",
  "Pro Plan": "pro",
};

// Called when merchant clicks an upgrade button
// ?plan=starter or ?plan=pro
export const loader = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const planParam = url.searchParams.get("plan"); // 'starter' | 'pro'

  // Map param -> billing plan name
  const planName = planParam === "starter" ? "Starter Plan" : "Pro Plan";

  // Initiate subscription — Shopify redirects merchant to confirm payment
  await billing.request({
    plan: planName,
    isTest: true, // change to false for production
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/confirm?plan=${planParam}&shop=${session.shop}`,
  });

  // billing.request() handles the redirect itself, but just in case:
  return redirect("/app");
};

export default function Billing() {
  return null;
}
