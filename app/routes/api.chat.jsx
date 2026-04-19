import { json } from "@remix-run/node";
import { getStoreSettings, incrementMessageCount } from "../mongo.server.js";
import OpenAI from "openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const { shop, message } = await request.json();

    if (!shop || !message) {
      return json({ error: "Missing required fields: shop and message" }, { status: 400, headers: corsHeaders });
    }

    // 1. Get Store Settings & Usage from MongoDB
    const store = await getStoreSettings(shop);
    
    // 2. Check limits (Free plan limit: 250 messages)
    if (store.plan === "free" && store.messageCount >= 250) {
      return json(
        { 
          reply: "You have reached your monthly limit of 250 messages on the free plan. Please upgrade to continue using the AI Chatbot." 
        }, 
        { status: 403, headers: corsHeaders }
      );
    }

    // 3. Process with OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: store.systemPrompt || `You are a helpful AI customer support assistant for ${shop}. Keep your answers concise and polite.` },
        { role: "user", content: message }
      ],
      max_tokens: 250,
    });

    const reply = completion.choices[0].message.content;

    // 4. Track usage in MongoDB
    await incrementMessageCount(shop);

    // 5. Return JSON object
    return json({ reply }, { headers: corsHeaders });

  } catch (error) {
    console.error("Error in API Chat:", error);
    return json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
}
