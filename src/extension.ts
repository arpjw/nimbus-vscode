import * as vscode from "vscode";
import { isConfigured, promptForApiKey } from "./config";
import { runTask } from "./commands/runTask";
import { reviewPR } from "./commands/reviewPR";
import { runSkill } from "./commands/runSkill";
import { TaskPanel } from "./panels/TaskPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("nimbus.run", (uri?: vscode.Uri) =>
      runTask(context, uri)
    ),
    vscode.commands.registerCommand("nimbus.reviewPR", () =>
      reviewPR(context)
    ),
    vscode.commands.registerCommand("nimbus.runSkill", () =>
      runSkill(context)
    ),
    vscode.commands.registerCommand("nimbus.openDashboard", () =>
      vscode.env.openExternal(
        vscode.Uri.parse("https://get-nimbus.com/dashboard")
      )
    ),
    vscode.commands.registerCommand("nimbus.openPrism", () =>
      vscode.env.openExternal(
        vscode.Uri.parse("https://get-nimbus.com/prism")
      )
    )
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(robot) Nimbus";
  statusBarItem.command = "nimbus.run";
  statusBarItem.tooltip = "Run a Nimbus task";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  if (!isConfigured()) {
    vscode.window
      .showInformationMessage(
        "Nimbus: Set your API key to get started.",
        "Configure"
      )
      .then((val) => {
        if (val === "Configure") {
          promptForApiKey();
        }
      });
  }
}

export function deactivate() {
  TaskPanel.currentPanel?.dispose();
}