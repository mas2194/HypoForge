export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string;
  command?: string;
  instructions: string;
  tags: string[];
  createdAt: string;
  successCount: number;
}

export type SkillDraft = Omit<Skill, "id" | "createdAt" | "successCount"> & {
  id?: string;
};
