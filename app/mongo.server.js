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
        messageCount: 0,
        systemPrompt: `You are a helpful AI customer support assistant for ${shop}. Keep your answers concise and polite.`,
        websiteUrl: "",
        faqs: "",
        productCache: [],
        productCacheAt: null,
        createdAt: new Date()
      }
    },
    { upsert: true, returnDocument: "after" }
  );
  if (result) {
    return { ...result, _id: result._id.toString() };
  }
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
  if (result) {
    return { ...result, _id: result._id.toString() };
  }
  return result;
}

// Product cache TTL: 1 hour (3600000 ms)
const PRODUCT_CACHE_TTL = 3600000;

export async function getCachedProducts(shop) {
  const database = await connectToMongoDB();
  const stores = database.collection("stores");
  const doc = await stores.findOne(
    { shop },
    { projection: { productCache: 1, productCacheAt: 1 } }
  );

  if (
    doc?.productCache?.length > 0 &&
    doc.productCacheAt &&
    Date.now() - new Date(doc.productCacheAt).getTime() < PRODUCT_CACHE_TTL
  ) {
    return doc.productCache;
  }
  return null; // Cache miss — caller must fetch fresh
}

export async function setCachedProducts(shop, products) {
  const database = await connectToMongoDB();
  const stores = database.collection("stores");
  await stores.updateOne(
    { shop },
    { $set: { productCache: products, productCacheAt: new Date() } }
  );
}
