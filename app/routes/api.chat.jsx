import { getStoreSettings, incrementMessageCount } from "../mongo.server.js";
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
      max_tokens: 250,
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.warn(`Model ${model} failed (${error.message}), trying fallback...`);
    // Recursively try the next fallback model
    return callOpenRouter(messages, modelIndex + 1);
  }
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const { shop, message } = await request.json();

    if (!shop || !message) {
      return Response.json({ error: "Missing required fields: shop and message" }, { status: 400, headers: corsHeaders });
    }

    // 1. Get Store Settings & Usage from MongoDB
    const store = await getStoreSettings(shop);

    // 2. Check limits (Free plan limit: 250 messages)
    if (store.plan === "free" && store.messageCount >= 250) {
      return Response.json(
        {
          reply: "You have reached your monthly limit of 250 messages on the free plan. Please upgrade to continue using the AI Chatbot.",
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 3. Process with OpenRouter (with automatic fallback)
    const messages = [
      {
        role: "system",
        content: store.systemPrompt || `You are a helpful AI customer support assistant for ${shop}. Keep your answers concise and polite.`,
      },
      { role: "user", content: message },
    ];

    const reply = await callOpenRouter(messages);

    // 4. Track usage in MongoDB
    await incrementMessageCount(shop);

    // 5. Return JSON object
    return Response.json({ reply }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error in API Chat:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
