# MCP File Server

An MCP (Model Context Protocol) server that gives an AI agent file and git tools inside one sandboxed workspace folder. It works as shared memory between sessions: one session writes plans and notes, and a later session resumes from them.

## Stack
- Node.js 22 + TypeScript (tsx) and the official @modelcontextprotocol/sdk
- Streamable HTTP (Express, endpoint /mcp), zod validation on every tool input
- ngrok static domain (HTTPS), pm2 process manager
- Testing: MCP Inspector, node:test sandbox tests, Gemini CLI, scripted SDK client

## Tools (9)
- list_files, read_file, write_file, str_replace (exactly one match), delete_file (files only)
- search_files (case-insensitive, max 50 hits)
- git_status, git_log, git_commit (workspace repo only)

## Setup
Every request needs the header `Authorization: Bearer <MCP_TOKEN>`.

## Deploy
Install ngrok and add your authtoken first.

## Connect a client
- MCP Inspector: Streamable HTTP, your https URL, custom header Authorization: Bearer <token>
- Gemini CLI: add httpUrl and headers under mcpServers in ~/.gemini/settings.json
- Scripted client: `npx tsx client-demo.ts 1b`, then `npx tsx client-demo.ts 2`

## Security
- Sandbox: every path goes through resolveSafe (src/sandbox.ts); it rejects ../, absolute paths, null bytes and symlinks leaving the workspace.
- Bearer token on every request; the secret lives in .env (git-ignored).
- git runs with an argument array (no shell), only inside the workspace, with a timeout.
- Errors come back as clean tool results. Every call is logged to logs/tool-calls.jsonl.

## Handoff protocol
The workspace holds PROJECT_STATE.md (start protocol, goal, status, next steps), PLAN_LOG.md (append-only), CHECKPOINTS.md (milestones tied to commits) and DECISIONS.md. The workspace is its own git repo, so agent commits never touch server code.

## Demo task: Software Process Models notes pack
- Session 1: Gemini CLI created the outlines and INDEX.md, then hit its free quota; a scripted client finished the checkpoint and state update.
- Session 2: scripted client, a new connection that read only the handoff files and reviewed all outlines.
- Session 3: Gemini CLI (real agent) resumed from the handoff files, added comparison.md, logged, checkpointed (CP3) and committed.

## Repo map
