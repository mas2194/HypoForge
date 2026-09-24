import { describe, it, expect, afterEach } from "vitest";
import { WorktreeManager } from "../src/git/worktree.js";
import fs from "node:fs/promises";
import path from "node:path";

describe("WorktreeManager", () => {
  const manager = new WorktreeManager();
  const testBranch = "test-branch-tmp";
  let createdPath: string | null = null;

  afterEach(async () => {
    if (createdPath) {
      await manager.removeWorktree(createdPath, true, testBranch);
      createdPath = null;
    }
  });

  it("should create, list and remove a worktree", async () => {
    createdPath = await manager.createWorktree(testBranch, "test-wt");
    expect(createdPath).toBeTruthy();

    const stats = await fs.stat(createdPath);
    expect(stats.isDirectory()).toBe(true);

    const list = await manager.listWorktrees();
    const found = list.find((wt) => wt.path === createdPath);
    expect(found).toBeDefined();
    expect(found?.branch).toBe(testBranch);

    await manager.removeWorktree(createdPath, true, testBranch);
    createdPath = null;

    const listAfter = await manager.listWorktrees();
    const foundAfter = listAfter.find((wt) => wt.path === createdPath);
    expect(foundAfter).toBeUndefined();
  });
});
