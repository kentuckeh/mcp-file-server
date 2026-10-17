import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const WORKSPACE = path.resolve("workspace");
const PORT = 3000;

function buildServer() {
  const server = new McpServer({ name: "mcp-file-server", version: "1.0.0" });

  server.registerTool(
    "list_files",
    {
      title: "List files",
      description: "List files and folders inside the workspace directory.",
      inputSchema: { path: z.string().default(".") },
    },
    async ({ path: rel }) => {
      const target = path.join(WORKSPACE, rel);
      const entries = await fs.readdir(target, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
      return { content: [{ type: "text", text: lines.join("\n") || "(empty)" }] };
    }
  );

  return server;
}

const app = express();
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
