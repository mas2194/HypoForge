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
   * Creates a Pull Request through the governed broker.
   */
  async createPullRequest(params: CreatePullRequestParams): Promise<{ url: string; number: number }> {
    this.validateBranchTarget(params.head);

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
    };
  }
}
