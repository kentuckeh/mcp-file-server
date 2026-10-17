# MCP File Server

An MCP (Model Context Protocol) server that gives an AI agent file and git tools inside one sandboxed workspace folder. It works as shared memory between sessions: one agent session writes plans and notes, and a later session resumes from them.

## Stack
- Node.js 22 + TypeScript (tsx) and the official @modelcontextprotocol/sdk
- Transport: Streamable HTTP (Express, endpoint /mcp, port 3000)
- Validation: zod schemas on every tool input
- Exposure: ngrok static domain (HTTPS)
- Process manager: pm2
- Testing: MCP Inspector, node:test sandbox tests, Gemini CLI, and a scripted SDK client

## Tools (9)
- list_files: list a folder in the workspace
- read_file: read a text file
- write_file: create or overwrite a file
- str_replace: replace one exact piece of text (must match exactly once)
- delete_file: delete one file (not folders)
- search_files: case-insensitive text search, max 50 hits
- git_status, git_log, git_commit: version history for the workspace

## Setup
1. git clone the repo and cd into it
2. npm install
3. mkdir workspace, then run git init inside it
4. Create a .env file containing MCP_TOKEN=some-long-random-string
5. npm run dev (server at http://localhost:3000/mcp)

Every request needs the header: Authorization: Bearer <MCP_TOKEN>

## Deploy
1. Install pm2 and ngrok, and add your ngrok authtoken
2. pm2 start npx --name mcp-server -- tsx src/server.ts
3. pm2 start ngrok --interpreter none --name tunnel -- http --url=YOUR-DOMAIN.ngrok-free.dev 3000
4. pm2 save

## Connect a client
- MCP Inspector: Streamable HTTP, your https URL, custom header Authorization: Bearer <token>
- Gemini CLI: add the URL (httpUrl) and header under mcpServers in ~/.gemini/settings.json
- Scripted client: npx tsx client-demo.ts 1b, then npx tsx client-demo.ts 2

## Security
- Sandbox: every path goes through resolveSafe (src/sandbox.ts). It rejects ../, absolute paths, null bytes, and symlinks pointing outside the workspace. npm test runs 7 tests.
- Bearer token auth on every request. The secret is in .env, which is git-ignored.
- Git tools call git with an argument array (no shell), only inside the workspace, with a timeout.
- Tool errors return clean messages and never crash the server.
- Every call is logged to logs/tool-calls.jsonl (tool, arguments, duration, error flag).

## Handoff protocol
The workspace holds four files that let a new session continue without chat memory:
- PROJECT_STATE.md: start-of-session protocol, goal, status, next steps
- PLAN_LOG.md: append-only log, one line per step
- CHECKPOINTS.md: verified milestones, each saved with git_commit
- DECISIONS.md: why choices were made

The workspace is its own git repo, so agent commits never touch the server code.

## Demo task
Build a Software Process Models notes pack across two sessions.
- Session 1: Gemini CLI created three outlines, INDEX.md and PLAN_LOG entries, then hit its free-tier quota. The remaining steps (checkpoint CP1, state update, commit) were finished by the scripted client.
- Session 2: a new connection that read only the four handoff files, found CP1, reviewed all three outlines with str_replace, logged each step, added CP2, and committed.

Evidence is in evidence/: handoff files, tool-call log, session transcripts, workspace git log, and test output.

## Session 3 (real agent)
After the quota reset, Gemini CLI resumed from the handoff files in a fresh chat, added comparison.md, logged its steps, wrote checkpoint CP3, and committed. See evidence/gemini-session-3.txt and REPORT.md section 5.
