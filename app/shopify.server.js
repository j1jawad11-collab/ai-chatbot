import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { MongoDBSessionStorage } from "@shopify/shopify-app-session-storage-mongodb";

// Note: MongoDB requires the full URI including the scheme
const mongoUrl = process.env.MONGO_URI || process.env.MONGODB_URI;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new MongoDBSessionStorage(mongoUrl, "chatbot"),
  distribution: AppDistribution.AppStore,
  billing: {
    "Starter Plan": {
      lineItems: [
        {
          amount: 5.0,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    },
    "Pro Plan": {
      lineItems: [
        {
          amount: 9.0,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

