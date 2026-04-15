#!/usr/bin/env bun
/**
 * Lightweight mood shifting script — called from shell hooks.
 * Shifts mood based on coding events.
 *
 * Usage:
 *   bun run server/shift-mood.ts <trigger> [slot]
 *
 * Triggers: tests_pass | tests_fail | error | large_diff | achievement | long_session | idle | rest
 */

import { shiftMood, MOOD_NAMES, MOOD_COLORS } from "./mood";
import type { MoodTrigger } from "./mood";

const VALID_TRIGGERS = new Set([
  "tests_pass",
  "tests_fail",
  "error",
  "large_diff",
  "achievement",
  "long_session",
  "idle",
  "rest",
]);

function main(): void {
  const trigger = process.argv[2] as string;

  if (!trigger || !VALID_TRIGGERS.has(trigger)) {
    console.error(
      `Usage: bun run server/shift-mood.ts <trigger>\nValid triggers: ${[...VALID_TRIGGERS].join(" | ")}`,
    );
    process.exit(1);
  }

  const state = shiftMood(trigger as MoodTrigger);
  const mood = state.current;
  const color = MOOD_COLORS[mood] ?? "💫";
  const name = MOOD_NAMES[mood] ?? mood;
  console.log(`Mood: ${color} ${name} (intensity ${state.intensity}/3)`);
}

main();
