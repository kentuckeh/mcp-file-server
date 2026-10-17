# DECISIONS
Why things were chosen, so a new session does not redo or undo them.

- D1 | Workspace is its own git repo, separate from the server code, so agent commits cannot touch server code.
- D2 | All paths go through resolveSafe, so no tool can leave the workspace.
- D3 | Streamable HTTP over ngrok, with a bearer token, kept alive by pm2.
