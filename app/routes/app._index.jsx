import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getStoreSettings, updateStoreSettings } from "../mongo.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const store = await getStoreSettings(session.shop);
  
  return { 
    store,
    apiKey: process.env.SHOPIFY_API_KEY,
    shopDomain: session.shop
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  
  if (actionType === "updatePrompt") {
    const systemPrompt = formData.get("systemPrompt");
    await updateStoreSettings(session.shop, { systemPrompt });
    return { success: true, message: "System prompt updated!" };
  }
  
  if (actionType === "upgradePlan") {
    const plan = formData.get("plan");
    await updateStoreSettings(session.shop, { plan });
    return { success: true, message: `Successfully upgraded to ${plan} plan!` };
  }

  return { error: "Unknown action" };
};

export default function Index() {
  const { store, apiKey, shopDomain } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [systemPrompt, setSystemPrompt] = useState(store?.systemPrompt || `You are a helpful AI customer support assistant for ${store?.shop}. Keep your answers concise and polite.`);

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const handleUpdatePrompt = () => {
    fetcher.submit({ actionType: "updatePrompt", systemPrompt }, { method: "POST" });
  };

  const handleUpgrade = (plan) => {
    fetcher.submit({ actionType: "upgradePlan", plan }, { method: "POST" });
  };

  return (
    <s-page heading="AI Chatbot Settings">
      <s-stack direction="block" gap="loose">
      
        {/* Section 1: Storefront Widget */}
        <s-section heading="Storefront Widget">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  Shopify requires merchants to explicitly enable app widgets. Click the button below to open your Theme Editor with the <strong>AI Chatbot</strong> automatically toggled on, then click Save.
                </s-text>
              </s-paragraph>
              <s-button 
                variant="primary"
                onClick={() => {
                  window.open(`https://${shopDomain}/admin/themes/current/editor?context=apps&appEmbed=${apiKey}/chatbot`, '_blank');
                }}
              >
                Enable Widget in Theme Editor
              </s-button>
            </s-stack>
          </s-box>
        </s-section>

        {/* Section 2: Overview */}
        <s-section heading="Current Plan & Usage">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text><strong>Current Plan:</strong> {store?.plan?.toUpperCase() || 'FREE'}</s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text><strong>Messages Used:</strong> {store?.messageCount || 0} / {store?.plan === 'free' ? '250' : (store?.plan === 'starter' ? '2000' : 'Unlimited')}</s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-section>

        {/* Section 2: Configuration */}
        <s-section heading="Chatbot Configuration">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>Customize how the AI talks to your customers by modifying the system prompt.</s-text>
              </s-paragraph>
              
              <div style={{ width: '100%', marginBottom: '1rem' }}>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                    fontFamily: 'inherit',
                    fontSize: '14px'
                  }}
                />
              </div>

              <s-button 
                onClick={handleUpdatePrompt} 
                variant="primary"
                {...(isLoading && fetcher.formData?.get("actionType") === "updatePrompt" ? { loading: true } : {})}
              >
                Save Prompt
              </s-button>
            </s-stack>
          </s-box>
        </s-section>

        {/* Section 3: Upgrade */}
        <s-section heading="Upgrade Plan">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading>Starter Plan</s-heading>
                <s-paragraph><s-text>2,000 Messages / Month</s-text></s-paragraph>
                <s-button 
                  onClick={() => handleUpgrade("starter")}
                  disabled={store?.plan === "starter"}
                  {...(isLoading && fetcher.formData?.get("plan") === "starter" ? { loading: true } : {})}
                >
                  {store?.plan === "starter" ? "Current Plan" : "Upgrade to Starter"}
                </s-button>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading>Pro Plan</s-heading>
                <s-paragraph><s-text>Unlimited Messages</s-text></s-paragraph>
                <s-button 
                  variant="primary"
                  onClick={() => handleUpgrade("pro")}
                  disabled={store?.plan === "pro"}
                  {...(isLoading && fetcher.formData?.get("plan") === "pro" ? { loading: true } : {})}
                >
                  {store?.plan === "pro" ? "Current Plan" : "Upgrade to Pro"}
                </s-button>
              </s-stack>
            </s-box>
          </div>
        </s-section>

      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
