import * as vscode from "vscode";
import { execSync } from "child_process";
import { getApiKey, getBackendUrl, isConfigured, promptForApiKey } from "../config";
import { NimbusClient } from "../api/client";
import { TaskPanel } from "../panels/TaskPanel";

function detectRepoUrl(workspaceRoot: string): string | undefined {
  try {
    const remote = execSync(`git -C "${workspaceRoot}" remote get-url origin`, {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return remote.replace(/\.git$/, "");
  } catch {
    return undefined;
  }
}

export async function runSkill(context: vscode.ExtensionContext): Promise<void> {
  if (!isConfigured()) {
    await promptForApiKey();
    if (!isConfigured()) {
      return;
    }
  }

  const client = new NimbusClient(getBackendUrl(), getApiKey()!);

  let skills: Array<{ name: string; description: string }> = [];
  try {
    skills = await client.listSkills();
  } catch (err) {
    vscode.window.showErrorMessage(
      `Nimbus: Failed to fetch skills — ${(err as Error).message}`
    );
    return;
  }

  if (skills.length === 0) {
    vscode.window.showWarningMessage("Nimbus: No skills available.");
    return;
  }

  const skillPick = await vscode.window.showQuickPick(
    skills.map((s) => ({ label: s.name, detail: s.description, skill: s })),
    { placeHolder: "Select a skill to run" }
  );

  if (!skillPick) {
    return;
  }

  const skillName = skillPick.skill.name;

  const description = await vscode.window.showInputBox({
    prompt: `Task description for skill: ${skillName}`,
    ignoreFocusOut: true,
  });

  if (!description || description.trim() === "") {
    return;
  }

  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  let repoUrl = detectRepoUrl(workspaceRoot);
  if (!repoUrl) {
    const input = await vscode.window.showInputBox({
      prompt: "Enter your repository URL (e.g. https://github.com/owner/repo)",
      placeHolder: "https://github.com/owner/repo",
      ignoreFocusOut: true,
    });
    if (!input || input.trim() === "") {
      return;
    }
    repoUrl = input.trim();
  }

  const { task_id } = await client.submitTask(
    repoUrl,
    description.trim(),
    skillName
  );

  TaskPanel.createOrShow(context, task_id, description.trim());
}
