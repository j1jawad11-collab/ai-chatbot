import { authenticate } from "../shopify.server";
import { connectToMongoDB } from "../mongo.server.js";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    // Delete sessions from MongoDB
    const database = await connectToMongoDB();
    const sessions = database.collection("shopify_sessions");
    await sessions.deleteMany({ shop });
  }

  return new Response();
};

