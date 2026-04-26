import * as vscode from "vscode";

export function getApiKey(): string | undefined {
  const key = vscode.workspace.getConfiguration("nimbus").get<string>("apiKey");
  return key && key.trim() !== "" ? key.trim() : undefined;
}

export function getBackendUrl(): string {
  return (
    vscode.workspace
      .getConfiguration("nimbus")
      .get<string>("backendUrl") || "https://api.get-nimbus.com"
  );
}

export function isConfigured(): boolean {
  return getApiKey() !== undefined;
}

export async function promptForApiKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: "Enter your Nimbus API key (nk_...)",
    placeHolder: "nk_...",
    password: true,
    ignoreFocusOut: true,
  });
  if (key && key.trim() !== "") {
    await vscode.workspace
      .getConfiguration("nimbus")
      .update("apiKey", key.trim(), vscode.ConfigurationTarget.Global);
  }
}
