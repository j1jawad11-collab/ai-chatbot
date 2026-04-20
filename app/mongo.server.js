import { MongoClient } from "mongodb";

let mongoClient;
let db;

export async function connectToMongoDB() {
  if (db) return db;

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not defined");
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(uri, {
      maxPoolSize: 10,
    });
    await mongoClient.connect();
  }

  // Explicitly connect to the 'chatbot' database
  db = mongoClient.db("chatbot"); 
  return db;
}

export async function getStoreSettings(shop) {
  const database = await connectToMongoDB();
  const stores = database.collection("stores");
  
  // Find or create basic store document
  const result = await stores.findOneAndUpdate(
    { shop },
    {
      $setOnInsert: {
        shop,
        plan: "free",
        messageCount: 0,
        systemPrompt: `You are a helpful AI customer support assistant for ${shop}. Keep your answers concise and polite.`,
        createdAt: new Date()
      }
    },
    { upsert: true, returnDocument: "after" }
  );
  
  return result;
}

export async function incrementMessageCount(shop) {
  const database = await connectToMongoDB();
  const stores = database.collection("stores");
  
  await stores.updateOne(
    { shop },
    {
      $inc: { messageCount: 1 },
      $set: { lastMessageAt: new Date() }
    }
  );
}

export async function updateStoreSettings(shop, settings) {
  const database = await connectToMongoDB();
  const stores = database.collection("stores");
  
  const result = await stores.findOneAndUpdate(
    { shop },
    {
      $set: settings,
      $currentDate: { updatedAt: true }
    },
    { returnDocument: "after" }
  );
  
  return result;
}
