/**
 * Cross-session memory — remembers past projects and earlier conversations.
 *
 * Memory is stored in ~/.claude-buddy/memory/:
 *   projects.json  — project records
 *   bugs.json      — encountered bugs
 *   preferences.json — user preferences
 *
 * All data is local-only. Nothing is sent to any remote service.
 * Privacy: users can wipe with `rm -rf ~/.claude-buddy/memory`.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { buddyStateDir } from "./path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProjectMemory {
  id: string;
  name: string;
  path: string;
  language: string[];      // e.g. ["typescript", "python"]
  framework?: string;
  lastSeen: number;        // timestamp
  noteCount: number;
  tags: string[];
  fileCount?: number;      // number of files in project
}

export interface BugMemory {
  id: string;
  projectId: string;
  errorSignature: string; // hash of error message
  summary: string;
  resolved: boolean;
  resolvedAt?: number;
  occurrenceCount: number;
  lastSeen: number;
  firstSeen: number;
}

export interface PreferenceMemory {
  key: string;
  value: string;
  context: string;
  confidence: number;      // 0-1, derived from frequency
  lastUpdated: number;
}

// ─── File paths ───────────────────────────────────────────────────────────────

const MEMORY_DIR = join(buddyStateDir(), "memory");
const PROJECTS_FILE = join(MEMORY_DIR, "projects.json");
const BUGS_FILE = join(MEMORY_DIR, "bugs.json");
const PREFERENCES_FILE = join(MEMORY_DIR, "preferences.json");

function ensureDir(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    }
  } catch {
    // corrupted or empty — use fallback
  }
  return fallback;
}

function saveJson<T>(path: string, data: T): void {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ─── Project memory ──────────────────────────────────────────────────────────

export function loadProjects(): Record<string, ProjectMemory> {
  return loadJson(PROJECTS_FILE, {});
}

export function saveProjects(projects: Record<string, ProjectMemory>): void {
  saveJson(PROJECTS_FILE, projects);
}

export function getProject(id: string): ProjectMemory | null {
  const projects = loadProjects();
  return projects[id] ?? null;
}

export function updateProject(
  id: string,
  updates: Partial<Omit<ProjectMemory, "id">>,
): ProjectMemory {
  const projects = loadProjects();
  const existing = projects[id] ?? {
    id,
    name: id,
    path: "",
    language: [],
    lastSeen: Date.now(),
    noteCount: 0,
    tags: [],
  };
  projects[id] = {
    ...existing,
    ...updates,
    id, // always preserve original id
    lastSeen: Date.now(),
  };
  saveProjects(projects);
  return projects[id];
}

// ─── Bug memory ──────────────────────────────────────────────────────────────

export function loadBugs(): Record<string, BugMemory> {
  return loadJson(BUGS_FILE, {});
}

export function saveBugs(bugs: Record<string, BugMemory>): void {
  saveJson(BUGS_FILE, bugs);
}

export function getBug(id: string): BugMemory | null {
  const bugs = loadBugs();
  return bugs[id] ?? null;
}

/** Find a bug by its error signature hash within a project */
export function findBugBySignature(
  projectId: string,
  errorSignature: string,
): BugMemory | null {
  const bugs = loadBugs();
  return Object.values(bugs).find(
    (b) => b.projectId === projectId && b.errorSignature === errorSignature,
  ) ?? null;
}

export function addBugMemory(
  projectId: string,
  errorSignature: string,
  summary: string,
): BugMemory {
  const bugs = loadBugs();

  // Check if this bug already exists
  const existing = findBugBySignature(projectId, errorSignature);
  if (existing) {
    existing.occurrenceCount += 1;
    existing.lastSeen = Date.now();
    existing.summary = summary; // update summary with latest
    saveBugs(bugs);
    return existing;
  }

  const id = `${projectId}-${errorSignature.slice(0, 8)}`;
  const bug: BugMemory = {
    id,
    projectId,
    errorSignature,
    summary,
    resolved: false,
    occurrenceCount: 1,
    lastSeen: Date.now(),
    firstSeen: Date.now(),
  };
  bugs[id] = bug;
  saveBugs(bugs);
  return bug;
}

export function resolveBug(id: string): BugMemory | null {
  const bugs = loadBugs();
  const bug = bugs[id];
  if (!bug) return null;
  bug.resolved = true;
  bug.resolvedAt = Date.now();
  saveBugs(bugs);
  return bug;
}

// ─── Preference memory ─────────────────────────────────────────────────────────

export function loadPreferences(): Record<string, PreferenceMemory> {
  return loadJson(PREFERENCES_FILE, {});
}

export function savePreferences(prefs: Record<string, PreferenceMemory>): void {
  saveJson(PREFERENCES_FILE, prefs);
}

export function setPreference(
  key: string,
  value: string,
  context: string,
  confidenceBoost: number = 0.1,
): PreferenceMemory {
  const prefs = loadPreferences();
  const existing = prefs[key];

  if (existing && existing.context === context) {
    // Same context — increase confidence, update value
    existing.confidence = Math.min(1, existing.confidence + confidenceBoost);
    existing.value = value;
    existing.lastUpdated = Date.now();
  } else {
    // New context or different context — create new or merge cautiously
    const newConf = confidenceBoost;
    if (existing && existing.confidence > newConf) {
      // Existing is more confident — don't overwrite
      existing.lastUpdated = Date.now();
    } else {
      prefs[key] = {
        key,
        value,
        context,
        confidence: newConf,
        lastUpdated: Date.now(),
      };
    }
  }

  savePreferences(prefs);
  return prefs[key];
}

