import * as https from "https";
import * as http from "http";
import { URL } from "url";

interface TaskResponse {
  id: string;
  status: string;
  phase: string;
  pr_url?: string;
  error?: string;
}

interface Skill {
  name: string;
  description: string;
}

interface Repo {
  id: string;
  full_name: string;
}

export class NimbusClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const isHttps = url.protocol === "https:";
      const lib = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      };

      const req = lib.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`Invalid JSON response: ${raw}`));
          }
        });
      });

      req.on("error", reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async submitTask(
    repoUrl: string,
    description: string,
    skillName?: string
  ): Promise<{ task_id: string }> {
    return this.request<{ task_id: string }>("POST", "/tasks", {
      repo_url: repoUrl,
      description,
      skill: skillName,
    });
  }

  async getTask(taskId: string): Promise<TaskResponse> {
    return this.request<TaskResponse>("GET", `/tasks/${taskId}`);
  }

  async listSkills(): Promise<Skill[]> {
    return this.request<Skill[]>("GET", "/skills");
  }

  async listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>("GET", "/repos");
  }

  async reviewPR(
    prUrl: string
  ): Promise<{ verdict: string; summary: string }> {
    return this.request<{ verdict: string; summary: string }>(
      "POST",
      "/tasks/review",
      { pr_url: prUrl }
    );
  }
}
