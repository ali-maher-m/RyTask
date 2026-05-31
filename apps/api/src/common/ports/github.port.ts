/** GitHub egress port (§9). M5 wires the real GitHub App adapter (webhook verify). */
export interface GitHubPort {
  createComment(repo: string, issueNumber: number, body: string): Promise<void>;
}

export const noopGitHub: GitHubPort = {
  async createComment(repo: string, issueNumber: number, body: string): Promise<void> {
    console.log(`[github:noop] ${repo}#${issueNumber}: ${body}`);
  },
};
