import { customAlphabet } from "nanoid";

// No ambiguous characters (0/O, 1/l/I)
const nanoid = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 12);

export function generatePortalId(): string {
  return nanoid();
}
