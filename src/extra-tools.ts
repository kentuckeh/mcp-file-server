import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WORKSPACE, resolveSafe } from "./sandbox.js";

const run = promisify(execFile);
const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
});
function safe<A>(fn: (args: A) => Promise<any>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e);
    }
  };
}

// Runs git inside the workspace only. No shell, so no command injection.
async function git(args: string[]) {
  const { stdout, stderr } = await run("git", args, {
    cwd: WORKSPACE,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  return (stdout + stderr).trim();
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

export function registerExtraTools(server: McpServer) {
  server.registerTool(
    "search_files",
    {
      title: "Search files",
      description:
        "Case-insensitive text search across files in the workspace. Returns up to 50 matches as path:line: text.",
      inputSchema: { query: z.string().min(1), path: z.string().default(".") },
    },
    safe(async ({ query, path: rel }: { query: string; path: string }) => {
      const start = await resolveSafe(rel);
      const q = query.toLowerCase();
      const hits: string[] = [];
      for await (const file of walk(start)) {
        if (hits.length >= 50) break;
        const stat = await fs.stat(file);
        if (stat.size > 1_000_000) continue;
        const lines = (await fs.readFile(file, "utf8")).split("\n");
        for (let i = 0; i < lines.length && hits.length < 50; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            hits.push(`${path.relative(WORKSPACE, file)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          }
        }
      }
      return ok(hits.join("\n") || "No matches");
    })
  );

  server.registerTool(
    "git_status",
    {
      title: "Git status",
      description: "Show which workspace files are new, changed, or deleted since the last commit.",
      inputSchema: {},
    },
    safe(async () => ok((await git(["status", "--short"])) || "Clean: nothing to commit"))
  );

  server.registerTool(
    "git_log",
    {
      title: "Git log",
      description: "Show recent workspace commits (newest first).",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
    },
    safe(async ({ limit }: { limit: number }) =>
      ok((await git(["log", `-n${limit}`, "--oneline"])) || "No commits yet")
    )
  );

  server.registerTool(
    "git_commit",
    {
      title: "Git commit",
      description: "Stage all workspace changes and save them as one commit with the given message.",
      inputSchema: { message: z.string().min(1).max(200) },
    },
    safe(async ({ message }: { message: string }) => {
      if (!(await git(["status", "--porcelain"]))) return ok("Nothing to commit");
      await git(["add", "-A"]);
      await git(["commit", "-m", message]);
      return ok(`Committed: ${message}`);
    })
  );
}
