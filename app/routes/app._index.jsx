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
    shopDomain: session.shop,
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
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

  if (actionType === "updateTraining") {
    const websiteUrl = formData.get("websiteUrl") ?? "";
    const faqs = formData.get("faqs") ?? "";
    await updateStoreSettings(session.shop, { websiteUrl, faqs });
    return { success: true, message: "Training data saved! The chatbot will use it on the next message." };
  }

  if (actionType === "updateAiKey") {
    const userApiKey = formData.get("userApiKey") ?? "";
    await updateStoreSettings(session.shop, { userApiKey: userApiKey.trim() });
    return { success: true, message: userApiKey.trim() ? "AI key saved! Your own key is now active." : "AI key cleared. Using demo mode." };
  }

  return { error: "Unknown action" };
};

export default function Index() {
  const { store, themeEditorUrl } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [systemPrompt, setSystemPrompt] = useState(
    store?.systemPrompt ||
      `You are a helpful AI customer support assistant for ${store?.shop}. Keep your answers concise and polite.`
  );
  const [websiteUrl, setWebsiteUrl] = useState(store?.websiteUrl || "");
  const [faqs, setFaqs] = useState(store?.faqs || "");
  // userApiKey is write-only in UI — never pre-filled to avoid leaking the key
  const [userApiKey, setUserApiKey] = useState("");

  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const handleUpdatePrompt = () => {
    fetcher.submit({ actionType: "updatePrompt", systemPrompt }, { method: "POST" });
  };

  const handleSaveTraining = () => {
    fetcher.submit({ actionType: "updateTraining", websiteUrl, faqs }, { method: "POST" });
  };

  const handleSaveAiKey = () => {
    fetcher.submit({ actionType: "updateAiKey", userApiKey }, { method: "POST" });
    setUserApiKey(""); // clear field after save for security
  };



  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontFamily: "inherit",
    fontSize: "14px",
    boxSizing: "border-box",
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: "120px",
    resize: "vertical",
  };

  return (
    <s-page heading="AI Chatbot Settings">
      <s-stack direction="block" gap="loose">
      
        {/* ── Section 1: Storefront Widget ── */}
        <s-section heading="Storefront Widget">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  To show the chat widget on your storefront, open your Theme Editor and enable <strong>Storefront Widget</strong> under App Embeds, then click Save.
                </s-text>
              </s-paragraph>
              <s-button 
                variant="primary"
                onClick={() => {
                  window.open(themeEditorUrl, "_top");
                }}
              >
                Enable Widget in Theme Editor
              </s-button>
            </s-stack>
          </s-box>
        </s-section>

        <s-section heading="Usage">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  <strong>Messages Used:</strong> {store?.messageCount || 0}
                  {!store?.userApiKey && (
                    <> &nbsp;/ 50 (demo limit — add your AI key below to remove limits)</>
                  )}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text tone="subdued">
                  Mode: {store?.userApiKey ? "✅ Your own AI key" : "🔓 Demo mode (shared key, 50 msg limit)"}
                </s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
        </s-section>

        {/* ── Section 3: Chatbot System Prompt ── */}
        <s-section heading="Chatbot Personality (System Prompt)">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  Set the AI's tone and personality. This is the base instruction the chatbot follows when talking to customers.
                </s-text>
              </s-paragraph>
              <div style={{ width: "100%", marginBottom: "0.5rem" }}>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  style={textareaStyle}
                />
              </div>
              <s-button
                onClick={handleUpdatePrompt}
                variant="primary"
                {...(isLoading && fetcher.formData?.get("actionType") === "updatePrompt"
                  ? { loading: true }
                  : {})}
              >
                Save Prompt
              </s-button>
            </s-stack>
          </s-box>
        </s-section>

        {/* ── Section 4: AI Training Data ── */}
        <s-section heading="AI Training Data">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  Train the AI with your store's specific information. The chatbot will use this — along with your live product catalog — to give accurate, relevant answers to customers.
                </s-text>
              </s-paragraph>

              {/* Website URL */}
              <s-paragraph>
                <s-text><strong>🌐 Store / Website URL</strong></s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>
                  Paste your website URL. The chatbot will reference it when customers ask where to find more information.
                </s-text>
              </s-paragraph>
              <div style={{ width: "100%", marginBottom: "0.5rem" }}>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourstore.com"
                  style={inputStyle}
                />
              </div>

              {/* FAQs */}
              <s-paragraph>
                <s-text><strong>❓ FAQs & Store Policies</strong></s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>
                  Add FAQs, return policies, shipping info, or any custom knowledge the chatbot should know.
                  Format as Q &amp; A pairs for best results.
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text tone="subdued">
                  Example:
                  {"\n"}Q: What is your return policy?
                  {"\n"}A: We offer 30-day hassle-free returns on all items.
                  {"\n"}Q: How long does shipping take?
                  {"\n"}A: Standard shipping is 3–5 business days.
                </s-text>
              </s-paragraph>
              <div style={{ width: "100%", marginBottom: "0.5rem" }}>
                <textarea
                  value={faqs}
                  onChange={(e) => setFaqs(e.target.value)}
                  placeholder={`Q: What is your return policy?\nA: We offer 30-day returns on all items.\n\nQ: How long does shipping take?\nA: 3-5 business days.`}
                  style={{ ...textareaStyle, minHeight: "180px" }}
                />
              </div>

              {/* Product catalog note */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-paragraph>
                  <s-text>
                    📦 <strong>Product Catalog:</strong> The chatbot automatically reads your store's products from Shopify and uses them to answer product questions. No setup needed — it updates every hour.
                  </s-text>
                </s-paragraph>
              </s-box>

              {/* Order tracking note */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-paragraph>
                  <s-text>
                    🚚 <strong>Order Tracking:</strong> Customers can ask about their order status (e.g. "Where is my order #1234?") and the chatbot will look it up automatically.
                  </s-text>
                </s-paragraph>
              </s-box>

              <s-button
                onClick={handleSaveTraining}
                variant="primary"
                {...(isLoading && fetcher.formData?.get("actionType") === "updateTraining"
                  ? { loading: true }
                  : {})}
              >
                Save Training Data
              </s-button>
            </s-stack>
          </s-box>
        </s-section>


        {/* ── Section 5: AI Settings ── */}
        <s-section heading="AI Settings">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  Add your own <strong>OpenRouter API key</strong> to use your own AI quota with no message limits.
                  Get a free key at{" "}
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text tone="subdued">
                  Your key is stored securely on the server and is never exposed to the storefront.
                  Leave blank to keep using the shared demo key (50 message limit).
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>
                  <strong>Status:</strong>{" "}
                  {store?.userApiKey
                    ? "✅ Your own AI key is active"
                    : "🔓 Using demo key (limited)"}
                </s-text>
              </s-paragraph>
              <div style={{ width: "100%", marginBottom: "0.5rem" }}>
                <input
                  type="password"
                  value={userApiKey}
                  onChange={(e) => setUserApiKey(e.target.value)}
                  placeholder={store?.userApiKey ? "••••••••••••••••  (key saved — paste new to replace)" : "sk-or-v1-..."}
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>
              <s-inline gap="base">
                <s-button
                  variant="primary"
                  onClick={handleSaveAiKey}
                  {...(isLoading && fetcher.formData?.get("actionType") === "updateAiKey"
                    ? { loading: true }
                    : {})}
                >
                  Save AI Key
                </s-button>
                {store?.userApiKey && (
                  <s-button
                    tone="critical"
                    onClick={() => {
                      setUserApiKey("");
                      fetcher.submit({ actionType: "updateAiKey", userApiKey: "" }, { method: "POST" });
                    }}
                  >
                    Remove Key (use demo)
                  </s-button>
                )}
              </s-inline>
            </s-stack>
          </s-box>
        </s-section>

      </s-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
