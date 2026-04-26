import * as vscode from "vscode";
import { getApiKey, getBackendUrl, isConfigured, promptForApiKey } from "../config";
import { NimbusClient } from "../api/client";

export async function reviewPR(context: vscode.ExtensionContext): Promise<void> {
  if (!isConfigured()) {
    await promptForApiKey();
    if (!isConfigured()) {
      return;
    }
  }

  const prUrl = await vscode.window.showInputBox({
    prompt: "Enter PR URL (e.g. https://github.com/owner/repo/pull/42)",
    placeHolder: "https://github.com/owner/repo/pull/42",
    ignoreFocusOut: true,
  });

  if (!prUrl || prUrl.trim() === "") {
    return;
  }

  const client = new NimbusClient(getBackendUrl(), getApiKey()!);

  let result: { verdict: string; summary: string };
  try {
    result = await client.reviewPR(prUrl.trim());
  } catch (err) {
    vscode.window.showErrorMessage(
      `Nimbus: Failed to review PR — ${(err as Error).message}`
    );
    return;
  }

  const outputChannel = vscode.window.createOutputChannel("Nimbus");
  outputChannel.appendLine(`Verdict: ${result.verdict}\n\n${result.summary}`);
  outputChannel.show(true);

  vscode.window.showInformationMessage(`Nimbus PR Review: ${result.verdict}`);
}
