#!/usr/bin/env bun
/**
 * Lightweight memory consolidation script — called from Stop hook.
 * Extracts project, bug, and preference signals from the conversation.
 *
 * Usage:
 *   bun run server/consolidate.ts <assistant_message> <user_prompt>
 *
 * Both arguments should be the raw text of the messages.
 */

import { consolidateMemory } from "./memory";

function main(): void {
  const assistantMessage = process.argv[2] ?? "";
  const userPrompt = process.argv[3] ?? "";

  if (!assistantMessage && !userPrompt) {
    console.error("Usage: bun run server/consolidate.ts <assistant_message> <user_prompt>");
    process.exit(1);
  }

  try {
    consolidateMemory(assistantMessage, userPrompt);
    console.log("Memory consolidated successfully.");
  } catch (e) {
    // Non-fatal — memory consolidation should never crash the hook
    console.error("Memory consolidation failed:", e);
    process.exit(0); // still exit 0 — don't break the hook
  }
}

main();
