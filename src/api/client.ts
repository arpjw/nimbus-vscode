import * as https from "https";
import * as http from "http";

export class NimbusClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private async request(method: string, path: string, body?: object): Promise<any> {
    const url = new URL(path, this.baseUrl);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined;
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`)); }
        });
      });
      req.on("error", reject);
      if (data) { req.write(data); }
      req.end();
    });
  }

  async ensureRepo(repoUrl: string): Promise<{ workspace_id: string; repo_id: string }> {
    // List existing workspaces/repos first
    const repos = await this.request("GET", "/repos/");
    if (Array.isArray(repos)) {
      const existing = repos.find((r: any) =>
        r.github_url === repoUrl || r.full_name === repoUrl.replace("https://github.com/", "")
      );
      if (existing) {
        return { workspace_id: existing.workspace_id, repo_id: existing.id };
      }
    }
    // Create a workspace
    const repoName = repoUrl.replace("https://github.com/", "").replace("/", "-");
    const ws = await this.request("POST", "/workspaces/", { name: repoName });
    // Register the repo
    const repo = await this.request("POST", "/repos/", {
      workspace_id: ws.id,
      url: repoUrl,
      name: repoUrl.replace("https://github.com/", "").replace("/", "-"),
    });
    return { workspace_id: ws.id, repo_id: repo.id };
  }

  async submitTask(repoUrl: string, description: string, skillName?: string): Promise<{ task_id: string }> {
    const { workspace_id, repo_id } = await this.ensureRepo(repoUrl);
    return this.request("POST", "/tasks/", {
      workspace_id,
      repo_id,
      description,
      ...(skillName ? { skill: skillName } : {}),
    });
  }

  async getTask(taskId: string): Promise<{ id: string; status: string; phase: string; pr_url?: string; error?: string }> {
    return this.request("GET", `/tasks/${taskId}/`);
  }

  async listSkills(): Promise<Array<{ name: string; description: string }>> {
    return this.request("GET", "/skills/");
  }

  async listRepos(): Promise<Array<{ id: string; full_name: string }>> {
    return this.request("GET", "/repos/");
  }

  async reviewPR(prUrl: string): Promise<{ verdict: string; summary: string }> {
    return this.request("POST", "/tasks/review/", { pr_url: prUrl });
  }
}
