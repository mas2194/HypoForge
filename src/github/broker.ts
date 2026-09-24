import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

export interface GitHubBrokerOptions {
  appId?: string;
  privateKey?: string;
  installationId?: number;
  personalAccessToken?: string;
  owner?: string;
  repo?: string;
  dryRun?: boolean;
}

export interface CreatePullRequestParams {
  title: string;
  head: string;
  base: string;
  body: string;
  draft?: boolean;
}

export class GitHubBroker {
  private octokit?: Octokit;
  readonly owner?: string;
  readonly repo?: string;
  readonly dryRun: boolean;

  constructor(options: GitHubBrokerOptions = {}) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.dryRun = options.dryRun ?? (!options.personalAccessToken && !options.appId);

    if (!this.dryRun) {
      if (options.appId && options.privateKey && options.installationId) {
        this.octokit = new Octokit({
          authStrategy: createAppAuth,
          auth: {
            appId: options.appId,
            privateKey: options.privateKey,
            installationId: options.installationId,
          },
        });
      } else if (options.personalAccessToken) {
        this.octokit = new Octokit({
          auth: options.personalAccessToken,
        });
      }
    }
  }

  /**
   * Enforces policy: Direct push to default/main branch is strictly rejected.
   */
  validateBranchTarget(branch: string): void {
    if (branch === "main" || branch === "master") {
      throw new Error(`Policy violation: Direct mutations to branch '${branch}' are forbidden.`);
    }
  }

  /**
   * Searches for existing open Pull Request for head/base pair (Idempotent Reconciliation).
   */
  async findExistingPullRequest(head: string, base: string): Promise<{ url: string; number: number; headSha?: string } | null> {
    if (this.dryRun || !this.octokit || !this.owner || !this.repo) {
      return null;
    }

    try {
      const res = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        head: `${this.owner}:${head}`,
        base,
        state: "open",
      });
      if (res.data.length > 0) {
        const pr = res.data[0];
        return {
          url: pr.html_url,
          number: pr.number,
          headSha: pr.head.sha,
        };
      }
    } catch {
      // Non-fatal search failure
    }
    return null;
  }

  /**
   * Creates a Pull Request through the governed broker.
   * Performs idempotent reconciliation before creating a duplicate PR.
   */
  async createPullRequest(params: CreatePullRequestParams): Promise<{ url: string; number: number; headSha?: string }> {
    this.validateBranchTarget(params.head);

    // 1. Reconciliation: Check if PR already exists
    const existing = await this.findExistingPullRequest(params.head, params.base);
    if (existing) {
      console.log(`[GitHub Broker] Reconciled with existing PR #${existing.number}: ${existing.url}`);
      return existing;
    }

    if (this.dryRun || !this.octokit || !this.owner || !this.repo) {
      console.log(`[GitHub Broker (Dry Run)] Created Pull Request for ${params.head} -> ${params.base}`);
      return {
        url: `https://github.com/${this.owner ?? "mas2194"}/${this.repo ?? "my_harness"}/pull/mock`,
        number: 42,
      };
    }

    const res = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: params.title,
      head: params.head,
      base: params.base,
      body: params.body,
      draft: params.draft ?? false,
    });

    return {
      url: res.data.html_url,
      number: res.data.number,
      headSha: res.data.head.sha,
    };
  }
}
