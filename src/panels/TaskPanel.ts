import * as vscode from "vscode";
import { getBackendUrl } from "../config";

const PHASES = ["Clone", "Index", "Plan", "Implement", "Verify", "Review", "PR"];

function getWebviewContent(taskId: string, description: string, backendUrl: string): string {
  const truncated = description.length > 50 ? description.slice(0, 47) + "..." : description;
  const wsUrl = backendUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const phaseSpans = PHASES.map(
    (p) => `<span class="phase" id="phase-${p.toLowerCase()}">${p}</span>`
  ).join('<span class="phase-sep">·</span>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nimbus</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0A0A0A;
    color: #FAFAFA;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
    padding: 16px;
    font-size: 13px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .header-title { font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }
  .header-desc { color: #888; font-size: 12px; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .phases {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .phase {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 12px;
    background: #1a1a1a;
    color: #444;
    transition: color 0.3s, background 0.3s;
  }
  .phase.active {
    color: #c4a96a;
    background: #1f1a10;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .phase.done { color: #6aab7a; background: #101a12; }
  .phase.failed { color: #e05c5c; background: #1a1010; }
  .phase-sep { color: #333; font-size: 11px; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .log-label { font-size: 11px; color: #555; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
  .log {
    height: 220px;
    overflow-y: auto;
    background: #0d0d0d;
    color: #888;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid #1a1a1a;
  }
  .pr-section {
    margin-top: 16px;
    display: none;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .pr-section.visible { display: flex; }
  .pr-link { color: #c4a96a; font-size: 12px; word-break: break-all; flex: 1; }
  .btn {
    padding: 5px 14px;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
  }
  .btn-primary { background: #c4a96a; color: #0A0A0A; font-weight: 600; }
  .btn-secondary { background: #222; color: #FAFAFA; }
</style>
</head>
<body>
<div class="header">
  <span class="header-title">Nimbus</span>
  <span class="header-desc" title="${description.replace(/"/g, "&quot;")}">${truncated}</span>
</div>
<div class="phases">${phaseSpans}</div>
<div class="log-label">Logs</div>
<pre class="log" id="log"></pre>
<div class="pr-section" id="pr-section">
  <a class="pr-link" id="pr-link" href="#" target="_blank"></a>
  <button class="btn btn-primary" id="open-pr-btn">Open PR</button>
  <button class="btn btn-secondary" id="run-another-btn">Run another task</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const logEl = document.getElementById('log');
  const prSection = document.getElementById('pr-section');
  const prLink = document.getElementById('pr-link');
  const openPrBtn = document.getElementById('open-pr-btn');
  const runAnotherBtn = document.getElementById('run-another-btn');

  function appendLog(line) {
    logEl.textContent += line + '\\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setPhase(name, status) {
    const el = document.getElementById('phase-' + name.toLowerCase());
    if (!el) return;
    el.className = 'phase ' + status;
    if (status === 'done') el.textContent = '✓ ' + name;
    if (status === 'failed') el.textContent = '✗ ' + name;
    else if (status !== 'done') el.textContent = name;
  }

  openPrBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'openPR', url: prLink.href });
  });
  runAnotherBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'runAnother' });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'phase_update') {
      setPhase(msg.phase, msg.status);
      appendLog('[phase] ' + msg.phase + ' → ' + msg.status);
    } else if (msg.type === 'log') {
      appendLog(msg.line);
    } else if (msg.type === 'done') {
      prLink.textContent = msg.pr_url;
      prLink.href = msg.pr_url;
      prSection.classList.add('visible');
      appendLog('[done] PR: ' + msg.pr_url);
    } else if (msg.type === 'failed') {
      appendLog('[error] ' + msg.error);
    }
  });

  // WebSocket connection
  const wsUrl = '${wsUrl}/ws/tasks/${taskId}/logs';
  let ws;
  let pollInterval;

  function startPolling() {
    pollInterval = setInterval(() => {
      fetch('${backendUrl}/tasks/${taskId}', {
        headers: { 'X-API-Key': '' }
      }).then(r => r.json()).then(data => {
        if (data.phase) setPhase(data.phase, data.status === 'running' ? 'active' : data.status === 'done' ? 'done' : data.status === 'failed' ? 'failed' : 'active');
        if (data.status === 'done' && data.pr_url) {
          prLink.textContent = data.pr_url;
          prLink.href = data.pr_url;
          prSection.classList.add('visible');
          clearInterval(pollInterval);
        } else if (data.status === 'failed') {
          appendLog('[error] ' + (data.error || 'Task failed'));
          clearInterval(pollInterval);
        }
      }).catch(() => {});
    }, 3000);
  }

  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'phase') {
          setPhase(data.phase, 'active');
        } else if (data.type === 'log') {
          appendLog(data.line);
        } else if (data.type === 'done') {
          prLink.textContent = data.pr_url;
          prLink.href = data.pr_url;
          prSection.classList.add('visible');
        }
      } catch {}
    };
    ws.onerror = () => {
      ws.close();
      startPolling();
    };
    ws.onclose = (event) => {
      if (!event.wasClean) startPolling();
    };
  } catch {
    startPolling();
  }
</script>
</body>
</html>`;
}

export class TaskPanel {
  static currentPanel: TaskPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    taskId: string,
    description: string
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message: { type: string; url?: string }) => {
        if (message.type === "openPR" && message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        } else if (message.type === "runAnother") {
          vscode.commands.executeCommand("nimbus.run");
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.html = getWebviewContent(
      taskId,
      description,
      getBackendUrl()
    );
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    taskId: string,
    description: string
  ): TaskPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TaskPanel.currentPanel) {
      TaskPanel.currentPanel.panel.reveal(column);
      TaskPanel.currentPanel.panel.webview.html = getWebviewContent(
        taskId,
        description,
        getBackendUrl()
      );
      return TaskPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "nimbusTask",
      "Nimbus",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    TaskPanel.currentPanel = new TaskPanel(panel, context, taskId, description);
    return TaskPanel.currentPanel;
  }

  update(message: { type: string; payload: unknown }): void {
    this.panel.webview.postMessage(message.payload);
  }

  dispose(): void {
    TaskPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
