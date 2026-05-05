import {
  getStoreSettings,
  incrementMessageCount,
  getCachedProducts,
  setCachedProducts,
} from "../mongo.server.js";
import { fetchStoreProducts, fetchOrderByNumber } from "../shopify-api.server.js";
import OpenAI from "openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Demo message limit when merchant hasn't added their own key
const DEMO_MESSAGE_LIMIT = 50;

// Primary and fallback models
const MODELS = [
  "gpt-oss-20b",
  "mistralai/mistral-7b-instruct:free",
  "huggingfaceh4/zephyr-7b-beta:free",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Try each model in sequence until one succeeds.
 * apiKey is resolved per-request (merchant key OR demo key) — never hardcoded.
 */
async function callOpenRouter(messages, apiKey, modelIndex = 0) {
  if (modelIndex >= MODELS.length) {
    throw new Error("All models failed. Please try again later.");
  }

  const model = MODELS[modelIndex];
  const openai = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://shopify-ai-chatbot.app",
      "X-Title": "Shopify AI Chatbot",
    },
  });

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 300,
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.warn(`Model ${model} failed (${error.message}), trying fallback...`);
    return callOpenRouter(messages, apiKey, modelIndex + 1);
  }
}

/**
 * Detect an order number in a customer message.
 * Matches: "order #1234", "#1234", "order 1234", "order number 1234"
 */
function extractOrderNumber(message) {
  const match = message.match(/(?:order\s*(?:number|#)?\s*#?)(\d{3,})/i);
  return match ? match[1] : null;
}

/**
 * Build a product summary string for the system prompt (max 20 products).
 */
function buildProductContext(products) {
  if (!products?.length) return "";
  const lines = products.slice(0, 20).map((p) => {
    const price = p.price ? ` — $${p.price}` : "";
    const desc = p.description ? ` (${p.description.trim()})` : "";
    return `• ${p.title}${price}${desc}`;
  });
  return `\n\n## Store Products\n${lines.join("\n")}`;
}

/**
 * Build the full enriched system prompt from store settings + live data.
 */
function buildSystemPrompt(store, products, order) {
  let prompt =
    store.systemPrompt ||
    `You are a helpful AI customer support assistant for this store. Keep your answers concise and polite.`;

  if (store.websiteUrl) {
    prompt += `\n\n## Store Website\n${store.websiteUrl}`;
  }

  if (store.faqs && store.faqs.trim()) {
    prompt += `\n\n## Store FAQs & Policies\n${store.faqs.trim()}`;
  }

  prompt += buildProductContext(products);

  if (order) {
    prompt += `\n\n## Order Lookup Result\nOrder ${order.name}: Payment — ${order.financialStatus}, Shipping — ${order.fulfillmentStatus}, Items — ${order.items}, Placed on ${order.createdAt}. Share this with the customer accurately.`;
  }

  prompt +=
    "\n\nAlways answer based on the store information above. If you don't know something, say so politely and suggest they contact support.";

  return prompt;
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const { shop, message } = await request.json();

    if (!shop || !message) {
      return Response.json(
        { error: "Missing required fields: shop and message" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Load store settings from MongoDB
    const store = await getStoreSettings(shop);

    // 2. Decide which API key to use — resolved server-side, never exposed to client
    const usingMerchantKey = !!(store.userApiKey && store.userApiKey.trim());
    const apiKey = usingMerchantKey
      ? store.userApiKey.trim()
      : process.env.DEMO_AI_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 503, headers: corsHeaders }
      );
    }

    // 3. Enforce demo message limit (only applies when using the shared demo key)
    if (!usingMerchantKey && store.messageCount >= DEMO_MESSAGE_LIMIT) {
      return Response.json(
        {
          reply:
            `You've reached the ${DEMO_MESSAGE_LIMIT}-message demo limit. ` +
            "The store owner can add their own AI API key in the chatbot settings to remove this limit.",
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 4. Fetch product catalog (MongoDB cache → Shopify API fallback)
    let products = await getCachedProducts(shop);
    if (!products) {
      products = await fetchStoreProducts(shop);
      if (products.length > 0) {
        await setCachedProducts(shop, products); // Cache for 1 hour
      }
    }

    // 5. Detect order tracking intent & fetch order if needed
    let order = null;
    const orderNumber = extractOrderNumber(message);
    if (orderNumber) {
      order = await fetchOrderByNumber(shop, orderNumber);
    }

    // 6. Build enriched system prompt
    const systemPrompt = buildSystemPrompt(store, products, order);

    // 7. Call OpenRouter with the resolved API key
    const chatMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const reply = await callOpenRouter(chatMessages, apiKey);

    // 8. Track usage in MongoDB (always, regardless of key source)
    await incrementMessageCount(shop);

    return Response.json({ reply }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in API Chat:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
