/**
 * Autonomous Agent Harness - Web UI
 * Split-screen layout:
 * - Left Pane: Model Conversation (Chat UI with @file completions and slash commands)
 * - Right Pane: Harness Stage Pipeline Graph & Codex Sub-Agent Activity Panel
 */
export function renderWebUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Autonomous Agent Harness</title>
  <style>
    :root {
      --bg-primary: #0f1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --bg-card: #1c2128;
      --bg-hover: #30363d;
      --border-color: #30363d;
      --border-focus: #58a6ff;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-amber: #d29922;
      --accent-red: #f85149;
      --accent-purple: #bc8cff;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Top Navigation */
    header {
      height: 52px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .brand-logo {
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: bold;
      font-size: 13px;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-green);
    }

    .status-dot.running {
      background: var(--accent-blue);
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% { opacity: 0.4; transform: scale(0.9); }
      50% { opacity: 1; transform: scale(1.2); }
      100% { opacity: 0.4; transform: scale(0.9); }
    }

    .config-selectors {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    select, button, input {
      font-family: inherit;
    }

    .select-dropdown {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      outline: none;
      cursor: pointer;
    }

    .select-dropdown:focus {
      border-color: var(--border-focus);
    }

    /* Main Container (Split Screen) */
    .app-main {
      flex: 1;
      display: grid;
      grid-template-columns: 42% 58%;
      height: calc(100vh - 52px);
      overflow: hidden;
    }

    /* Left Pane: Conversation */
    .chat-pane {
      background: var(--bg-primary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      height: 100%;
      position: relative;
    }

    .pane-header {
      padding: 10px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      scroll-behavior: smooth;
    }

    .message {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 90%;
    }

    .message.user {
      align-self: flex-end;
    }

    .message.assistant, .message.system {
      align-self: flex-start;
      max-width: 95%;
    }

    .message-meta {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 4px;
    }

    .message.user .message-meta {
      justify-content: flex-end;
    }

    .message-bubble {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13.5px;
      line-height: 1.5;
      word-break: break-word;
    }

    .message.user .message-bubble {
      background: #1f6feb;
      color: #ffffff;
      border-bottom-right-radius: 2px;
    }

    .message.assistant .message-bubble {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-bottom-left-radius: 2px;
    }

    .message.system .message-bubble {
      background: rgba(88, 166, 255, 0.08);
      border: 1px dashed rgba(88, 166, 255, 0.3);
      color: var(--text-secondary);
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 6px;
    }

    .message-bubble pre {
      background: var(--bg-tertiary);
      padding: 10px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      margin: 8px 0;
      border: 1px solid var(--border-color);
    }

    .message-bubble code {
      font-family: var(--font-mono);
      background: rgba(110, 118, 129, 0.2);
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 12px;
    }

    .message-bubble p {
      margin-bottom: 6px;
    }
    .message-bubble p:last-child {
      margin-bottom: 0;
    }

    .message-bubble ul, .message-bubble ol {
      margin-left: 20px;
      margin-top: 4px;
      margin-bottom: 4px;
    }

    /* Chat Input Area */
    .chat-input-wrapper {
      padding: 12px 16px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      position: relative;
    }

    .input-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .model-effort-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill-select-wrapper {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 4px 8px;
      transition: border-color 0.15s, background 0.15s;
    }

    .pill-select-wrapper:hover, .pill-select-wrapper:focus-within {
      border-color: var(--border-focus);
      background: var(--bg-card);
    }

    .pill-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      user-select: none;
    }

    .pill-select {
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      outline: none;
      padding: 0;
    }

    .pill-select option {
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .pill-select optgroup {
      background: var(--bg-tertiary);
      color: var(--accent-blue);
      font-weight: 600;
      font-size: 11px;
    }

    .quick-chips {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .chip-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }

    .chip-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .input-box {
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 8px 10px;
      transition: border-color 0.15s;
    }

    .input-box:focus-within {
      border-color: var(--border-focus);
    }

    textarea#user-input {
      background: transparent;
      border: none;
      color: var(--text-primary);
      resize: none;
      outline: none;
      min-height: 48px;
      max-height: 140px;
      font-size: 13.5px;
      line-height: 1.45;
    }

    .input-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .send-btn {
      background: #238636;
      color: #fff;
      border: none;
      padding: 5px 14px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }

    .send-btn:hover:not(:disabled) {
      background: #2ea043;
    }

    .send-btn:disabled {
      background: var(--bg-tertiary);
      color: var(--text-muted);
      cursor: not-allowed;
    }

    /* Autocomplete Dropdown for @ */
    .autocomplete-list {
      position: absolute;
      bottom: 100%;
      left: 16px;
      right: 16px;
      max-height: 180px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 -4px 16px rgba(0,0,0,0.4);
      overflow-y: auto;
      display: none;
      z-index: 100;
    }

    .autocomplete-item {
      padding: 8px 12px;
      font-size: 12.5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
    }

    .autocomplete-item:hover, .autocomplete-item.selected {
      background: #1f6feb;
      color: #fff;
    }

    /* Right Pane: Pipeline Graph & Sub-Agents */
    .right-pane {
      background: var(--bg-primary);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    /* Pipeline Graph Section */
    .graph-section {
      height: 200px;
      min-height: 180px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }

    .graph-header {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .graph-canvas {
      flex: 1;
      padding: 12px 16px;
      overflow-x: auto;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stage-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      min-width: 88px;
      padding: 10px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }

    .stage-node:hover {
      border-color: var(--text-secondary);
      transform: translateY(-2px);
    }

    .stage-node.pending {
      opacity: 0.6;
    }

    .stage-node.running {
      border-color: var(--accent-blue);
      box-shadow: 0 0 12px rgba(88, 166, 255, 0.35);
      opacity: 1;
      background: rgba(88, 166, 255, 0.08);
    }

    .stage-node.success {
      border-color: var(--accent-green);
      opacity: 1;
    }

    .stage-node.failed {
      border-color: var(--accent-red);
      opacity: 1;
    }

    .stage-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      background: var(--bg-hover);
    }

    .stage-node.running .stage-icon {
      background: var(--accent-blue);
      color: #fff;
    }

    .stage-node.success .stage-icon {
      background: var(--accent-green);
      color: #fff;
    }

    .stage-node.failed .stage-icon {
      background: var(--accent-red);
      color: #fff;
    }

    .stage-label {
      font-size: 11.5px;
      font-weight: 600;
      text-align: center;
      color: var(--text-primary);
    }

    .stage-sub {
      font-size: 9.5px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .stage-arrow {
      color: var(--border-color);
      font-size: 14px;
      flex-shrink: 0;
    }

    .stage-arrow.active {
      color: var(--accent-blue);
    }

    /* Sub-Agent Output Panel (Codex Style) */
    .subagent-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
    }

    .subagent-header {
      padding: 10px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .subagent-title {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .subagent-filters {
      display: flex;
      gap: 6px;
    }

    .filter-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .filter-btn.active, .filter-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-color: var(--border-focus);
    }

    .subagent-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Codex Sub-Agent Card */
    .agent-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .agent-card.running {
      border-color: rgba(88, 166, 255, 0.7);
      box-shadow: 0 0 14px rgba(88, 166, 255, 0.15);
    }

    .agent-card-header {
      padding: 10px 14px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
    }

    .agent-identity {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .agent-avatar {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }

    .agent-names {
      display: flex;
      flex-direction: column;
    }

    .agent-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .agent-role {
      font-size: 11px;
      color: var(--text-muted);
    }

    .agent-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge {
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge.running {
      background: rgba(88, 166, 255, 0.15);
      color: var(--accent-blue);
      border: 1px solid rgba(88, 166, 255, 0.3);
    }

    .badge.completed {
      background: rgba(63, 185, 80, 0.15);
      color: var(--accent-green);
      border: 1px solid rgba(63, 185, 80, 0.3);
    }

    .badge.failed {
      background: rgba(248, 81, 73, 0.15);
      color: var(--accent-red);
      border: 1px solid rgba(248, 81, 73, 0.3);
    }

    .toggle-arrow {
      color: var(--text-muted);
      font-size: 12px;
      transition: transform 0.2s ease;
    }

    .agent-card.collapsed .toggle-arrow {
      transform: rotate(-90deg);
    }

    .agent-card-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--border-color);
      font-size: 12.5px;
    }

    .agent-card.collapsed .agent-card-body {
      display: none;
    }

    .activity-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .activity-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.4px;
    }

    .activity-content {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 220px;
      overflow-y: auto;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--text-muted);
      gap: 8px;
      text-align: center;
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- Top Navigation Header -->
  <header>
    <div class="brand">
      <div class="brand-logo">H</div>
      <span>my_harness</span>
      <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">| Autonomous Architecture Explorer</span>
    </div>

    <div class="header-controls">
      <div class="status-badge">
        <span class="status-dot" id="system-status-dot"></span>
        <span id="system-status-text">Connected</span>
      </div>
    </div>
  </header>

  <!-- Split Screen Layout -->
  <div class="app-main">
    <!-- Left Pane: Conversation with Model -->
    <div class="chat-pane">
      <div class="pane-header">
        <span>Model Conversation</span>
        <button id="clear-chat-btn" class="chip-btn">Clear Chat</button>
      </div>

      <div class="chat-messages" id="chat-messages">
        <!-- Messages rendered dynamically -->
        <div class="message system">
          <div class="message-bubble">
            👋 Welcome to <strong>Autonomous Agent Harness</strong>.<br>
            Enter your target engineering goal below to begin evidence-based exploration, or use slash commands (<code>/help</code>, <code>/model</code>, <code>/effort</code>). You can also type <code>@filename</code> to load workspace files into context.
          </div>
        </div>
      </div>

      <div class="chat-input-wrapper">
        <!-- Autocomplete dropdown for @file -->
        <div class="autocomplete-list" id="autocomplete-list"></div>

        <!-- Model & Effort Controls right next to prompt input -->
        <div class="input-toolbar">
          <div class="model-effort-bar">
            <div class="pill-select-wrapper" title="Select Active LLM Model">
              <span class="pill-label">🧠 Model:</span>
              <select id="model-select" class="pill-select">
                <optgroup label="GPT-6 Frontier">
                  <option value="gpt-6-luna" selected>GPT-6-Luna (Default)</option>
                  <option value="gpt-6-sol">GPT-6-Sol</option>
                  <option value="gpt-6-astra">GPT-6-Astra</option>
                  <option value="gpt-reserve">GPT-Reserve</option>
                </optgroup>
                <optgroup label="o-Series Reasoning">
                  <option value="o3-mini">o3-mini</option>
                  <option value="o1">o1</option>
                  <option value="o1-mini">o1-mini</option>
                  <option value="o1-preview">o1-preview</option>
                </optgroup>
                <optgroup label="GPT-4o & GPT-4">
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o-mini</option>
                  <option value="gpt-4-turbo">GPT-4-Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                </optgroup>
                <optgroup label="GPT-5 Series">
                  <option value="gpt-5.6-terra">GPT-5.6-Terra</option>
                  <option value="gpt-5.6-sol">GPT-5.6-Sol</option>
                  <option value="gpt-5.6-luna">GPT-5.6-Luna</option>
                  <option value="gpt-5.5">GPT-5.5</option>
                </optgroup>
                <optgroup label="Specialized">
                  <option value="codex-auto-review">Codex Auto Review</option>
                </optgroup>
              </select>
            </div>

            <div class="pill-select-wrapper" title="Select Reasoning Effort Depth">
              <span class="pill-label">⚡ Effort:</span>
              <select id="effort-select" class="pill-select">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high" selected>high</option>
                <option value="xhigh">xhigh</option>
                <option value="max">max</option>
                <option value="ultra">ultra</option>
              </select>
            </div>
          </div>

          <div class="quick-chips">
            <button class="chip-btn" onclick="quickFill('/help')">/help</button>
            <button class="chip-btn" onclick="quickFill('@package.json')">@package.json</button>
            <button class="chip-btn" onclick="quickFill('@src/main.ts')">@src/main.ts</button>
          </div>
        </div>

        <div class="input-box">
          <textarea
            id="user-input"
            placeholder="Type a goal or command (Enter to send, Shift+Enter for newline, @ to mention files)..."
          ></textarea>
          <div class="input-actions">
            <span>Press <strong>Enter</strong> to submit</span>
            <button id="send-btn" class="send-btn">
              <span>Send Goal</span>
              <span id="send-spinner" class="spinner" style="display: none;"></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Pane: Pipeline Graph & Sub-Agents -->
    <div class="right-pane">
      <!-- Pipeline Stage Graph -->
      <div class="graph-section">
        <div class="graph-header">
          <span>Harness Stage Pipeline</span>
          <span id="current-phase-display" style="font-family: var(--font-mono); color: var(--accent-blue);">Phase: Idle</span>
        </div>

        <div class="graph-canvas" id="graph-canvas">
          <!-- Dynamically populated or rendered stages -->
          <div class="stage-node pending" id="node-Inspect" onclick="filterByPhase('Inspect')">
            <div class="stage-icon">🔍</div>
            <div class="stage-label">Inspect</div>
            <div class="stage-sub">Topology</div>
          </div>
          <div class="stage-arrow">➔</div>

          <div class="stage-node pending" id="node-Triage" onclick="filterByPhase('Triage')">
            <div class="stage-icon">⚖️</div>
            <div class="stage-label">Triage</div>
            <div class="stage-sub">Fast/Deep</div>
          </div>
          <div class="stage-arrow">➔</div>

          <div class="stage-node pending" id="node-Explore" onclick="filterByPhase('Explore')">
            <div class="stage-icon">🔬</div>
            <div class="stage-label">Explore</div>
            <div class="stage-sub">Ladder</div>
          </div>
          <div class="stage-arrow">➔</div>

          <div class="stage-node pending" id="node-Integrate" onclick="filterByPhase('Integrate')">
            <div class="stage-icon">🔗</div>
            <div class="stage-label">Integrate</div>
            <div class="stage-sub">Lock SHA</div>
          </div>
          <div class="stage-arrow">➔</div>

          <div class="stage-node pending" id="node-Publish" onclick="filterByPhase('Publish')">
            <div class="stage-icon">🚀</div>
            <div class="stage-label">Publish</div>
            <div class="stage-sub">GitHub PR</div>
          </div>
          <div class="stage-arrow">➔</div>

          <div class="stage-node pending" id="node-Learn" onclick="filterByPhase('Learn')">
            <div class="stage-icon">📚</div>
            <div class="stage-label">Learn</div>
            <div class="stage-sub">ADR & Skills</div>
          </div>
        </div>
      </div>

      <!-- Codex Sub-Agent Activity Panel -->
      <div class="subagent-section">
        <div class="subagent-header">
          <div class="subagent-title">
            <span>Codex Sub-Agent Activity</span>
            <span id="agent-count-badge" class="badge running">0 Active</span>
          </div>
          <div class="subagent-filters">
            <button class="filter-btn active" onclick="setAgentFilter('all', this)">All</button>
            <button class="filter-btn" onclick="setAgentFilter('running', this)">Running</button>
            <button class="filter-btn" onclick="setAgentFilter('completed', this)">Completed</button>
            <button class="filter-btn" onclick="setAgentFilter('failed', this)">Failed</button>
          </div>
        </div>

        <div class="subagent-list" id="subagent-list">
          <div class="empty-state" id="empty-agent-state">
            <div style="font-size: 24px;">🤖</div>
            <div>No sub-agents active yet.</div>
            <div style="font-size: 11px;">Sub-agents spawned by the harness will stream real-time thinking, tool execution, and results here.</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // State management
    const state = {
      model: "o3-mini",
      effort: "medium",
      isRunning: false,
      currentPhase: "Idle",
      subAgents: new Map(), // agentId -> agentObject
      agentFilter: "all",
      phaseFilter: null,
      workspaceFiles: [],
    };

    const renderedMessageIds = new Set();

    // DOM Elements
    const chatMessagesEl = document.getElementById("chat-messages");
    const userInputEl = document.getElementById("user-input");
    const sendBtnEl = document.getElementById("send-btn");
    const sendSpinnerEl = document.getElementById("send-spinner");
    const modelSelectEl = document.getElementById("model-select");
    const effortSelectEl = document.getElementById("effort-select");
    const systemStatusDotEl = document.getElementById("system-status-dot");
    const systemStatusTextEl = document.getElementById("system-status-text");
    const currentPhaseDisplayEl = document.getElementById("current-phase-display");
    const subagentListEl = document.getElementById("subagent-list");
    const emptyAgentStateEl = document.getElementById("empty-agent-state");
    const agentCountBadgeEl = document.getElementById("agent-count-badge");
    const autocompleteListEl = document.getElementById("autocomplete-list");

    // Initialize application
    async function init() {
      setupEventListeners();
      connectEventStream();
      fetchInitialStatus().catch((err) => console.error("Error fetching status:", err));
      fetchWorkspaceFiles().catch((err) => console.warn("Error fetching files:", err));
    }

    // Connect to Server-Sent Events (SSE)
    function connectEventStream() {
      const eventSource = new EventSource("/api/events");

      eventSource.onopen = () => {
        systemStatusDotEl.className = "status-dot";
        systemStatusTextEl.textContent = "Connected";
      };

      eventSource.onerror = (err) => {
        systemStatusDotEl.className = "status-dot running";
        systemStatusTextEl.textContent = "Reconnecting...";
      };

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleServerEvent(payload);
        } catch (err) {
          console.error("Error parsing event payload:", err);
        }
      };
    }

    function handleServerEvent(event) {
      switch (event.type) {
        case "chat:message":
          appendChatMessage(event.data);
          break;

        case "phase:change":
          updatePhase(event.data);
          break;

        case "node:status":
          updateNodeStatus(event.data);
          break;

        case "subagent:event":
          handleSubAgentEvent(event.data);
          break;

        case "harness:finish":
          handleHarnessFinish(event.data);
          break;

        case "harness:status":
          setRunningState(event.data.running, event.data.phase);
          break;
      }
    }

    function setRunningState(running, phase) {
      state.isRunning = running;
      if (running) {
        systemStatusDotEl.className = "status-dot running";
        systemStatusTextEl.textContent = "Running";
        sendBtnEl.disabled = true;
        sendSpinnerEl.style.display = "inline-block";
        if (phase) {
          state.currentPhase = phase;
          currentPhaseDisplayEl.textContent = "Phase: " + phase;
        }
      } else {
        systemStatusDotEl.className = "status-dot";
        systemStatusTextEl.textContent = "Connected";
        sendBtnEl.disabled = false;
        sendSpinnerEl.style.display = "none";
      }
    }

    function appendChatMessage(data) {
      if (data.id && renderedMessageIds.has(data.id)) {
        return;
      }
      if (data.id) {
        renderedMessageIds.add(data.id);
      }

      const msgDiv = document.createElement("div");
      msgDiv.className = "message " + (data.role || "system");

      const metaDiv = document.createElement("div");
      metaDiv.className = "message-meta";
      metaDiv.textContent = data.role.toUpperCase() + " • " + new Date(data.timestamp || Date.now()).toLocaleTimeString();

      const bubbleDiv = document.createElement("div");
      bubbleDiv.className = "message-bubble";
      bubbleDiv.innerHTML = formatMarkdown(data.text);

      msgDiv.appendChild(metaDiv);
      msgDiv.appendChild(bubbleDiv);
      chatMessagesEl.appendChild(msgDiv);
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }

    function updatePhase(phaseEvent) {
      const phase = phaseEvent.phase;
      state.currentPhase = phase;
      currentPhaseDisplayEl.textContent = "Phase: " + phase + (phaseEvent.path ? " (" + phaseEvent.path + ")" : "");

      // Highlight stage nodes in graph
      const stageMap = {
        Inspect: "node-Inspect",
        Triage: "node-Triage",
        Research: "node-Explore",
        Diagnose: "node-Explore",
        DiversityGate: "node-Explore",
        Falsify: "node-Explore",
        Implement: "node-Explore",
        Verify: "node-Explore",
        Compare: "node-Explore",
        Review: "node-Explore",
        Integrate: "node-Integrate",
        Publish: "node-Publish",
        Learn: "node-Learn",
      };

      const targetId = stageMap[phase];
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          if (phaseEvent.status === "started") {
            el.className = "stage-node running";
          } else if (phaseEvent.status === "completed") {
            el.className = "stage-node success";
          } else if (phaseEvent.status === "failed") {
            el.className = "stage-node failed";
          }
        }
      }
    }

    function updateNodeStatus(nodeEvent) {
      // Map behavior tree node status
      const name = nodeEvent.nodeName;
      const el = document.getElementById("node-" + name);
      if (el) {
        if (nodeEvent.status === "RUNNING") {
          el.className = "stage-node running";
        } else if (nodeEvent.status === "SUCCESS") {
          el.className = "stage-node success";
        } else if (nodeEvent.status === "FAILURE") {
          el.className = "stage-node failed";
        }
      }
    }

    function handleSubAgentEvent(agentEvent) {
      if (emptyAgentStateEl) {
        emptyAgentStateEl.style.display = "none";
      }

      let agent = state.subAgents.get(agentEvent.agentId);
      if (!agent) {
        agent = {
          id: agentEvent.agentId,
          name: agentEvent.name,
          role: agentEvent.role,
          phase: agentEvent.phase,
          status: agentEvent.status || "running",
          logs: [],
          tools: [],
          results: [],
          el: null,
        };
        state.subAgents.set(agentEvent.agentId, agent);
        createAgentCard(agent);
      }

      agent.status = agentEvent.status;

      if (agentEvent.type === "thought" && agentEvent.message) {
        agent.logs.push({ type: "Thought", content: agentEvent.message });
      } else if (agentEvent.type === "tool" && agentEvent.message) {
        agent.tools.push({ type: "Tool Action", content: agentEvent.message });
      } else if (agentEvent.type === "result" && agentEvent.message) {
        agent.results.push({ type: "Evidence / Metric", content: agentEvent.message });
      } else if (agentEvent.type === "finish" && agentEvent.message) {
        agent.results.push({ type: "Outcome", content: agentEvent.message });
      }

      updateAgentCard(agent, agentEvent);
      updateAgentBadgeCounts();
    }

    function createAgentCard(agent) {
      const card = document.createElement("div");
      card.className = "agent-card running";
      card.id = "agent-card-" + agent.id;

      const avatarIcon = getAgentIcon(agent.id, agent.name);

      card.innerHTML =
        '<div class="agent-card-header">' +
          '<div class="agent-identity">' +
            '<div class="agent-avatar">' + avatarIcon + '</div>' +
            '<div class="agent-names">' +
              '<span class="agent-name">' + escapeHtml(agent.name) + '</span>' +
              '<span class="agent-role">' + escapeHtml(agent.role) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="agent-meta">' +
            '<span class="badge running" id="badge-' + agent.id + '">RUNNING</span>' +
            '<span class="toggle-arrow">▼</span>' +
          '</div>' +
        '</div>' +
        '<div class="agent-card-body" id="body-' + agent.id + '">' +
          '<div class="activity-row" id="section-logs-' + agent.id + '">' +
            '<span class="activity-label">Operations & Reasoning</span>' +
            '<div class="activity-content" id="content-logs-' + agent.id + '">Initializing agent...</div>' +
          '</div>' +
        '</div>';

      const header = card.querySelector(".agent-card-header");
      if (header) {
        header.addEventListener("click", () => toggleCard(agent.id));
      }

      agent.el = card;
      subagentListEl.prepend(card);
    }

    function updateAgentCard(agent, latestEvent) {
      if (!agent.el) return;

      const badgeEl = document.getElementById("badge-" + agent.id);
      if (badgeEl) {
        badgeEl.className = "badge " + agent.status;
        badgeEl.textContent = agent.status.toUpperCase();
      }

      agent.el.className = "agent-card " + (agent.status === "running" ? "running" : "");

      const contentLogsEl = document.getElementById("content-logs-" + agent.id);
      if (contentLogsEl) {
        const lines = [];
        if (latestEvent.message) {
          lines.push(latestEvent.message);
        }
        for (const item of agent.tools) {
          lines.push("⚡ [Tool] " + item.content);
        }
        for (const item of agent.results) {
          lines.push("✓ [Result] " + item.content);
        }
        if (latestEvent.details) {
          lines.push(JSON.stringify(latestEvent.details, null, 2));
        }

        if (lines.length > 0) {
          contentLogsEl.textContent = lines.join("\\n\\n");
        }
      }
    }

    function getAgentIcon(id, name) {
      if (id.includes("inspect")) return "🔍";
      if (id.includes("triage")) return "⚖️";
      if (id.includes("research")) return "📖";
      if (id.includes("architect")) return "🧠";
      if (id.includes("diversity")) return "🛡️";
      if (id.includes("falsifier")) return "🔬";
      if (id.includes("worker")) return "⚡";
      if (id.includes("evaluator")) return "🧪";
      if (id.includes("pareto")) return "📊";
      if (id.includes("reviewer")) return "🧐";
      if (id.includes("integrator")) return "🔗";
      if (id.includes("publisher")) return "🚀";
      if (id.includes("learner")) return "📚";
      return "🤖";
    }

    function toggleCard(agentId) {
      const card = document.getElementById("agent-card-" + agentId);
      if (card) {
        card.classList.toggle("collapsed");
      }
    }

    function updateAgentBadgeCounts() {
      let runningCount = 0;
      for (const agent of state.subAgents.values()) {
        if (agent.status === "running") runningCount++;
      }
      agentCountBadgeEl.textContent = runningCount + " Active";
    }

    function setAgentFilter(filter, btn) {
      state.agentFilter = filter;
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      for (const agent of state.subAgents.values()) {
        if (!agent.el) continue;
        if (filter === "all" || agent.status === filter) {
          agent.el.style.display = "block";
        } else {
          agent.el.style.display = "none";
        }
      }
    }

    function filterByPhase(phase) {
      for (const agent of state.subAgents.values()) {
        if (!agent.el) continue;
        if (agent.phase === phase || phase === "Explore") {
          agent.el.scrollIntoView({ behavior: "smooth" });
          agent.el.style.borderColor = "var(--accent-blue)";
          setTimeout(() => {
            agent.el.style.borderColor = "";
          }, 1500);
          break;
        }
      }
    }

    function handleHarnessFinish(data) {
      setRunningState(false);
      currentPhaseDisplayEl.textContent = "Phase: Finished";
      const learnNode = document.getElementById("node-Learn");
      if (learnNode) learnNode.className = "stage-node success";
    }

    // Chat form submissions
    async function sendMessage() {
      const input = userInputEl.value.trim();
      if (!input || state.isRunning) return;

      userInputEl.value = "";
      closeAutocomplete();
      sendBtnEl.disabled = true;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error("Failed to send message:", errData);
          appendChatMessage({
            id: "err-" + Date.now(),
            role: "system",
            text: "❌ Error: " + (errData.error || res.statusText),
            timestamp: new Date().toISOString(),
          });
          if (!state.isRunning) {
            sendBtnEl.disabled = false;
          }
        }
      } catch (err) {
        console.error("Error sending message:", err);
        appendChatMessage({
          id: "err-" + Date.now(),
          role: "system",
          text: "❌ Network error sending message: " + (err.message || String(err)),
          timestamp: new Date().toISOString(),
        });
        if (!state.isRunning) {
          sendBtnEl.disabled = false;
        }
      }
    }

    function quickFill(text) {
      userInputEl.value = text + " ";
      userInputEl.focus();
    }

    // Autocomplete for @file mentions
    function setupAutocomplete() {
      userInputEl.addEventListener("input", () => {
        const val = userInputEl.value;
        const cursor = userInputEl.selectionStart;
        const lastAt = val.lastIndexOf("@", cursor - 1);

        if (lastAt !== -1 && !val.slice(lastAt, cursor).includes(" ")) {
          const query = val.slice(lastAt + 1, cursor).toLowerCase();
          const fileList = Array.isArray(state.workspaceFiles) ? state.workspaceFiles : [];
          const matches = fileList
            .filter((f) => f.toLowerCase().includes(query))
            .slice(0, 8);

          if (matches.length > 0) {
            renderAutocomplete(matches, lastAt, cursor);
            return;
          }
        }
        closeAutocomplete();
      });

      userInputEl.addEventListener("keydown", (e) => {
        if (autocompleteListEl.style.display === "block") {
          const selected = autocompleteListEl.querySelector(".selected");
          if (e.key === "ArrowDown" || e.key === "Tab") {
            e.preventDefault();
            const next = selected ? selected.nextElementSibling || autocompleteListEl.firstElementChild : autocompleteListEl.firstElementChild;
            if (selected) selected.classList.remove("selected");
            if (next) next.classList.add("selected");
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const prev = selected ? selected.previousElementSibling || autocompleteListEl.lastElementChild : autocompleteListEl.lastElementChild;
            if (selected) selected.classList.remove("selected");
            if (prev) prev.classList.add("selected");
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (selected) {
              selected.click();
            }
            return;
          }
          if (e.key === "Escape") {
            closeAutocomplete();
            return;
          }
        }

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    function renderAutocomplete(items, tokenStart, tokenEnd) {
      autocompleteListEl.innerHTML = "";
      items.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "autocomplete-item" + (idx === 0 ? " selected" : "");
        div.innerHTML = "📄 <span>" + escapeHtml(item) + "</span>";
        div.onclick = () => {
          const val = userInputEl.value;
          userInputEl.value = val.slice(0, tokenStart) + "@" + item + " " + val.slice(tokenEnd);
          closeAutocomplete();
          userInputEl.focus();
        };
        autocompleteListEl.appendChild(div);
      });
      autocompleteListEl.style.display = "block";
    }

    function closeAutocomplete() {
      autocompleteListEl.style.display = "none";
    }

    function setupEventListeners() {
      sendBtnEl.addEventListener("click", sendMessage);
      setupAutocomplete();

      document.getElementById("clear-chat-btn").addEventListener("click", () => {
        chatMessagesEl.innerHTML = "";
        renderedMessageIds.clear();
      });

      modelSelectEl.addEventListener("change", async (e) => {
        const model = e.target.value;
        state.model = model;
        updateEffortOptionsForModel(model);
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "/model " + model }),
        });
      });

      effortSelectEl.addEventListener("change", async (e) => {
        const effort = e.target.value;
        state.effort = effort;
        await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "/effort " + effort }),
        });
      });
    }

    async function fetchInitialStatus() {
      try {
        await fetchModels();

        const res = await fetch("/api/status");
        const status = await res.json();
        state.model = status.model;
        state.effort = status.effort;

        if (status.model) {
          // If model not in dropdown, add it under a Custom group
          let exists = false;
          for (let i = 0; i < modelSelectEl.options.length; i++) {
            if (modelSelectEl.options[i].value === status.model) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            let customGroup = modelSelectEl.querySelector('optgroup[label="Custom / Unlisted"]');
            if (!customGroup) {
              customGroup = document.createElement("optgroup");
              customGroup.label = "Custom / Unlisted";
              modelSelectEl.appendChild(customGroup);
            }
            const opt = document.createElement("option");
            opt.value = status.model;
            opt.textContent = status.model;
            customGroup.appendChild(opt);
          }
          modelSelectEl.value = status.model;
          updateEffortOptionsForModel(status.model);
        }

        if (status.effort) {
          effortSelectEl.value = status.effort;
        }

        setRunningState(status.isRunning, status.activeGoal);
      } catch (err) {
        console.error("Error fetching status:", err);
      }
    }

    async function fetchModels() {
      try {
        const res = await fetch("/api/models");
        const models = await res.json();
        if (Array.isArray(models) && models.length > 0) {
          state.availableModels = models;
          const currentSelected = modelSelectEl.value || state.model || "gpt-6-luna";

          // Group models by category maintaining order
          const categoryMap = new Map();
          models.forEach((m) => {
            const cat = m.category || "Other Models";
            if (!categoryMap.has(cat)) {
              categoryMap.set(cat, []);
            }
            categoryMap.get(cat).push(m);
          });

          modelSelectEl.innerHTML = "";
          for (const [catName, catModels] of categoryMap.entries()) {
            const optgroup = document.createElement("optgroup");
            optgroup.label = catName;
            catModels.forEach((m) => {
              const opt = document.createElement("option");
              opt.value = m.slug;
              opt.textContent = m.displayName || m.slug;
              if (m.description) {
                opt.title = m.description;
              }
              if (m.slug === currentSelected) {
                opt.selected = true;
              }
              optgroup.appendChild(opt);
            });
            modelSelectEl.appendChild(optgroup);
          }

          if (currentSelected) {
            modelSelectEl.value = currentSelected;
          }
        }
      } catch (err) {
        console.warn("Could not fetch models list:", err);
      }
    }

    function updateEffortOptionsForModel(modelSlug) {
      const modelInfo = (state.availableModels || []).find((m) => m.slug === modelSlug);
      const supported = modelInfo && Array.isArray(modelInfo.supportedReasoningLevels) && modelInfo.supportedReasoningLevels.length > 0
        ? modelInfo.supportedReasoningLevels.map((lvl) => typeof lvl === "string" ? lvl : lvl.effort)
        : ["low", "medium", "high", "xhigh", "max", "ultra"];

      const currentEffort = effortSelectEl.value || state.effort || "high";
      effortSelectEl.innerHTML = "";

      supported.forEach((eff) => {
        const opt = document.createElement("option");
        opt.value = eff;
        opt.textContent = eff;
        if (eff === currentEffort) {
          opt.selected = true;
        }
        effortSelectEl.appendChild(opt);
      });

      if (!supported.includes(currentEffort) && supported.length > 0) {
        effortSelectEl.value = supported[0];
        state.effort = supported[0];
      }
    }

    async function fetchWorkspaceFiles() {
      try {
        const res = await fetch("/api/files");
        if (res.ok) {
          const files = await res.json();
          if (Array.isArray(files)) {
            state.workspaceFiles = files;
          }
        }
      } catch (err) {
        console.warn("Could not fetch workspace files:", err);
      }
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function formatMarkdown(text) {
      if (!text) return "";
      let html = escapeHtml(text);
      // Code blocks
      html = html.replace(new RegExp("\\x60\\x60\\x60([\\\\s\\\\S]*?)\\x60\\x60\\x60", "g"), "<pre><code>$1</code></pre>");
      // Inline code
      html = html.replace(new RegExp("\\x60([^\\x60]+)\\x60", "g"), "<code>$1</code>");
      // Bold: **text**
      html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, "<strong>$1</strong>");
      // Blockquotes: > text
      html = html.replace(/^&gt;\\s+(.*)$/gm, "<blockquote>$1</blockquote>");
      // Bullet points: - item
      html = html.replace(/^-\\s+(.*)$/gm, "<li>$1</li>");
      // Newlines
      html = html.replace(/\\n/g, "<br>");
      return html;
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>`;
}
