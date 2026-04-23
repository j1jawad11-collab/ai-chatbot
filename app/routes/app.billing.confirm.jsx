import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { updateStoreSettings } from "../mongo.server.js";

// Shopify redirects here after merchant approves the subscription
export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const planParam = url.searchParams.get("plan");   // 'starter' | 'pro'
  const shop      = url.searchParams.get("shop") || session.shop;

  const planName = planParam === "starter" ? "Starter Plan" : "Pro Plan";
  const mongoValue = planParam === "starter" ? "starter" : "pro";

  try {
    // Verify the subscription is active before saving to MongoDB
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [planName],
      isTest: false,
    });

    if (hasActivePayment) {
      // Save new plan to MongoDB
      await updateStoreSettings(shop, { plan: mongoValue });
    }
  } catch (err) {
    console.error("Billing confirm error:", err);
  }

  // Always redirect back to the dashboard
  return redirect("/app");
};

export default function BillingConfirm() {
  return null;
}
