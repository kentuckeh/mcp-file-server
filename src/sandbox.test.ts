import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafe, WORKSPACE } from "./sandbox.js";

test("allows a normal file", async () => {
  await resolveSafe("hello.txt");
});

test("allows a new file in a new folder", async () => {
  await resolveSafe("new/folder/file.txt");
});

test("rejects ../", async () => {
  await assert.rejects(resolveSafe("../secret.txt"));
});

test("rejects deep ../../", async () => {
  await assert.rejects(resolveSafe("../../etc/passwd"));
});

test("rejects sneaky sub/../../", async () => {
  await assert.rejects(resolveSafe("sub/../../x"));
});

test("rejects absolute paths", async () => {
  await assert.rejects(resolveSafe("/etc/passwd"));
});

test("rejects symlink pointing outside", async () => {
  const link = path.join(WORKSPACE, "evil-link");
  await fs.rm(link, { force: true });
  await fs.symlink("/tmp", link);
  try {
    await assert.rejects(resolveSafe("evil-link/anything.txt"));
  } finally {
    await fs.rm(link, { force: true });
  }
});
