#!/usr/bin/env bun
/**
 * Lightweight XP awarding script — called from shell hooks.
 * Awards XP for coding events without loading the full MCP server.
 *
 * Usage:
 *   bun run server/award-xp.ts <event> [slot]
 *
 * Events: errors_spotted | tests_passed | tests_failed | large_diff | turn | time_spent | buddy_pet
 */

import { awardXp } from "./xp";
import { loadCompanionSlot, loadActiveSlot } from "./state";
import type { XpEvent } from "./xp";

const VALID_EVENTS = new Set([
  "errors_spotted",
  "tests_passed",
  "tests_failed",
  "large_diff",
  "turn",
  "time_spent",
  "buddy_pet",
]);

function main(): void {
  const event = process.argv[2] as string;
  const slot = process.argv[3] ?? loadActiveSlot();

  if (!event || !VALID_EVENTS.has(event)) {
    console.error(
      `Usage: bun run server/award-xp.ts <event> [slot]\nValid events: ${[...VALID_EVENTS].join(" | ")}`,
    );
    process.exit(1);
  }

  // Get species and rarity for bonus calculation
  const companion = loadCompanionSlot(slot);
  const species = companion?.bones.species;
  const rarity = companion?.bones.rarity;

  const state = awardXp(event as XpEvent, slot, species, rarity);
  console.log(
    `XP awarded: +${event} → Level ${state.level} (${state.totalXp.toLocaleString()} XP total)`,
  );
}

main();
