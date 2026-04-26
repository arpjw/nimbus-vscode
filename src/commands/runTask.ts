import * as vscode from "vscode";
import { execSync } from "child_process";
import * as path from "path";
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

export async function runTask(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri
): Promise<void> {
  if (!isConfigured()) {
    await promptForApiKey();
    if (!isConfigured()) {
      return;
    }
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

  let prefill = "";
  if (uri) {
    const relativePath = path.relative(workspaceRoot, uri.fsPath);
    prefill = `File: ${relativePath}\n\nTask: `;
  } else if (vscode.window.activeTextEditor) {
    const editor = vscode.window.activeTextEditor;
    const selection = editor.selection;
    if (!selection.isEmpty) {
      const relativePath = path.relative(
        workspaceRoot,
        editor.document.uri.fsPath
      );
      const selectedText = editor.document.getText(selection);
      prefill = `File: ${relativePath}\nSelected:\n\`\`\`\n${selectedText}\n\`\`\`\n\nTask: `;
    }
  }

  const description = await vscode.window.showInputBox({
    prompt: "Describe the task for Nimbus",
    value: prefill,
    valueSelection: [prefill.length, prefill.length],
    ignoreFocusOut: true,
  });

  if (description === undefined || description.trim() === "") {
    return;
  }

  const client = new NimbusClient(getBackendUrl(), getApiKey()!);

  let skills: Array<{ name: string; description: string }> = [];
  try {
    skills = await client.listSkills();
  } catch {
    // proceed without skills
  }

  const skillItems = [
    "No skill",
    ...skills.map((s) => `${s.name} — ${s.description}`),
  ];
  const skillPick = await vscode.window.showQuickPick(skillItems, {
    placeHolder: "Select a skill (optional)",
  });

  if (skillPick === undefined) {
    return;
  }

  const skillName =
    skillPick === "No skill" ? undefined : skillPick.split(" — ")[0];

  const { task_id } = await client.submitTask(
    repoUrl,
    description.trim(),
    skillName
  );

  TaskPanel.createOrShow(context, task_id, description.trim());
}
