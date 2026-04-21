import { authenticate } from "../shopify.server";

// Called when merchant clicks an upgrade button: /app/billing?plan=starter|pro
export const loader = async ({ request }) => {
  // 'billing' comes from authenticate.admin(), NOT from shopify.server exports
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const planParam = url.searchParams.get("plan"); // 'starter' | 'pro'

  const planName = planParam === "starter" ? "Starter Plan" : "Pro Plan";

  // billing.request() throws a redirect response — Shopify takes over from here
  await billing.request({
    plan: planName,
    isTest: true, // Set to false before going live
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/confirm?plan=${planParam}&shop=${session.shop}`,
  });

  // Never reached — billing.request() always redirects
  return new Response(null, { status: 204 });
};

export default function Billing() {
  return null;
}
