# MCP File Server: Short Report

## 1. Stack and why
- **Node.js + TypeScript with the official MCP SDK.** It is the reference stack, has the most complete Streamable HTTP support, and tsx lets us run TypeScript without a build step.
- **Streamable HTTP transport.** Required for a remote connector. stdio only works locally.
- **zod validation on every tool input.** Bad input is rejected before any file is touched.
- **ngrok static domain + pm2.** ngrok gives a stable HTTPS URL for free. pm2 keeps the server and tunnel alive and restarts them if they crash.
- **git on the host, scoped to the workspace.** The workspace is its own repo, so agent commits can never modify server code.
- **Testing:** MCP Inspector, node:test sandbox tests (7 passing), Gemini CLI as a real client, and a scripted SDK client.

## 2. Tool design choices
- **9 tools:** list_files, read_file, write_file, str_replace, delete_file, search_files, git_status, git_log, git_commit.
- **str_replace requires exactly one match.** If the text is missing or appears more than once, nothing changes and the error says why. This stops an agent from silently editing the wrong spot, and it is cheaper than rewriting a whole file.
- **search_files returns at most 50 hits, 200 characters per line.** This keeps results small so an agent's context is not flooded, which supports agent efficiency.
- **delete_file only deletes files, never folders.** This limits the damage from a mistake.
- **Tool descriptions are written for the model.** They say what the tool does and its limits, so the agent picks the right tool.
- **Errors are returned as clean tool results (isError), not crashes,** so the agent can read the message and recover.
- **Handoff protocol:** PROJECT_STATE, PLAN_LOG, CHECKPOINTS and DECISIONS live in the workspace. PROJECT_STATE contains a start-of-session protocol, so a new session knows what to read and do first. Checkpoints are tied to git commits.
- **Logging:** every call is written to logs/tool-calls.jsonl (tool, arguments, duration, error flag). Long text is stored as its length, not its content.

## 3. Security and tradeoffs
- **Sandbox (resolveSafe):** every path is resolved against the workspace root. It rejects ../ traversal, absolute paths, null bytes, and symlinks that resolve outside the workspace. 7 tests cover these cases, and a live attack through the Inspector (read ../../../etc/passwd) returned "Path escapes workspace".
- **Bearer token auth:** without it, anyone with the public URL could read, write and delete files. The token lives in .env, which is git-ignored.
- **No shell for git:** git is called with an argument array, so a commit message cannot inject commands. It runs only in the workspace, with a timeout.
- **Tradeoffs and limits:**
  - A single shared token is simple but not per-user, and it must be rotated by hand.
  - The server is only reachable while the laptop is on and pm2 and ngrok are running.
  - The tunnel exposes the server to the internet, so the token is the only barrier. Rate limiting and OAuth would be the next step.
  - The server is stateless (a fresh server per request). That is simpler and safer, but there is no session memory, so all continuity lives in the handoff files.
  - Reads are limited by file size in search, but read_file has no size cap yet.

## 4. Demo and honest limitations
Task: build a Software Process Models notes pack across two sessions.
- **Session 1:** Gemini CLI, a real LLM client, connected over HTTPS with the token and created the three outlines, INDEX.md and PLAN_LOG entries. It then hit the free-tier quota limit.
- **Session 1 finish and Session 2:** because the quota did not reset in time, these were run by a scripted MCP client (client-demo.ts) written with the official SDK. Session 2 is a brand-new connection that reads only the four handoff files, finds checkpoint CP1, reviews all three outlines with str_replace, logs each step, adds CP2, and commits.
- **Limitation:** Session 2 was scripted, not driven by an LLM, so it demonstrates that the handoff files and tools support resuming, but not an agent's own decision-making. With more quota, the next step is to run Session 2 with a real agent.
- Evidence is in evidence/: handoff files, tool-call log, session transcripts, workspace git log, and test output.

## 5. Update: Session 3 by a real agent
After the quota reset, Session 3 was run by Gemini CLI (a real LLM client) in a brand-new chat. It followed the start-of-session protocol in PROJECT_STATE.md, read the four handoff files, created notes/process-models/comparison.md, linked it from INDEX.md, logged its steps in PLAN_LOG.md, added checkpoint CP3, updated PROJECT_STATE.md, and committed with git_commit. This shows the handoff protocol works for an agent with no memory of earlier sessions. Session 2 remains scripted (see section 4). Transcript: evidence/transcripts/gemini-session-3.txt.

## 6. Known limitations and next steps
- Gemini's Session 1 chat text was not saved; its work is visible in evidence/logs/tool-calls.jsonl, PLAN_LOG.md and the git history.
- The log mixes smoke tests, scripted runs and agent runs, so the call count is not one clean demo.
- There is no append tool, so adding a log line costs a read plus a full rewrite. An append_file tool would cut those calls.
- pm2 startup is not configured, so the server does not return after a reboot.
- Next: per-user tokens, rate limiting, if_version locking, read_file size cap.
