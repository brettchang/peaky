import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const KNOWLEDGE_PATH = path.join(process.cwd(), "lib", "email", "knowledge.md");

export async function loadEmailKnowledgeBase(): Promise<{
  markdown: string;
  hash: string;
  path: string;
}> {
  const markdown = await readFile(KNOWLEDGE_PATH, "utf8");
  const hash = createHash("sha256").update(markdown).digest("hex");
  return {
    markdown,
    hash,
    path: KNOWLEDGE_PATH,
  };
}
