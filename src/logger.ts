import fs from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LOG = "logs/tool-calls.jsonl";

function summarize(args: any) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    out[k] = typeof v === "string" && v.length > 80 ? `<${v.length} chars>` : v;
  }
  return out;
}

// Wrap registerTool so every call is logged.
export function withLogging(server: McpServer) {
  const original = server.registerTool.bind(server) as any;
  (server as any).registerTool = (name: string, config: any, handler: any) =>
    original(name, config, async (...a: any[]) => {
      const t0 = Date.now();
      const res = await handler(...a);
      fs.appendFileSync(
        LOG,
        JSON.stringify({
          time: new Date().toISOString(),
          tool: name,
          args: summarize(typeof a[0] === "object" ? a[0] : {}),
          ms: Date.now() - t0,
          error: !!res?.isError,
        }) + "\n"
      );
      return res;
    });
}
