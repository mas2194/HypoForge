import fs from "node:fs/promises";
import path from "node:path";
import type { Skill, SkillDraft } from "./types.js";
import type { FtsMemoryIndex } from "../memory/fts-index.js";

export interface SkillManagerOptions {
  repoRoot?: string;
  ftsIndex?: FtsMemoryIndex;
}

export class SkillManager {
  readonly repoRoot: string;
  readonly skillsDir: string;
  private ftsIndex?: FtsMemoryIndex;

  constructor(options: SkillManagerOptions = {}) {
    this.repoRoot = path.resolve(options.repoRoot ?? process.cwd());
    this.skillsDir = path.resolve(this.repoRoot, ".agent", "skills");
    this.ftsIndex = options.ftsIndex;
  }

  setFtsIndex(ftsIndex: FtsMemoryIndex): void {
    this.ftsIndex = ftsIndex;
  }

  async getAllSkills(): Promise<Skill[]> {
    try {
      await fs.mkdir(this.skillsDir, { recursive: true });
      const files = await fs.readdir(this.skillsDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      const skills: Skill[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(this.skillsDir, file), "utf-8");
          const parsed = JSON.parse(content) as Skill;
          skills.push(parsed);
        } catch {
          // ignore corrupted skill files
        }
      }
      return skills;
    } catch {
      return [];
    }
  }

  async getSkillById(id: string): Promise<Skill | undefined> {
    const filePath = path.join(this.skillsDir, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as Skill;
    } catch {
      return undefined;
    }
  }

  async crystallizeSkill(draft: SkillDraft): Promise<Skill> {
    await fs.mkdir(this.skillsDir, { recursive: true });

    const slug = (draft.id || draft.name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const id = slug || `skill-${Date.now()}`;
    const existing = await this.getSkillById(id);

    const skill: Skill = {
      id,
      name: draft.name,
      description: draft.description,
      trigger: draft.trigger,
      command: draft.command,
      instructions: draft.instructions,
      tags: draft.tags ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      successCount: (existing?.successCount ?? 0) + 1,
    };

    const filePath = path.join(this.skillsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(skill, null, 2), "utf-8");

    // Index into FTS if available
    if (this.ftsIndex) {
      this.ftsIndex.insert({
        id: `skill:${id}`,
        type: "skill",
        title: skill.name,
        content: `${skill.description}\nTrigger: ${skill.trigger}\nCommand: ${skill.command ?? ""}\nInstructions: ${skill.instructions}`,
        tags: skill.tags.join(" "),
      });
    }

    return skill;
  }

  async matchSkills(goal: string, maxMatches: number = 3): Promise<Skill[]> {
    const all = await this.getAllSkills();
    if (all.length === 0) return [];

    const lowerGoal = goal.toLowerCase();

    // Score based on trigger keywords, tags, or description
    const scored = all.map((skill) => {
      let score = 0;
      const lowerTrigger = skill.trigger.toLowerCase();
      const lowerName = skill.name.toLowerCase();

      if (lowerGoal.includes(lowerTrigger)) score += 5;
      if (lowerGoal.includes(lowerName)) score += 3;

      for (const tag of skill.tags) {
        if (lowerGoal.includes(tag.toLowerCase())) score += 2;
      }

      if (skill.successCount > 0) {
        score += Math.min(skill.successCount, 3);
      }

      return { skill, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMatches)
      .map((s) => s.skill);
  }

  async recordSkillSuccess(id: string): Promise<void> {
    const skill = await this.getSkillById(id);
    if (!skill) return;

    skill.successCount += 1;
    const filePath = path.join(this.skillsDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(skill, null, 2), "utf-8");
  }
}
