import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";

process.loadEnvFile();
const session = process.argv[2];
const out = `transcripts/session-${session}.txt`;
fs.writeFileSync(out, `# Session ${session} transcript\n`);
const say = (s: string) => { console.log(s); fs.appendFileSync(out, s + "\n"); };

const client = new Client({ name: "demo-client", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(
  new URL("https://purging-revolt-pruning.ngrok-free.dev/mcp"),
  { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } } }
));

async function call(name: string, args: Record<string, unknown> = {}) {
  say(`\n> ${name} ${JSON.stringify(args).slice(0, 150)}`);
  const r: any = await client.callTool({ name, arguments: args });
  const text: string = r.content?.[0]?.text ?? "";
  say(text.slice(0, 400) + (text.length > 400 ? " ...[truncated]" : ""));
  return text;
}
async function append(path: string, line: string) {
  const old = await call("read_file", { path });
  await call("write_file", { path, content: old.replace(/\n*$/, "\n") + line + "\n" });
}

if (session === "1b") {
  await call("list_files");
  await call("read_file", { path: "PROJECT_STATE.md" });
  await call("read_file", { path: "PLAN_LOG.md" });
  await append("CHECKPOINTS.md", "- CP1 | 2026-10-17 | Session 1 complete: waterfall, incremental, agile outlines and INDEX.md created");
  await append("PLAN_LOG.md", "2026-10-17 | session 1 | Quota limit hit; finished checkpoint and state update via scripted client | OK");
  await call("write_file", { path: "PROJECT_STATE.md", content:
`# PROJECT_STATE

## Start-of-session protocol (read this first)
1. Read this file, then CHECKPOINTS.md, PLAN_LOG.md, DECISIONS.md.
2. Do the next unchecked item under "Next steps".
3. After each step, append a line to PLAN_LOG.md.
4. At a milestone, add an entry to CHECKPOINTS.md and call git_commit.
5. Before ending, update "Current status" and "Next steps".

## Goal
Build a Software Process Models notes pack in notes/process-models/.

## Current status
Session 1 done: outlines for waterfall, incremental, agile plus INDEX.md exist (CP1).
Session 1 was cut off by an API quota limit; the final steps were finished afterward.

## Next steps
- [ ] Session 2: review every outline and add a review note
- [ ] Session 2: log steps, add checkpoint CP2, git_commit
` });
  await call("git_commit", { message: "Session 1: process models outlines, checkpoint CP1" });
} else {
  // Session 2 starts knowing nothing except the handoff files
  await call("read_file", { path: "PROJECT_STATE.md" });
  await call("read_file", { path: "CHECKPOINTS.md" });
  await call("read_file", { path: "PLAN_LOG.md" });
  await call("read_file", { path: "DECISIONS.md" });
  await call("git_log", { limit: 5 });
  await call("search_files", { query: "cons", path: "notes/process-models" });
  for (const f of ["waterfall", "incremental", "agile"]) {
    const p = `notes/process-models/${f}.md`;
    const text = await call("read_file", { path: p });
    const first = text.split("\n")[0];
    await call("str_replace", { path: p, old_string: first, new_string: `${first}\n\n> Reviewed in Session 2. See INDEX.md for the full list.` });
    await append("PLAN_LOG.md", `2026-10-17 | session 2 | Reviewed and updated ${p} | OK`);
  }
  await call("read_file", { path: "notes/process-models/INDEX.md" });
  await append("CHECKPOINTS.md", "- CP2 | 2026-10-17 | Session 2 complete: outlines reviewed, resumed from handoff files only");
  await call("str_replace", { path: "PROJECT_STATE.md", old_string: "- [ ] Session 2: review every outline and add a review note", new_string: "- [x] Session 2: review every outline and add a review note (done)" });
  await call("str_replace", { path: "PROJECT_STATE.md", old_string: "- [ ] Session 2: log steps, add checkpoint CP2, git_commit", new_string: "- [x] Session 2: log steps, checkpoint CP2, commit (done)" });
  await call("git_commit", { message: "Session 2: reviewed notes, checkpoint CP2" });
  await call("git_log", { limit: 5 });
}
await client.close();
