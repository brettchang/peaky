import { getAppBaseUrl } from "./urls";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getXeroConfig() {
  return {
    baseUrl: getAppBaseUrl(),
    clientId: getRequiredEnv("XERO_CLIENT_ID"),
    clientSecret: getRequiredEnv("XERO_CLIENT_SECRET"),
  };
}
