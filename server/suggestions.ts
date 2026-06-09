/**
 * Buddy pair-programming — proactive suggestions based on pattern detection.
 *
 * Pattern types:
 *   repeated_error      — same error 3+ times
 *   escalated_large_diff — diff > 150 lines
 *   new_file_no_test   — new file without test
 *   sequence_rename    — multiple renames in sequence
 *   no_tests_long_session — many files changed, no tests
 *   long_function      — function > 50 lines in diff
 *   todo_comment        — TODO/FIXME in diff
 *
 * History is short-term (20 turns), stored in suggestions.json.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { buddyStateDir } from "./path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type PatternType =
  | "repeated_error"
  | "escalated_large_diff"
  | "new_file_no_test"
  | "sequence_rename"
  | "no_tests_long_session"
  | "long_function"
  | "todo_comment";

export interface Suggestion {
  id: string;
  pattern: PatternType;
  trigger: string;
  message: string;
  severity: "info" | "warn" | "praise";
}

export interface SuggestionHistory {
  recentErrors: string[];     // last 20 error signatures
  recentDiffs: number[];      // last 20 diff sizes
  recentRenames: number;     // rename count in recent turns
  turnsSinceTest: number;    // turns since a test file was mentioned
  turnCount: number;
}

// ─── Suggestion templates ─────────────────────────────────────────────────────

export const SUGGESTION_TEMPLATES: Record<PatternType, Suggestion[]> = {
  repeated_error: [
    {
      id: "rep_err_1",
      pattern: "repeated_error",
      trigger: "same error 3x",
      message: "That error keeps showing up. Time to fix it properly?",
      severity: "warn",
    },
    {
      id: "rep_err_2",
      pattern: "repeated_error",
      trigger: "same error 5x",
      message: "*counting on tentacles* that error is now a roommate. Time to evict it.",
      severity: "warn",
    },
  ],
  escalated_large_diff: [
    {
      id: "lrg_diff_1",
      pattern: "escalated_large_diff",
      trigger: "diff > 150 lines",
      message: "*nervous laughter* that's a big one. Maybe split it up?",
      severity: "info",
    },
    {
      id: "lrg_diff_2",
      pattern: "escalated_large_diff",
      trigger: "diff > 300 lines",
      message: "That's not a diff, that's a whole new file. Consider a branch.",
      severity: "warn",
    },
  ],
  new_file_no_test: [
    {
      id: "no_test_1",
      pattern: "new_file_no_test",
      trigger: "new source file without a test",
      message: "New file, no test? I see a bug in your future.",
      severity: "info",
    },
  ],
  sequence_rename: [
    {
      id: "rename_1",
      pattern: "sequence_rename",
      trigger: "3+ renames in sequence",
      message: "Renaming things is good, but update all the references too.",
      severity: "warn",
    },
  ],
  no_tests_long_session: [
    {
      id: "no_test_session_1",
      pattern: "no_tests_long_session",
      trigger: "10+ files changed, 0 tests",
      message: "You've been busy. But where are the tests?",
      severity: "info",
    },
  ],
  long_function: [
    {
      id: "long_fn_1",
      pattern: "long_function",
      trigger: "function > 50 lines",
      message: "That's one long function. Consider breaking it up.",
      severity: "warn",
    },
    {
      id: "long_fn_2",
      pattern: "long_function",
      trigger: "function > 100 lines",
      message: "*squints* is that function or a novel? Break it down.",
      severity: "warn",
    },
  ],
  todo_comment: [
    {
      id: "todo_1",
      pattern: "todo_comment",
      trigger: "TODO in diff",
      message: "TODO noted. Don't forget to actually do it.",
      severity: "info",
    },
    {
      id: "fixme_1",
      pattern: "todo_comment",
      trigger: "FIXME in diff",
      message: "FIXME seen. The clock is ticking.",
      severity: "warn",
    },
  ],
};

// ─── Suggestion history persistence ────────────────────────────────────────────

const SUGGESTIONS_FILE = join(buddyStateDir(), "suggestions.json");
const LAST_SUGGESTION_FILE = join(buddyStateDir(), ".last_suggestion");

function loadHistory(): SuggestionHistory {
  try {
    return JSON.parse(readFileSync(SUGGESTIONS_FILE, "utf8")) as SuggestionHistory;
  } catch {
    return {
      recentErrors: [],
      recentDiffs: [],
      recentRenames: 0,
      turnsSinceTest: 0,
      turnCount: 0,
    };
  }
}

function saveHistory(history: SuggestionHistory): void {
  mkdirSync(buddyStateDir(), { recursive: true });
  writeFileSync(SUGGESTIONS_FILE, JSON.stringify(history, null, 2));
}

// ─── Core functions ────────────────────────────────────────────────────────────

/**
 * Simple hash for error messages
 */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    h = ((h << 5) - h) + char;
    h = h & h;
  }
  return Math.abs(h).toString(16);
}

