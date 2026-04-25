import { authenticate } from "../shopify.server";
import { connectToMongoDB } from "../mongo.server.js";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    const database = await connectToMongoDB();
    const sessions = database.collection("shopify_sessions");
    
    await sessions.updateOne(
      { id: session.id },
      { $set: { scope: current.toString() } }
    );
  }

  return new Response();
};

