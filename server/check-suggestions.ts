#!/usr/bin/env bun
/**
 * Check for suggestion patterns in the assistant's message.
 * Called from suggest.sh hook.
 *
 * Usage:
 *   bun run server/check-suggestions.ts <assistant_message>
 */

import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { buddyStateDir } from "./path";
import {
  checkRepeatedError,
  checkLargeDiff,
  checkTodoComment,
  checkLongFunction,
  checkNoTestsLongSession,
  recordTurn,
  recordSuggestion,
  isOnCooldown,
  type Suggestion,
} from "./suggestions";

const PENDING_FILE = join(buddyStateDir(), ".pending_suggestion.json");

function main(): void {
  const message = process.argv[2] ?? "";
  if (!message) {
    // When called with no args, just record a turn
    recordTurn();
    return;
  }

  // Parse the JSON string (jq -Rs wraps in quotes and escapes)
  const text = message.replace(/^"/, "").replace(/"$/, "").replace(/\\"/g, '"');

  // Record turn happened
  recordTurn();

  // Check cooldown
  if (isOnCooldown(180)) return;

  let suggestion: Suggestion | null = null;

  // Extract error messages
  const errorPatterns = [
    /([A-Z][a-z]+Error: .+)/,
    /(SyntaxError: .+)/,
    /(TypeError: .+)/,
    /(ReferenceError: .+)/,
    /(Error: .+)/,
    /(panic: .+)/,
  ];

  for (const pattern of errorPatterns) {
    const match = text.match(pattern);
    if (match) {
      suggestion = checkRepeatedError(match[0]);
      if (suggestion) break;
    }
  }

  // Check for large diffs (look for insertion counts)
  if (!suggestion) {
    const diffMatch = text.match(/(\d+)\s+insertions/);
    if (diffMatch) {
      const lines = parseInt(diffMatch[1], 10);
      if (lines > 50) {
        suggestion = checkLargeDiff(lines);
      }
    }
  }

  // Check for TODO/FIXME
  if (!suggestion) {
    suggestion = checkTodoComment(text);
  }

  // Check for long functions
  if (!suggestion) {
    suggestion = checkLongFunction(text);
  }

  // Check for no-tests-long-session
  if (!suggestion) {
    suggestion = checkNoTestsLongSession();
  }

  if (suggestion) {
    recordSuggestion();
    // Write suggestion to file for MCP server to pick up
    mkdirSync(buddyStateDir(), { recursive: true });
    writeFileSync(
      PENDING_FILE,
      JSON.stringify({ suggestion, timestamp: Date.now() }),
    );
    console.log(`Suggestion: ${suggestion.message}`);
  }
}

main();
