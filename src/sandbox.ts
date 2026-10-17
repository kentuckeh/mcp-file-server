import fs from "node:fs/promises";
import path from "node:path";

export const WORKSPACE = path.resolve("workspace");

function inside(root: string, p: string) {
  return p === root || p.startsWith(root + path.sep);
}

// Turns a user-supplied relative path into a safe absolute path,
// or throws if it would leave the workspace.
export async function resolveSafe(rel: string): Promise<string> {
  if (rel.includes("\0")) throw new Error("Invalid path");
  const root = await fs.realpath(WORKSPACE);
  const target = path.resolve(root, rel);
  if (!inside(root, target)) throw new Error("Path escapes workspace");

  // Symlink check: find the deepest part of the path that exists
  // and make sure its real location is still inside the workspace.
  let probe = target;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      if (!inside(root, real)) throw new Error("Path escapes workspace via symlink");
      break;
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return target;
}