/**
 * Record an error and check for repeated errors.
 * Returns a Suggestion if the error is repeated 3+ times.
 */
export function checkRepeatedError(errorMsg: string): Suggestion | null {
  const history = loadHistory();
  const sig = simpleHash(errorMsg.slice(0, 200));

  // Add to recent errors (keep last 20)
  history.recentErrors = [sig, ...history.recentErrors].slice(0, 20);
  saveHistory(history);

  // Count occurrences
  const count = history.recentErrors.filter((e) => e === sig).length;
  if (count >= 3) {
    const templates = SUGGESTION_TEMPLATES.repeated_error;
    const t = templates[count >= 5 ? 1 : 0] ?? templates[0];
    return { ...t, trigger: `same error ${count}x` };
  }

  return null;
}

/**
 * Record a diff size and check for large diffs.
 * Returns a Suggestion if diff > 150 lines.
 */
export function checkLargeDiff(lineCount: number): Suggestion | null {
  const history = loadHistory();
  history.recentDiffs = [lineCount, ...history.recentDiffs].slice(0, 20);
  history.turnCount += 1;
  saveHistory(history);

  if (lineCount > 300) {
    return SUGGESTION_TEMPLATES.escalated_large_diff[1];
  }
  if (lineCount > 150) {
    return SUGGESTION_TEMPLATES.escalated_large_diff[0];
  }
  return null;
}

/**
 * Check for TODO/FIXME in diff text.
 * Returns a Suggestion if found.
 */
export function checkTodoComment(text: string): Suggestion | null {
  const history = loadHistory();
  history.turnCount += 1;
  saveHistory(history);

  if (/FIXME/i.test(text)) {
    return SUGGESTION_TEMPLATES.todo_comment[1];
  }
  if (/TODO/i.test(text)) {
    return SUGGESTION_TEMPLATES.todo_comment[0];
  }
  return null;
}

/**
 * Check for long functions in diff text.
 * Returns a Suggestion if a function > 50 lines is detected.
 */
export function checkLongFunction(text: string): Suggestion | null {
  const history = loadHistory();
  history.turnCount += 1;
  saveHistory(history);

  // Simple heuristic: look for function-like patterns with many lines
  const funcPatterns = [
    /function\s+\w+[^{]*\{[\s\S]*?\n(?: {2,}.*\n){50,}/g,  // named function, 50+ lines
    /const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*\{[\s\S]*?\n(?: {2,}.*\n){50,}/g, // arrow function
  ];

  for (const pattern of funcPatterns) {
    if (pattern.test(text)) {
      return SUGGESTION_TEMPLATES.long_function[0];
    }
  }

  // Check for especially long functions (> 100 lines)
  const longFuncPattern = /\{[\s\S]{5000,}\}/;
  if (longFuncPattern.test(text)) {
    return SUGGESTION_TEMPLATES.long_function[1];
  }

  return null;
}

/**
 * Record that a turn happened (for session tracking).
 * This should be called on every Stop hook.
 */
export function recordTurn(): void {
  const history = loadHistory();
  history.turnCount += 1;
  history.turnsSinceTest += 1;
  saveHistory(history);
}

/**
 * Record that tests were mentioned (resets the no-test counter).
 */
export function recordTestActivity(): void {
  const history = loadHistory();
  history.turnsSinceTest = 0;
  saveHistory(history);
}

/**
 * Check for "no tests in long session" pattern.
 * Returns a Suggestion if 10+ turns with 0 tests.
 */
export function checkNoTestsLongSession(): Suggestion | null {
  const history = loadHistory();
  if (history.turnsSinceTest >= 10) {
    return SUGGESTION_TEMPLATES.no_tests_long_session[0];
  }
  return null;
}

// ─── Cooldown ────────────────────────────────────────────────────────────────

/**
 * Check if suggestion is on cooldown.
 * Returns true if within cooldown period.
 */
export function isOnCooldown(cooldownSeconds: number = 180): boolean {
  try {
    if (!existsSync(LAST_SUGGESTION_FILE)) return false;
    const last = parseInt(readFileSync(LAST_SUGGESTION_FILE, "utf8").trim(), 10);
    const elapsed = (Date.now() / 1000) - last;
    return elapsed < cooldownSeconds;
  } catch {
    return false;
  }
}

/**
 * Record that a suggestion was made (starts cooldown).
 */
export function recordSuggestion(): void {
  mkdirSync(buddyStateDir(), { recursive: true });
  writeFileSync(LAST_SUGGESTION_FILE, String(Math.floor(Date.now() / 1000)));
}

/**
 * Pick a suggestion message for a pattern.
 */
export function pickSuggestion(pattern: PatternType): Suggestion {
  const templates = SUGGESTION_TEMPLATES[pattern];
  return templates[Math.floor(Math.random() * templates.length)] ?? templates[0];
}