// ─── Consolidation ───────────────────────────────────────────────────────────

/** Simple hash function for error signatures */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    h = ((h << 5) - h) + char;
    h = h & h; // convert to 32-bit integer
  }
  return Math.abs(h).toString(16);
}

/** Extract language signals from text (file extensions) */
function extractLanguages(text: string): string[] {
  const extMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", rb: "ruby",
    php: "php", c: "c", cpp: "cpp", cs: "csharp", swift: "swift",
    kt: "kotlin", scala: "scala", r: "r", lua: "lua", pl: "perl",
    sh: "shell", bash: "shell", zsh: "shell", fish: "shell",
    sql: "sql", html: "html", css: "css", scss: "scss", json: "json",
    yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", md: "markdown",
  };

  const found = new Set<string>();
  const extRegex = /\.([a-z]+)/gi;
  let match;
  while ((match = extRegex.exec(text)) !== null) {
    const ext = match[1].toLowerCase();
    const lang = extMap[ext];
    if (lang) found.add(lang);
  }
  return [...found];
}

/** Extract package manager / framework signals */
function extractFramework(text: string): string | undefined {
  const signals: Record<string, string> = {
    "package.json": "Node.js", "package-lock.json": "Node.js",
    "requirements.txt": "Python", "Pipfile": "Python", "pyproject.toml": "Python",
    "Cargo.toml": "Rust", "Cargo.lock": "Rust",
    "go.mod": "Go", "go.sum": "Go",
    "pom.xml": "Java", "build.gradle": "Java",
    "Gemfile": "Ruby", "Gemfile.lock": "Ruby",
    "composer.json": "PHP",
    "swiftpm": "Swift", "Package.swift": "Swift",
    ".NET": ".NET", "csproj": ".NET",
  };

  for (const [file, framework] of Object.entries(signals)) {
    if (text.includes(file)) return framework;
  }
  return undefined;
}

/** Extract project name from path or git remote */
function extractProjectName(text: string): string | undefined {
  // Try to find a directory path
  const pathRegex = /\/([^\/]+)\/(?:src|lib|app|packages|tests?)/gi;
  let match;
  while ((match = pathRegex.exec(text)) !== null) {
    return match[1];
  }

  // Try git remote
  const gitRegex = /github\.com[:/]([\w\-\.]+)\/([^\/\s]+)/gi;
  while ((match = gitRegex.exec(text)) !== null) {
    return match[2];
  }

  return undefined;
}

/** Extract error messages from text */
function extractErrors(text: string): Array<{ signature: string; summary: string }> {
  const errors: Array<{ signature: string; summary: string }> = [];
  // Common error patterns
  const errorPatterns = [
    /([A-Z][a-z]+Error: .+)/,
    /(SyntaxError: .+)/,
    /(TypeError: .+)/,
    /(ReferenceError: .+)/,
    /(Error: .+)/,
    /(panic: .+)/,
    /(Exception: .+)/,
  ];

  for (const pattern of errorPatterns) {
    let match;
    const regex = new RegExp(pattern, "gi");
    while ((match = regex.exec(text)) !== null) {
      const full = match[0];
      const signature = simpleHash(full);
      // Truncate summary for storage
      const summary = full.slice(0, 200);
      errors.push({ signature, summary });
    }
  }

  return errors;
}

/**
 * Consolidate memory from a conversation turn.
 * Called on Stop hook with the assistant's response and user prompt.
 */
export function consolidateMemory(
  assistantMessage: string,
  userPrompt: string,
): void {
  const combined = `${assistantMessage} ${userPrompt}`;

  // Extract project name
  const projectName = extractProjectName(combined);
  if (!projectName) return;

  // Extract and update project
  const languages = extractLanguages(combined);
  const framework = extractFramework(combined);
  updateProject(projectName, {
    name: projectName,
    language: languages.length > 0 ? languages : undefined,
    framework,
  });

  // Extract and store bugs
  const errors = extractErrors(combined);
  for (const err of errors) {
    addBugMemory(projectName, err.signature, err.summary);
  }
}

// ─── Retrieval ───────────────────────────────────────────────────────────────

export interface MemoryQuery {
  project?: string;
  type?: "projects" | "bugs" | "preferences" | "all";
  resolved?: boolean; // for bugs
}

export function queryMemory(query: MemoryQuery): {
  projects: ProjectMemory[];
  bugs: BugMemory[];
  preferences: PreferenceMemory[];
} {
  const projects = query.type === "bugs" || query.type === "preferences"
    ? []
    : Object.values(loadProjects()).filter(
        (p) => !query.project || p.id === query.project || p.name.includes(query.project),
      );

  let bugs = query.type === "projects" || query.type === "preferences"
    ? []
    : Object.values(loadBugs());

  if (query.project) {
    bugs = bugs.filter((b) => b.projectId === query.project);
  }
  if (query.resolved !== undefined) {
    bugs = bugs.filter((b) => b.resolved === query.resolved);
  }

  const preferences = query.type === "projects" || query.type === "bugs"
    ? []
    : Object.values(loadPreferences());

  return { projects, bugs, preferences };
}
