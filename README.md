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
    git clone https://github.com/kentuckeh/mcp-file-server.git
    cd mcp-file-server
    npm install
    cp -r workspace-template workspace
    cd workspace && git init && git add -A && git commit -m "Initial handoff files" && cd ..
    cp .env.example .env
    (edit .env and set MCP_TOKEN to a long random string, e.g. from: openssl rand -hex 24)
    npm run start
    npm test

The server runs at http://localhost:3000/mcp (set PORT to change it). Every request needs the header: Authorization: Bearer <MCP_TOKEN>

## Deploy
Install ngrok and add your authtoken first, then:

    npm install -g pm2
    pm2 start npx --name mcp-server -- tsx src/server.ts
    pm2 start ngrok --interpreter none --name tunnel -- http --url=YOUR-DOMAIN.ngrok-free.dev 3000
    pm2 save

## Connect a client
- MCP Inspector: Streamable HTTP, your https URL, custom header Authorization: Bearer <token>
- Gemini CLI: add httpUrl and headers under mcpServers in ~/.gemini/settings.json
- Scripted client: npx tsx client-demo.ts 1b, then npx tsx client-demo.ts 2

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
    src/                 server, sandbox, tests, extra tools, logger
    client-demo.ts       scripted MCP client
    workspace-template/  starter handoff files
    REPORT.md            stack, tool design, security tradeoffs
    evidence/handoff/    final PROJECT_STATE, PLAN_LOG, CHECKPOINTS, DECISIONS
    evidence/transcripts/ Gemini session 3 and scripted sessions 1b and 2
    evidence/logs/       tool-calls.jsonl and workspace git log
    evidence/notes-output/ the notes pack the agents produced
    evidence/test-output.txt sandbox test results
