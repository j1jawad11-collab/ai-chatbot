/**
 * shopify-api.server.js
 * Helpers for calling the Shopify Admin REST API using the offline session
 * stored in the MongoDB database by the Shopify auth library.
 *
 * These functions are used inside the App Proxy chat endpoint (api.chat.jsx)
 * where there is no live admin session — only the shop domain from the request body.
 */

import { connectToMongoDB } from "./mongo.server.js";

const API_VERSION = "2025-10";

/**
 * Retrieve the offline access token for a shop from MongoDB.
 * Shopify stores the offline session with isOnline = false.
 */
async function getOfflineToken(shop) {
  const database = await connectToMongoDB();
  const sessions = database.collection("shopify_sessions");
  
  const session = await sessions.findOne({ shop, isOnline: false });
  return session?.accessToken ?? null;
}

/**
 * Fetch up to `limit` products from the Shopify Admin REST API.
 * Returns a simplified array: [{ title, price, handle, description }]
 */
export async function fetchStoreProducts(shop, limit = 20) {
  const token = await getOfflineToken(shop);
  if (!token) {
    console.warn(`[shopify-api] No offline session found for ${shop}`);
    return [];
  }

  try {
    const url = `https://${shop}/admin/api/${API_VERSION}/products.json?limit=${limit}&fields=id,title,handle,variants,body_html`;
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      console.warn(`[shopify-api] Products fetch failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const products = data.products ?? [];

    // Flatten to lightweight objects for the system prompt
    return products.map((p) => ({
      title: p.title,
      handle: p.handle,
      price: p.variants?.[0]?.price ?? null,
      description: p.body_html
        ? p.body_html.replace(/<[^>]+>/g, "").slice(0, 120)
        : "",
    }));
  } catch (err) {
    console.error(`[shopify-api] fetchStoreProducts error:`, err.message);
    return [];
  }
}

/**
 * Fetch a single order by its number (e.g. 1001 or "#1001") from Shopify.
 * Returns a simplified order object or null if not found.
 */
export async function fetchOrderByNumber(shop, orderNumber) {
  const token = await getOfflineToken(shop);
  if (!token) return null;

  // Shopify expects the order name as "#1001"
  const name = String(orderNumber).startsWith("#")
    ? orderNumber
    : `#${orderNumber}`;

  try {
    const url = `https://${shop}/admin/api/${API_VERSION}/orders.json?name=${encodeURIComponent(name)}&status=any&fields=id,name,financial_status,fulfillment_status,line_items,created_at,shipping_address`;
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!res.ok) {
      console.warn(`[shopify-api] Order fetch failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const order = data.orders?.[0];
    if (!order) return null;

    return {
      name: order.name,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status ?? "unfulfilled",
      items: order.line_items?.map((i) => i.name).join(", ") ?? "",
      createdAt: order.created_at
        ? new Date(order.created_at).toLocaleDateString()
        : "",
    };
  } catch (err) {
    console.error(`[shopify-api] fetchOrderByNumber error:`, err.message);
    return null;
  }
}
