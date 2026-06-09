#!/usr/bin/env bun
/**
 * Validate species art format.
 *
 * Usage:
 *   bun run cli/validate-species.ts <path>
 *   bun run cli/validate-species.ts --check-species <name>
 *
 * Exits 0 if valid, 1 if invalid (with error messages to stderr).
 */

import { readFileSync } from "fs";
import { join } from "path";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const EYE_PLACEHOLDER = "{E}";

/** Check a string for ANSI escape sequences */
function hasAnsiCodes(s: string): boolean {
  return s.includes("\x1b[");
}

/** Strip ANSI codes from a string */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[^m]*m/g, "");
}

/** Validate a single art frame (must be exactly 5 lines) */
function validateFrame(
  species: string,
  frameIndex: number,
  lines: string[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length !== 5) {
    errors.push(
      `  Species "${species}" frame ${frameIndex}: expected 5 lines, got ${lines.length}`,
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rawLen = line.length;
    const displayLen = stripAnsi(line).length;

    if (hasAnsiCodes(line)) {
      errors.push(
        `  Species "${species}" frame ${frameIndex} line ${i + 1}: contains ANSI escape sequences (not allowed)`,
      );
    }

    if (displayLen > 14) {
      errors.push(
        `  Species "${species}" frame ${frameIndex} line ${i + 1}: display width ${displayLen} exceeds max 14 chars`,
      );
    }

    // Each species art should have the eye placeholder in at least one line
    // (not strictly required but warn if missing)
    if (!line.includes(EYE_PLACEHOLDER) && i === 1) {
      warnings.push(
        `  Species "${species}" frame ${frameIndex} line ${i + 1}: missing ${EYE_PLACEHOLDER} eye placeholder (recommended for line 2)`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate art structure from parsed JSON */
function validateSpeciesArt(
  species: string,
  art: string[][],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(art)) {
    errors.push(`Species "${species}": art must be an array of frames`);
    return { valid: false, errors, warnings };
  }

  if (art.length !== 3) {
    errors.push(
      `Species "${species}": expected 3 animation frames, got ${art.length}`,
    );
  }

  for (let i = 0; i < art.length; i++) {
    const frame = art[i];
    const result = validateFrame(species, i, frame);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate a face template — must contain at least one eye placeholder */
function validateFaceTemplate(
  species: string,
  face: string,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (face.length > 20) {
    errors.push(
      `Species "${species}" face template: display width ${face.length} exceeds max 20 chars`,
    );
  }

  if (!face.includes(EYE_PLACEHOLDER)) {
    errors.push(
      `Species "${species}" face template: missing ${EYE_PLACEHOLDER} eye placeholder`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Main validation function — validates a species JSON file or inline art.
 * Returns exit code (0 = valid, 1 = invalid).
 */
export function validateSpeciesFile(filePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: Record<string, unknown>;
  try {
    const raw = readFileSync(filePath, "utf8");
    data = JSON.parse(raw);
  } catch (e) {
    return {
      valid: false,
      errors: [`Failed to read or parse JSON file: ${filePath}`],
      warnings: [],
    };
  }

  const species = data.name as string | undefined;
  if (!species || typeof species !== "string") {
    errors.push("Species must have a 'name' field (string)");
  }

  const art = data.art as string[][] | undefined;
  if (!art) {
    errors.push("Species must have an 'art' field (string[][] — 3 frames × 5 lines)");
  } else {
    const artResult = validateSpeciesArt(species ?? "unknown", art);
    errors.push(...artResult.errors);
    warnings.push(...artResult.warnings);
  }

  const face = data.face as string | undefined;
  if (face) {
    const faceResult = validateFaceTemplate(species ?? "unknown", face);
    errors.push(...faceResult.errors);
    warnings.push(...faceResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Print results and exit with appropriate code */
function main(): never {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun run cli/validate-species.ts <path-to-species-json>");
    console.error("  Validates art format, ANSI codes, and eye placeholder.");
    console.error("");
    console.error("Example:");
    console.error("  bun run cli/validate-species.ts ./my-species.json");
    process.exit(1);
  }

  const filePath = args[0].startsWith("/") ? args[0] : join(process.cwd(), args[0]);
  const result = validateSpeciesFile(filePath);

  if (result.warnings.length > 0) {
    console.warn("Warnings:");
    for (const w of result.warnings) {
      console.warn(w);
    }
    console.warn("");
  }

  if (result.valid) {
    console.log(`✓ ${args[0]}: valid`);
    process.exit(0);
  } else {
    console.error("Errors:");
    for (const e of result.errors) {
      console.error(e);
    }
    process.exit(1);
  }
}

main();
