import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WORKSPACE, resolveSafe } from "./sandbox.js";
import { registerExtraTools } from "./extra-tools.js";

const PORT = 3000;
try { process.loadEnvFile(); } catch {}
const TOKEN = process.env.MCP_TOKEN;
if (!TOKEN) { console.error("MCP_TOKEN is not set"); process.exit(1); }

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
});

// Wraps a tool so any thrown error becomes a clean error result
function safe<A>(fn: (args: A) => Promise<any>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e);
    }
  };
}

function buildServer() {
  const server = new McpServer({ name: "mcp-file-server", version: "1.0.0" });

  server.registerTool(
    "list_files",
    {
      title: "List files",
      description: "List files and folders in a workspace directory. Folders end with /.",
      inputSchema: { path: z.string().default(".") },
    },
    safe(async ({ path: rel }: { path: string }) => {
      const target = await resolveSafe(rel);
      const entries = await fs.readdir(target, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
      return ok(lines.join("\n") || "(empty)");
    })
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Read the full text of a file in the workspace.",
      inputSchema: { path: z.string() },
    },
    safe(async ({ path: rel }: { path: string }) => {
      const target = await resolveSafe(rel);
      return ok(await fs.readFile(target, "utf8"));
    })
  );

  server.registerTool(
    "write_file",
    {
      title: "Write file",
      description: "Create a file or completely overwrite it. Missing folders are created.",
      inputSchema: { path: z.string(), content: z.string() },
    },
    safe(async ({ path: rel, content }: { path: string; content: string }) => {
      const target = await resolveSafe(rel);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      return ok(`Wrote ${content.length} characters to ${rel}`);
    })
  );

  server.registerTool(
    "str_replace",
    {
      title: "Replace text",
      description:
        "Replace one exact piece of text in a file with new text. old_string must appear exactly once in the file, otherwise nothing is changed.",
      inputSchema: { path: z.string(), old_string: z.string().min(1), new_string: z.string() },
    },
    safe(async ({ path: rel, old_string, new_string }: { path: string; old_string: string; new_string: string }) => {
      const target = await resolveSafe(rel);
      const text = await fs.readFile(target, "utf8");
      const count = text.split(old_string).length - 1;
      if (count === 0) throw new Error("old_string not found. No changes made.");
      if (count > 1) throw new Error(`old_string appears ${count} times; make it more specific. No changes made.`);
      await fs.writeFile(target, text.replace(old_string, () => new_string), "utf8");
      return ok(`Replaced 1 occurrence in ${rel}`);
    })
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete file",
      description: "Delete one file from the workspace. Folders cannot be deleted.",
      inputSchema: { path: z.string() },
    },
    safe(async ({ path: rel }: { path: string }) => {
      const target = await resolveSafe(rel);
      if (target === WORKSPACE) throw new Error("Cannot delete the workspace root");
      const stat = await fs.stat(target);
      if (stat.isDirectory()) throw new Error("Path is a folder; only files can be deleted");
      await fs.unlink(target);
      return ok(`Deleted ${rel}`);
    })
  );

  registerExtraTools(server);
  return server;
}

const app = express();
app.use((req, res, next) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => console.log(`MCP server running on http://localhost:${PORT}/mcp`));
