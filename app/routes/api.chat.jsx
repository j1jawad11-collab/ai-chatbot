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

// Primary and fallback models
const MODELS = [
  "gpt-oss-20b",
  "mistralai/mistral-7b-instruct:free",
  "huggingfaceh4/zephyr-7b-beta:free",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Try each model in sequence until one succeeds.
 */
async function callOpenRouter(messages, modelIndex = 0) {
  if (modelIndex >= MODELS.length) {
    throw new Error("All models failed. Please try again later.");
  }

  const model = MODELS[modelIndex];
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
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
    return callOpenRouter(messages, modelIndex + 1);
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
  // Base prompt from merchant settings
  let prompt =
    store.systemPrompt ||
    `You are a helpful AI customer support assistant for this store. Keep your answers concise and polite.`;

  // Website reference
  if (store.websiteUrl) {
    prompt += `\n\n## Store Website\n${store.websiteUrl}`;
  }

  // FAQs / training data
  if (store.faqs && store.faqs.trim()) {
    prompt += `\n\n## Store FAQs & Policies\n${store.faqs.trim()}`;
  }

  // Product catalog context
  prompt += buildProductContext(products);

  // Order context (only injected when the customer asked about a specific order)
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

    // 1. Get Store Settings & Usage from MongoDB
    const store = await getStoreSettings(shop);

    // 2. Check plan limits (Free: 250 messages)
    if (store.plan === "free" && store.messageCount >= 250) {
      return Response.json(
        {
          reply:
            "You have reached your monthly limit of 250 messages on the free plan. Please upgrade to continue using the AI Chatbot.",
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 3. Fetch product catalog (use MongoDB cache first, fallback to Shopify API)
    let products = await getCachedProducts(shop);
    if (!products) {
      products = await fetchStoreProducts(shop);
      if (products.length > 0) {
        await setCachedProducts(shop, products); // Cache for 1 hour
      }
    }

    // 4. Detect order tracking intent & fetch order if needed
    let order = null;
    const orderNumber = extractOrderNumber(message);
    if (orderNumber) {
      order = await fetchOrderByNumber(shop, orderNumber);
    }

    // 5. Build enriched system prompt
    const systemPrompt = buildSystemPrompt(store, products, order);

    // 6. Call OpenRouter with full context
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const reply = await callOpenRouter(messages);

    // 7. Track usage in MongoDB
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
