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
  <title>RefuteFlow - Autonomous Agent Harness</title>
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

    /* Main Container (3-Column Layout: Chat | File Content | File Tree) */
    .app-main {
      flex: 1;
      display: grid;
      grid-template-columns: 34% 44% 22%;
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
      min-height: 0;
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
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior-y: contain;
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

    /* Center Pane: File Viewer & Activity Tabs */
    .viewer-pane {
      background: var(--bg-primary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }

    .viewer-header {
      padding: 8px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-shrink: 0;
      min-height: 44px;
    }

    .viewer-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .viewer-tab {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .viewer-tab:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }

    .viewer-tab.active {
      color: var(--accent-blue);
      background: var(--bg-tertiary);
      border-color: var(--border-color);
      font-weight: 600;
    }

    .viewer-tab-badge {
      background: var(--accent-blue);
      color: #fff;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 10px;
      display: inline-block;
    }

    .viewer-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .file-content-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: #0d1117;
      overflow: hidden;
      position: relative;
    }

    .file-meta-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      font-size: 11.5px;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .file-path-display {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-stats-display {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .badge-lang {
      font-size: 10px;
      padding: 1px 6px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--accent-purple);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .file-code-wrapper {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.55;
    }

    .line-numbers {
      padding: 12px 10px 12px 14px;
      text-align: right;
      color: var(--text-muted);
      user-select: none;
      background: #090d13;
      border-right: 1px solid var(--border-color);
      flex-shrink: 0;
      font-size: 11px;
      line-height: 1.6;
    }

    .code-content {
      padding: 12px 16px;
      color: #e6edf3;
      white-space: pre;
      overflow-x: auto;
      flex: 1;
      tab-size: 2;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.6;
      margin: 0;
      background: transparent;
      border: none;
    }

    .code-content.wrapped {
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Syntax Highlighting */
    .hl-keyword { color: #ff7b72; font-weight: 600; }
    .hl-type { color: #ffa657; }
    .hl-string { color: #a5d6ff; }
    .hl-number { color: #79c0ff; }
    .hl-boolean { color: #ff7b72; font-weight: 600; }
    .hl-comment { color: #8b949e; font-style: italic; }
    .hl-function { color: #d2a8ff; }
    .hl-property { color: #7ee787; }
    .hl-operator { color: #ff7b72; }
    .hl-tag { color: #7ee787; font-weight: 600; }
    .hl-attr { color: #79c0ff; }
    .hl-heading { color: #58a6ff; font-weight: bold; }

    .empty-viewer-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
      color: var(--text-muted);
      user-select: none;
      text-align: center;
    }

    .pipeline-activity-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
    }

    /* Rightmost Pane: File Tree Explorer */
    .filetree-pane {
      background: var(--bg-secondary);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .filetree-header {
      padding: 10px 14px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .filetree-title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .filetree-search-bar {
      padding: 6px 10px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .filetree-search-input {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 4px 8px;
      color: var(--text-primary);
      font-size: 11.5px;
      outline: none;
    }

    .filetree-search-input:focus {
      border-color: var(--border-focus);
    }

    .filetree-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 6px 4px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .tree-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      color: var(--text-secondary);
      transition: background 0.1s, color 0.1s;
      position: relative;
    }

    .tree-row:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .tree-row.selected {
      background: rgba(88, 166, 255, 0.15);
      color: var(--accent-blue);
      font-weight: 500;
    }

    .tree-row.is-dir {
      font-weight: 500;
      color: var(--text-primary);
    }

    .tree-indent {
      display: inline-block;
      flex-shrink: 0;
    }

    .tree-chevron {
      width: 12px;
      height: 12px;
      font-size: 9px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .tree-icon {
      font-size: 13px;
      flex-shrink: 0;
    }

    .tree-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .tree-actions {
      display: none;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .tree-row:hover .tree-actions {
      display: flex;
    }

    .tree-action-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      color: var(--text-muted);
      font-size: 10px;
      padding: 1px 5px;
      cursor: pointer;
    }

    .tree-action-btn:hover {
      background: var(--border-focus);
      color: #fff;
    }

    /* Right Pane: Pipeline Graph & Sub-Agents */
    .right-pane {
      background: var(--bg-primary);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
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

    .stage-node.selected { outline: 2px solid var(--accent-blue); outline-offset: 2px; }

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
      min-height: 0;
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
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .explore-flow {
      display: none;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
    }

    .explore-flow.visible { display: block; }

    .explore-flow-title {
      margin-bottom: 8px;
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }

    .explore-flow-steps {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .explore-step {
      padding: 5px 9px;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      background: var(--bg-primary);
      color: var(--text-secondary);
      font-size: 10.5px;
      cursor: pointer;
    }

    .explore-step:hover { border-color: var(--border-focus); color: var(--text-primary); }
    .explore-step.selected { border-color: var(--accent-blue); color: var(--accent-blue); box-shadow: 0 0 0 1px var(--accent-blue); }
    .explore-step.running { border-color: var(--accent-blue); color: var(--accent-blue); }
    .explore-step.completed { border-color: var(--accent-green); color: var(--accent-green); }
    .explore-step.failed { border-color: var(--accent-red); color: var(--accent-red); }

    .explore-arrow { color: var(--text-muted); font-size: 11px; }

    /* Sub-agent activity stays visible in the panel. */
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
      user-select: none;
    }

    .agent-card-header:hover { background: var(--bg-hover); }

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

    .agent-card-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--border-color);
      font-size: 12.5px;
    }

    .agent-activity-event { padding-top: 8px; border-top: 1px solid var(--border-color); }
    .agent-activity-event:first-child { padding-top: 0; border-top: 0; }
    .agent-activity-title { margin-bottom: 4px; color: var(--text-muted); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
    .agent-activity-content { color: var(--text-secondary); line-height: 1.45; overflow-wrap: anywhere; }
    .agent-activity-content > :first-child { margin-top: 0; }
    .agent-activity-content > :last-child { margin-bottom: 0; }
    .phase-summary-card { padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; }
    .phase-summary-title { margin-bottom: 6px; color: var(--text-primary); font-size: 12px; font-weight: 600; }

    .markdown-content { font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 { margin: 14px 0 7px; line-height: 1.3; }
    .markdown-content h1 { font-size: 19px; }
    .markdown-content h2 { font-size: 16px; }
    .markdown-content h3 { font-size: 14px; }
    .markdown-content p { margin: 0 0 10px; }
    .markdown-content ul, .markdown-content ol { margin: 6px 0 10px; padding-left: 22px; }
    .markdown-content blockquote { margin: 8px 0; padding: 2px 10px; border-left: 3px solid var(--border-focus); color: var(--text-secondary); }
    .markdown-content pre { overflow: auto; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); }
    .markdown-content code { font-family: var(--font-mono); font-size: 0.92em; }
    .markdown-content :not(pre) > code { padding: 1px 4px; border-radius: 4px; background: var(--bg-tertiary); }
    .markdown-content a { color: var(--accent-blue); }
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
      <div class="brand-logo">RF</div>
      <span>RefuteFlow</span>
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

    <!-- Center Pane: File Content Viewer (between Chat and File Tree) -->
    <div class="viewer-pane" id="viewer-pane">
      <div class="viewer-header">
        <div class="viewer-tabs">
          <button class="viewer-tab active" id="tab-file-btn" onclick="switchViewerTab('file')">
            <span>📄 File Content</span>
          </button>
          <button class="viewer-tab" id="tab-activity-btn" onclick="switchViewerTab('activity')">
            <span>📊 Pipeline & Activity</span>
            <span class="viewer-tab-badge" id="activity-tab-badge" style="display: none;">0</span>
          </button>
        </div>

        <div class="viewer-actions" id="file-viewer-actions" style="display: none;">
          <button class="chip-btn" id="wrap-toggle-btn" onclick="toggleWrap()" title="Toggle word wrap">Wrap: Off</button>
          <button class="chip-btn" id="mention-file-btn" onclick="mentionActiveFile()" title="Insert @filename into chat">@ Mention</button>
          <button class="chip-btn" id="copy-file-btn" onclick="copyFileContent()" title="Copy file contents">Copy</button>
        </div>
      </div>

      <!-- File Content View -->
      <div class="file-content-view" id="file-content-view">
        <div class="file-meta-bar" id="file-meta-bar" style="display: none;">
          <div class="file-path-display">
            <span id="file-meta-icon">📄</span>
            <span id="file-meta-path">filename</span>
          </div>
          <div class="file-stats-display">
            <span id="file-meta-lang" class="badge-lang"></span>
            <span id="file-meta-lines">0 lines</span>
            <span id="file-meta-size">0 KB</span>
          </div>
        </div>

        <div class="file-code-wrapper" id="file-code-wrapper" style="display: none;">
          <div class="line-numbers" id="file-line-numbers"></div>
          <pre class="code-content" id="file-code-content"></pre>
        </div>

        <div class="empty-viewer-state" id="empty-viewer-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">No File Selected</div>
          <div style="font-size: 12px; color: var(--text-muted); max-width: 300px; text-align: center; margin-top: 6px; line-height: 1.5;">
            Select a file from the workspace file tree on the right to view its content here.
          </div>
        </div>

        <div class="empty-viewer-state" id="loading-viewer-state" style="display: none;">
          <span class="spinner" style="width: 20px; height: 20px; border-width: 3px; margin-bottom: 12px;"></span>
          <div style="font-size: 13px; color: var(--text-secondary);">Loading file content...</div>
        </div>
      </div>

      <!-- Pipeline & Sub-Agent Activity View -->
      <div class="pipeline-activity-view" id="pipeline-activity-view" style="display: none;">
        <!-- Pipeline Stage Graph -->
        <div class="graph-section">
          <div class="graph-header">
            <span>Harness Stage Pipeline</span>
            <span id="current-phase-display" style="font-family: var(--font-mono); color: var(--accent-blue);">Phase: Idle</span>
          </div>

          <div class="graph-canvas" id="graph-canvas">
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

        <div class="explore-flow" id="explore-flow" aria-label="Explore phase flow">
          <div class="explore-flow-title">EXPLORE FLOW · SELECT A STEP TO JUMP TO ITS ACTIVITY</div>
          <div class="explore-flow-steps" id="explore-flow-steps"></div>
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
              <div style="font-size: 11px;">Agent activity and phase summaries appear here as they arrive.</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rightmost Pane: Workspace File Tree -->
    <div class="filetree-pane" id="filetree-pane">
      <div class="filetree-header">
        <div class="filetree-title">
          <span>📁 Workspace</span>
          <span class="chip-btn" id="filetree-count-badge" style="font-size: 11px; padding: 2px 6px;">0</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="chip-btn" onclick="collapseAllDirs()" title="Collapse all folders" style="padding: 2px 6px;">Fold</button>
          <button class="chip-btn" onclick="refreshFileTree()" title="Reload workspace files" style="padding: 2px 6px;">🔄</button>
        </div>
      </div>

      <div class="filetree-search-bar">
        <input type="text" id="filetree-search" class="filetree-search-input" placeholder="Filter files..." oninput="handleFileSearch(this.value)">
      </div>

      <div class="filetree-content" id="filetree-content">
        <!-- Tree rendered dynamically -->
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
      phaseEvents: new Map(),
      workspaceFiles: [],
      selectedFile: null,
      fileCache: new Map(), // path -> fileData
      expandedDirs: new Set(["src", "src/server", "src/server/web"]),
      isWrapped: false,
      activeViewerTab: "file",
      fileSearchQuery: "",
    };

    const explorePhases = ["Research", "Diagnose", "DiversityGate", "Falsify", "Implement", "Verify", "Compare", "Review"];

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
    const exploreFlowEl = document.getElementById("explore-flow");
    const exploreFlowStepsEl = document.getElementById("explore-flow-steps");

    // Viewer & File Tree DOM Elements
    const filetreeContentEl = document.getElementById("filetree-content");
    const filetreeCountBadgeEl = document.getElementById("filetree-count-badge");
    const filetreeSearchEl = document.getElementById("filetree-search");
    const tabFileBtnEl = document.getElementById("tab-file-btn");
    const tabActivityBtnEl = document.getElementById("tab-activity-btn");
    const fileContentViewEl = document.getElementById("file-content-view");
    const pipelineActivityViewEl = document.getElementById("pipeline-activity-view");
    const fileViewerActionsEl = document.getElementById("file-viewer-actions");
    const fileMetaBarEl = document.getElementById("file-meta-bar");
    const fileMetaIconEl = document.getElementById("file-meta-icon");
    const fileMetaPathEl = document.getElementById("file-meta-path");
    const fileMetaLangEl = document.getElementById("file-meta-lang");
    const fileMetaLinesEl = document.getElementById("file-meta-lines");
    const fileMetaSizeEl = document.getElementById("file-meta-size");
    const fileCodeWrapperEl = document.getElementById("file-code-wrapper");
    const fileLineNumbersEl = document.getElementById("file-line-numbers");
    const fileCodeContentEl = document.getElementById("file-code-content");
    const emptyViewerStateEl = document.getElementById("empty-viewer-state");
    const loadingViewerStateEl = document.getElementById("loading-viewer-state");
    const wrapToggleBtnEl = document.getElementById("wrap-toggle-btn");

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
      state.phaseEvents.set(phase, phaseEvent);
      renderExploreFlow();
      renderPhaseSummary(phaseEvent);
      renderActivityVisibility();
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

      renderExploreFlow();
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
          events: [],
          el: null,
        };
        state.subAgents.set(agentEvent.agentId, agent);
        createAgentCard(agent);
      }

      agent.status = agentEvent.status || agent.status;
      if (agentEvent.message || agentEvent.details) {
        if (agentEvent.agentId === "agent-reviewer") {
          if (agentEvent.type === "start") {
            // A new review run starts a fresh outcome while keeping prior activity visible.
            agent.events = agent.events.filter((event) => event.type !== "result" && event.type !== "finish");
          } else if (agentEvent.type === "result" || agentEvent.type === "finish") {
            // Keep only the latest candidate's review decision and reason.
            agent.events = agent.events.filter((event) => event.type !== "result" && event.type !== "finish");
          }
        }
        agent.events.push({ ...agentEvent });
      }

      if (agentEvent.type === "finish" && agentEvent.details && Object.keys(agentEvent.details).length) {
        appendChatMessage({
          id: "agent-response-" + agentEvent.agentId + "-" + agentEvent.timestamp,
          role: "assistant",
          text: "### " + (agentEvent.name || "Agent") + " response\\n\\n" + jsonToMarkdown(agentEvent.details),
          timestamp: agentEvent.timestamp,
        });
      }

      updateAgentCard(agent, agentEvent);
      updateAgentBadgeCounts();
      renderExploreFlow();
      renderActivityVisibility();
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
          '</div>' +
        '</div>' +
        '<div class="agent-card-body" id="body-' + agent.id + '"></div>';

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

      const body = agent.el.querySelector(".agent-card-body");
      if (!body) return;
      body.replaceChildren();
      if (!agent.events.length) {
        const pending = document.createElement("div");
        pending.className = "agent-activity-content";
        pending.textContent = "Waiting for activity…";
        body.appendChild(pending);
        return;
      }
      for (const event of agent.events) {
        const section = document.createElement("section");
        section.className = "agent-activity-event";
        const label = document.createElement("div");
        label.className = "agent-activity-title";
        label.textContent = ({ start: "Started", thought: "Agent thought", tool: "Tool activity", result: "Generated content", finish: "Final output", log: "Log" })[event.type] || event.type;
        section.appendChild(label);
        if (event.message) {
          const content = document.createElement("div");
          content.className = "agent-activity-content markdown-content";
          content.innerHTML = formatMarkdown(agentTextToMarkdown(event.message));
          section.appendChild(content);
        }
        if (event.details && Object.keys(event.details).length) {
          const content = document.createElement("div");
          content.className = "agent-activity-content markdown-content";
          content.innerHTML = formatMarkdown(jsonToMarkdown(event.details));
          section.appendChild(content);
        }
        body.appendChild(section);
      }
    }

    function renderPhaseSummary(phaseEvent) {
      if (!phaseEvent.summary) return;
      const id = "phase-summary-" + phaseEvent.phase;
      let card = document.getElementById(id);
      if (!card) {
        card = document.createElement("section");
        card.id = id;
        card.className = "phase-summary-card";
        card.dataset.phase = phaseEvent.phase;
        subagentListEl.prepend(card);
      }
      card.dataset.status = phaseEvent.status === "started" ? "running" : phaseEvent.status;
      card.replaceChildren();
      const title = document.createElement("div");
      title.className = "phase-summary-title";
      title.textContent = phaseEvent.phase.replace(/([a-z])([A-Z])/g, "$1 $2") + " · " + phaseEvent.status;
      const summary = document.createElement("div");
      summary.className = "agent-activity-content markdown-content";
      summary.innerHTML = formatMarkdown(phaseEvent.summary);
      card.append(title, summary);
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
      renderActivityVisibility();
    }

    function activityMatchesPhase(phase) {
      if (!state.phaseFilter) return true;
      if (state.phaseFilter === "Explore") return explorePhases.includes(phase);
      return state.phaseFilter === phase;
    }

    function renderActivityVisibility() {
      let visibleCount = 0;
      for (const agent of state.subAgents.values()) {
        if (!agent.el) continue;
        const matchesStatus = state.agentFilter === "all" || agent.status === state.agentFilter;
        const visible = matchesStatus && activityMatchesPhase(agent.phase);
        agent.el.style.display = visible ? "block" : "none";
        if (visible) visibleCount++;
      }
      for (const card of subagentListEl.querySelectorAll(".phase-summary-card")) {
        const matchesStatus = state.agentFilter === "all" || state.agentFilter === card.dataset.status;
        const visible = matchesStatus && activityMatchesPhase(card.dataset.phase || "");
        card.style.display = visible ? "block" : "none";
        if (visible) visibleCount++;
      }
      emptyAgentStateEl.style.display = visibleCount ? "none" : "flex";
      if (!visibleCount) {
        const message = state.phaseFilter
          ? "No activity recorded for " + state.phaseFilter + " yet."
          : "No sub-agents active yet.";
        emptyAgentStateEl.querySelector("div:nth-child(2)").textContent = message;
      }
    }

    function filterByPhase(phase) {
      state.phaseFilter = phase;
      document.querySelectorAll(".stage-node").forEach((node) => node.classList.toggle("selected", node.id === "node-" + phase));
      if (phase === "Explore") {
        exploreFlowEl.classList.add("visible");
        renderExploreFlow();
      } else {
        exploreFlowEl.classList.remove("visible");
      }
      renderActivityVisibility();
      const target = document.getElementById("phase-summary-" + phase) || [...state.subAgents.values()].find((agent) => activityMatchesPhase(agent.phase))?.el;
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function renderExploreFlow() {
      if (!exploreFlowStepsEl) return;
      exploreFlowStepsEl.replaceChildren();
      explorePhases.forEach((phase, index) => {
        const phaseEvent = state.phaseEvents.get(phase);
        const phaseAgents = [...state.subAgents.values()].filter((agent) => agent.phase === phase);
        let status = phaseEvent?.status || "pending";
        if (!phaseEvent && phaseAgents.length) {
          status = phaseAgents.some((agent) => agent.status === "running") ? "running" : phaseAgents[0].status;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "explore-step " + status + (state.phaseFilter === phase ? " selected" : "");
        button.textContent = phase.replace(/([a-z])([A-Z])/g, "$1 $2");
        button.title = "Jump to " + phase + " activity";
        button.addEventListener("click", () => {
          state.phaseFilter = phase;
          renderExploreFlow();
          renderActivityVisibility();
          const target = document.getElementById("phase-summary-" + phase) || [...state.subAgents.values()].find((agent) => agent.phase === phase)?.el;
          target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        exploreFlowStepsEl.appendChild(button);
        if (index < explorePhases.length - 1) {
          const arrow = document.createElement("span");
          arrow.className = "explore-arrow";
          arrow.textContent = "→";
          exploreFlowStepsEl.appendChild(arrow);
        }
      });
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
            renderFileTree();

            // Auto-preview README.md or package.json on initial load if no file is selected
            if (!state.selectedFile && files.length > 0) {
              const defaultFile = files.find((f) => f.toLowerCase() === "readme.md") || files.find((f) => f.toLowerCase() === "package.json");
              if (defaultFile) {
                openFile(defaultFile);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch workspace files:", err);
      }
    }

    function buildFileTree(files) {
      const root = { name: "", path: "", isDir: true, children: {} };
      for (const filePath of files) {
        const parts = filePath.split("/");
        let curr = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isFile = i === parts.length - 1;
          const currentPath = parts.slice(0, i + 1).join("/");
          if (!curr.children[part]) {
            curr.children[part] = {
              name: part,
              path: currentPath,
              isDir: !isFile,
              children: isFile ? null : {},
            };
          }
          curr = curr.children[part];
        }
      }
      return root;
    }

    function getFileIcon(filename) {
      const parts = filename.split(".");
      const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
      switch (ext) {
        case "ts":
        case "tsx":
          return "📘";
        case "js":
        case "jsx":
        case "mjs":
          return "🟨";
        case "json":
          return "⚙️";
        case "md":
          return "📝";
        case "css":
        case "scss":
          return "🎨";
        case "html":
          return "🌐";
        case "sh":
        case "bash":
        case "zsh":
          return "💻";
        case "py":
          return "🐍";
        case "rs":
          return "🦀";
        case "go":
          return "🐹";
        case "sql":
          return "🗄️";
        case "yaml":
        case "yml":
        case "toml":
          return "📋";
        default:
          return "📄";
      }
    }

    function renderFileTree() {
      if (!filetreeContentEl) return;
      filetreeContentEl.replaceChildren();

      const files = state.workspaceFiles || [];
      if (filetreeCountBadgeEl) {
        filetreeCountBadgeEl.textContent = files.length;
      }

      if (!files.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "padding: 20px 12px; color: var(--text-muted); font-size: 11.5px; text-align: center;";
        empty.textContent = "No workspace files found";
        filetreeContentEl.appendChild(empty);
        return;
      }

      const query = (state.fileSearchQuery || "").toLowerCase().trim();
      const filtered = query
        ? files.filter((f) => f.toLowerCase().includes(query))
        : files;

      if (!filtered.length) {
        const noMatch = document.createElement("div");
        noMatch.style.cssText = "padding: 20px 12px; color: var(--text-muted); font-size: 11.5px; text-align: center;";
        noMatch.textContent = "No matching files";
        filetreeContentEl.appendChild(noMatch);
        return;
      }

      // If user typed a search query, auto-expand matching directories
      if (query) {
        filtered.forEach((filePath) => {
          const parts = filePath.split("/");
          for (let i = 1; i < parts.length; i++) {
            state.expandedDirs.add(parts.slice(0, i).join("/"));
          }
        });
      }

      const tree = buildFileTree(filtered);
      renderTreeNodes(tree, filetreeContentEl, 0);
    }

    function renderTreeNodes(node, container, depth) {
      const sortedKeys = Object.keys(node.children || {}).sort((a, b) => {
        const nodeA = node.children[a];
        const nodeB = node.children[b];
        if (nodeA.isDir !== nodeB.isDir) {
          return nodeA.isDir ? -1 : 1;
        }
        return a.localeCompare(b);
      });

      for (const key of sortedKeys) {
        const child = node.children[key];
        const row = document.createElement("div");
        row.className = "tree-row" + (child.isDir ? " is-dir" : "") + (state.selectedFile === child.path ? " selected" : "");
        row.style.paddingLeft = (depth * 14 + 6) + "px";

        if (child.isDir) {
          const isExpanded = state.expandedDirs.has(child.path);
          const chevron = document.createElement("span");
          chevron.className = "tree-chevron";
          chevron.textContent = isExpanded ? "▼" : "▶";

          const icon = document.createElement("span");
          icon.className = "tree-icon";
          icon.textContent = isExpanded ? "📂" : "📁";

          const name = document.createElement("span");
          name.className = "tree-name";
          name.textContent = child.name;

          row.append(chevron, icon, name);
          row.addEventListener("click", () => {
            if (state.expandedDirs.has(child.path)) {
              state.expandedDirs.delete(child.path);
            } else {
              state.expandedDirs.add(child.path);
            }
            renderFileTree();
          });
          container.appendChild(row);

          if (isExpanded) {
            renderTreeNodes(child, container, depth + 1);
          }
        } else {
          const spacer = document.createElement("span");
          spacer.className = "tree-chevron";

          const icon = document.createElement("span");
          icon.className = "tree-icon";
          icon.textContent = getFileIcon(child.name);

          const name = document.createElement("span");
          name.className = "tree-name";
          name.textContent = child.name;
          name.title = child.path;

          const actions = document.createElement("div");
          actions.className = "tree-actions";

          const mentionBtn = document.createElement("button");
          mentionBtn.type = "button";
          mentionBtn.className = "tree-action-btn";
          mentionBtn.textContent = "@";
          mentionBtn.title = "Mention in chat";
          mentionBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            insertMentionIntoChat(child.path);
          });
          actions.appendChild(mentionBtn);

          row.append(spacer, icon, name, actions);
          row.addEventListener("click", () => {
            openFile(child.path);
          });
          container.appendChild(row);
        }
      }
    }

    async function openFile(filePath) {
      if (!filePath) return;
      state.selectedFile = filePath;
      switchViewerTab("file");
      renderFileTree();

      emptyViewerStateEl.style.display = "none";
      fileCodeWrapperEl.style.display = "none";
      fileMetaBarEl.style.display = "none";
      fileViewerActionsEl.style.display = "none";
      loadingViewerStateEl.style.display = "flex";

      try {
        let fileData = state.fileCache.get(filePath);
        if (!fileData) {
          const res = await fetch("/api/file?path=" + encodeURIComponent(filePath));
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || "Failed to load file");
          }
          fileData = await res.json();
          state.fileCache.set(filePath, fileData);
        }

        renderFileContent(fileData);
      } catch (err) {
        console.error("Error opening file:", err);
        loadingViewerStateEl.style.display = "none";
        emptyViewerStateEl.style.display = "flex";
        emptyViewerStateEl.innerHTML =
          '<div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>' +
          '<div style="font-size: 14px; font-weight: 600; color: var(--accent-red);">' + escapeHtml(err.message || "Failed to load file") + '</div>' +
          '<div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">' + escapeHtml(filePath) + '</div>';
      }
    }

    function highlightCode(code, language) {
      if (!code) return "";
      const lang = (language || "").toLowerCase();
      try {
        if (lang === "json") {
          return highlightJson(code);
        } else if (lang === "markdown" || lang === "md") {
          return highlightMarkdown(code);
        } else if (lang === "html" || lang === "xml") {
          return highlightHtml(code);
        } else if (lang === "css" || lang === "scss") {
          return highlightCss(code);
        } else {
          return highlightGeneric(code, lang);
        }
      } catch (err) {
        console.warn("Syntax highlight fallback:", err);
        return escapeHtml(code);
      }
    }

    function highlightJson(jsonStr) {
      const strRegex = '"(?:\\\\\\\\.|[^"\\\\\\\\])*"';
      const numRegex = '-?\\\\d+(?:\\\\.\\\\d+)?(?:[eE][+-]?\\\\d+)?';
      const boolRegex = '\\\\b(true|false)\\\\b';
      const nullRegex = '\\\\bnull\\\\b';
      const tokenRegex = new RegExp('(' + strRegex + ')(\\\\s*:)?|(' + numRegex + ')|' + boolRegex + '|' + nullRegex, 'g');

      let lastIndex = 0;
      let html = "";
      let match;

      while ((match = tokenRegex.exec(jsonStr)) !== null) {
        if (match.index > lastIndex) {
          html += escapeHtml(jsonStr.slice(lastIndex, match.index));
        }

        if (match[1] !== undefined) {
          if (match[2]) {
            html += '<span class="hl-property">' + escapeHtml(match[1]) + '</span>' + escapeHtml(match[2]);
          } else {
            html += '<span class="hl-string">' + escapeHtml(match[1]) + '</span>';
          }
        } else if (match[3] !== undefined) {
          html += '<span class="hl-number">' + escapeHtml(match[3]) + '</span>';
        } else if (match[4] !== undefined) {
          html += '<span class="hl-boolean">' + escapeHtml(match[4]) + '</span>';
        } else {
          html += '<span class="hl-keyword">null</span>';
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < jsonStr.length) {
        html += escapeHtml(jsonStr.slice(lastIndex));
      }
      return html;
    }

    function highlightMarkdown(mdStr) {
      const tick = String.fromCharCode(96);
      const lines = mdStr.split("\\n");
      const out = lines.map((line) => {
        if (/^#{1,6}\\s/.test(line)) {
          return '<span class="hl-heading">' + escapeHtml(line) + '</span>';
        }
        if (/^>\\s/.test(line)) {
          return '<span class="hl-comment">' + escapeHtml(line) + '</span>';
        }
        if (line.startsWith(tick + tick + tick)) {
          return '<span class="hl-keyword">' + escapeHtml(line) + '</span>';
        }
        if (/^\\s*[-*+]\\s/.test(line) || /^\\s*\\d+\\.\\s/.test(line)) {
          return escapeHtml(line).replace(/^(\\s*[-*+]|\\s*\\d+\\.)/, '<span class="hl-operator">$1</span>');
        }

        let escaped = escapeHtml(line);
        const codeTokenRegex = new RegExp(tick + "([^" + tick + "]+)" + tick, "g");
        escaped = escaped.replace(codeTokenRegex, '<span class="hl-string">' + tick + '$1' + tick + '</span>');
        escaped = escaped.replace(/(\\*\\*|__)(.*?)\\1/g, '<span class="hl-keyword">$1$2$1</span>');
        escaped = escaped.replace(/\\[(.*?)\\]\\((.*?)\\)/g, '<span class="hl-type">[$1]</span>(<span class="hl-string">$2</span>)');
        return escaped;
      });
      return out.join("\\n");
    }

    function highlightHtml(htmlStr) {
      const commentRegex = "<!--[\\\\s\\\\S]*?-->";
      const tagRegex = "</?[-a-zA-Z0-9]+";
      const attrRegex = '[-a-zA-Z0-9:]+=(?:"[^"]*"|\\x27[^\\x27]*\\x27)';
      const closeRegex = "/?>";
      const tokenRegex = new RegExp("(" + commentRegex + ")|(" + tagRegex + ")|(" + attrRegex + ")|(" + closeRegex + ")", "g");

      let lastIndex = 0;
      let html = "";
      let match;

      while ((match = tokenRegex.exec(htmlStr)) !== null) {
        if (match.index > lastIndex) {
          html += escapeHtml(htmlStr.slice(lastIndex, match.index));
        }

        const [full, comment, tag, attr, close] = match;
        if (comment) {
          html += '<span class="hl-comment">' + escapeHtml(comment) + '</span>';
        } else if (tag) {
          html += '<span class="hl-tag">' + escapeHtml(tag) + '</span>';
        } else if (attr) {
          const eqIdx = attr.indexOf("=");
          const name = attr.slice(0, eqIdx);
          const val = attr.slice(eqIdx + 1);
          html += '<span class="hl-attr">' + escapeHtml(name) + '</span>=<span class="hl-string">' + escapeHtml(val) + '</span>';
        } else if (close) {
          html += escapeHtml(close);
        } else {
          html += escapeHtml(full);
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < htmlStr.length) {
        html += escapeHtml(htmlStr.slice(lastIndex));
      }
      return html;
    }

    function highlightCss(cssStr) {
      const cssComment = "/\\\\*[\\\\s\\\\S]*?\\\\*/";
      const cssString = '"[^"]*"|\\x27[^\\x27]*\\x27';
      const cssSelector = "[^{}:;]+(?=\\\\s*\\\\{)";
      const cssProp = "[-a-zA-Z]+(?=\\\\s*:)";
      const cssVal = ":[^;}]+;";
      const tokenRegex = new RegExp("(" + cssComment + ")|(" + cssString + ")|(" + cssSelector + ")|(" + cssProp + ")|(" + cssVal + ")", "g");

      let lastIndex = 0;
      let html = "";
      let match;

      while ((match = tokenRegex.exec(cssStr)) !== null) {
        if (match.index > lastIndex) {
          html += escapeHtml(cssStr.slice(lastIndex, match.index));
        }

        const [full, comment, str, selector, prop, val] = match;
        if (comment) {
          html += '<span class="hl-comment">' + escapeHtml(comment) + '</span>';
        } else if (str) {
          html += '<span class="hl-string">' + escapeHtml(str) + '</span>';
        } else if (selector) {
          html += '<span class="hl-tag">' + escapeHtml(selector) + '</span>';
        } else if (prop) {
          html += '<span class="hl-attr">' + escapeHtml(prop) + '</span>';
        } else if (val) {
          html += '<span class="hl-property">' + escapeHtml(val) + '</span>';
        } else {
          html += escapeHtml(full);
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < cssStr.length) {
        html += escapeHtml(cssStr.slice(lastIndex));
      }
      return html;
    }

    function highlightGeneric(code, lang) {
      const tick = String.fromCharCode(96);
      const isPythonOrShell = ["python", "py", "bash", "sh", "zsh", "yaml", "yml"].includes(lang);

      const commentPattern = isPythonOrShell ? "#[^\\\\n]*" : "(?://[^\\\\n]*|/\\\\*[\\\\s\\\\S]*?\\\\*/)";
      const templateStr = tick + "(?:\\\\\\\\.|[^" + tick + "\\\\\\\\\\])*" + tick;
      const doubleStr = "\\"(?:\\\\\\\\.|[^\\\"\\\\\\\\])*\\"";
      const singleStr = "\\x27(?:\\\\\\\\.|[^\\x27\\\\\\\\])*\\x27";
      const stringPattern = templateStr + "|" + doubleStr + "|" + singleStr;
      const numberPattern = "\\\\b(?:0x[0-9a-fA-F]+|\\\\d+(?:\\\\.\\\\d+)?(?:[eE][+-]?\\\\d+)?)\\\\b";
      const wordPattern = "[a-zA-Z_$][a-zA-Z0-9_$]*";
      const opPattern = "[-=+*/%&|^!<>?:;,.~]+";

      const tokenRegex = new RegExp(
        "(" + commentPattern + ")|(" + stringPattern + ")|(" + numberPattern + ")|(" + wordPattern + ")|(" + opPattern + ")",
        "g"
      );

      const keywords = new Set([
        "abstract", "as", "async", "await", "break", "case", "catch", "class", "const",
        "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
        "extends", "finally", "for", "from", "function", "get", "if", "implements",
        "import", "in", "instanceof", "interface", "let", "new", "of", "package",
        "private", "protected", "public", "return", "set", "static", "super",
        "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with",
        "yield", "def", "elif", "except", "is", "not", "pass", "raise", "echo",
        "fn", "pub", "mut", "impl", "struct", "trait", "type", "select", "where",
        "lambda", "global", "nonlocal", "assert", "del"
      ]);

      const constants = new Set([
        "true", "false", "null", "undefined", "NaN", "Infinity", "None", "True", "False", "nil"
      ]);

      const types = new Set([
        "string", "number", "boolean", "any", "unknown", "never", "void", "Promise",
        "Array", "Object", "Record", "Map", "Set", "Function", "Symbol", "BigInt",
        "int", "float", "str", "dict", "list", "bool", "i32", "i64", "u32", "u64", "usize"
      ]);

      let lastIndex = 0;
      let html = "";
      let match;

      while ((match = tokenRegex.exec(code)) !== null) {
        if (match.index > lastIndex) {
          html += escapeHtml(code.slice(lastIndex, match.index));
        }

        const [full, comment, str, num, word, op] = match;

        if (comment) {
          html += '<span class="hl-comment">' + escapeHtml(comment) + '</span>';
        } else if (str) {
          html += '<span class="hl-string">' + escapeHtml(str) + '</span>';
        } else if (num) {
          html += '<span class="hl-number">' + escapeHtml(num) + '</span>';
        } else if (word) {
          if (keywords.has(word)) {
            html += '<span class="hl-keyword">' + escapeHtml(word) + '</span>';
          } else if (constants.has(word)) {
            html += '<span class="hl-boolean">' + escapeHtml(word) + '</span>';
          } else if (types.has(word)) {
            html += '<span class="hl-type">' + escapeHtml(word) + '</span>';
          } else {
            const nextIdx = match.index + full.length;
            const lookAhead = code.slice(nextIdx, nextIdx + 8).trimStart();
            if (lookAhead.startsWith("(")) {
              html += '<span class="hl-function">' + escapeHtml(word) + '</span>';
            } else if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
              html += '<span class="hl-type">' + escapeHtml(word) + '</span>';
            } else {
              html += escapeHtml(word);
            }
          }
        } else if (op) {
          html += '<span class="hl-operator">' + escapeHtml(op) + '</span>';
        } else {
          html += escapeHtml(full);
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < code.length) {
        html += escapeHtml(code.slice(lastIndex));
      }

      return html;
    }

    function renderFileContent(fileData) {
      loadingViewerStateEl.style.display = "none";
      emptyViewerStateEl.style.display = "none";
      fileMetaBarEl.style.display = "flex";
      fileCodeWrapperEl.style.display = "flex";
      fileViewerActionsEl.style.display = "flex";

      const filename = fileData.path.split("/").pop() || fileData.path;
      fileMetaIconEl.textContent = getFileIcon(filename);
      fileMetaPathEl.textContent = fileData.path;
      fileMetaLangEl.textContent = fileData.language || "text";

      const lineCount = typeof fileData.lines === "number" ? fileData.lines : (fileData.content ? fileData.content.split("\\n").length : 0);
      fileMetaLinesEl.textContent = lineCount + (lineCount === 1 ? " line" : " lines");

      const bytes = fileData.bytes || 0;
      fileMetaSizeEl.textContent = formatBytes(bytes);

      // Render line numbers
      let lineNumbersHtml = "";
      for (let i = 1; i <= lineCount; i++) {
        lineNumbersHtml += i + "<br>";
      }
      fileLineNumbersEl.innerHTML = lineNumbersHtml;

      // Render code with syntax highlighting
      fileCodeContentEl.innerHTML = highlightCode(fileData.content || "", fileData.language || "");
      fileCodeWrapperEl.scrollTop = 0;
      fileCodeWrapperEl.scrollLeft = 0;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function switchViewerTab(tab) {
      state.activeViewerTab = tab;
      if (tab === "file") {
        tabFileBtnEl.classList.add("active");
        tabActivityBtnEl.classList.remove("active");
        fileContentViewEl.style.display = "flex";
        pipelineActivityViewEl.style.display = "none";
        if (state.selectedFile) {
          fileViewerActionsEl.style.display = "flex";
        }
      } else {
        tabFileBtnEl.classList.remove("active");
        tabActivityBtnEl.classList.add("active");
        fileContentViewEl.style.display = "none";
        pipelineActivityViewEl.style.display = "flex";
        fileViewerActionsEl.style.display = "none";
      }
    }

    function toggleWrap() {
      state.isWrapped = !state.isWrapped;
      if (state.isWrapped) {
        fileCodeContentEl.classList.add("wrapped");
        wrapToggleBtnEl.textContent = "Wrap: On";
        wrapToggleBtnEl.classList.add("active");
      } else {
        fileCodeContentEl.classList.remove("wrapped");
        wrapToggleBtnEl.textContent = "Wrap: Off";
        wrapToggleBtnEl.classList.remove("active");
      }
    }

    function copyFileContent() {
      if (!state.selectedFile) return;
      const fileData = state.fileCache.get(state.selectedFile);
      if (!fileData || !fileData.content) return;

      navigator.clipboard.writeText(fileData.content).then(() => {
        const copyBtn = document.getElementById("copy-file-btn");
        if (copyBtn) {
          const original = copyBtn.textContent;
          copyBtn.textContent = "✓ Copied!";
          setTimeout(() => {
            copyBtn.textContent = original;
          }, 1800);
        }
      }).catch((err) => {
        console.error("Clipboard copy error:", err);
      });
    }

    function mentionActiveFile() {
      if (!state.selectedFile) return;
      insertMentionIntoChat(state.selectedFile);
    }

    function insertMentionIntoChat(filePath) {
      const mention = "@" + filePath + " ";
      const val = userInputEl.value;
      const pos = userInputEl.selectionStart || val.length;
      userInputEl.value = val.slice(0, pos) + mention + val.slice(pos);
      userInputEl.focus();
      userInputEl.setSelectionRange(pos + mention.length, pos + mention.length);
    }

    function handleFileSearch(query) {
      state.fileSearchQuery = query;
      renderFileTree();
    }

    function collapseAllDirs() {
      state.expandedDirs.clear();
      renderFileTree();
    }

    function refreshFileTree() {
      state.fileCache.clear();
      fetchWorkspaceFiles();
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

    function agentTextToMarkdown(text) {
      const trimmed = String(text || "").trim();
      const fence = String.fromCharCode(96).repeat(3);
      let candidate = trimmed;
      if (candidate.startsWith(fence) && candidate.endsWith(fence)) {
        candidate = candidate.slice(fence.length, -fence.length).replace(/^json\\s*/i, "").trim();
      }
      try {
        return jsonToMarkdown(JSON.parse(candidate));
      } catch {
        return String(text || "");
      }
    }

    function jsonToMarkdown(value, depth = 0) {
      if (value === null) return "_null_";
      if (Array.isArray(value)) {
        if (!value.length) return "_No items._";
        return value.map((item) => {
          if (item && typeof item === "object") {
            return jsonToMarkdown(item, depth);
          }
          return "- " + jsonScalarToMarkdown(item);
        }).join("\\n\\n");
      }
      if (typeof value === "object") {
        const entries = Object.entries(value);
        if (!entries.length) return "_No details._";
        const heading = "#".repeat(Math.min(depth + 2, 6));
        return entries.map(([key, nested]) => {
          const label = key
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_-]+/g, " ")
            .replace(/\\b\\w/g, (letter) => letter.toUpperCase());
          return heading + " " + label + "\\n\\n" + jsonToMarkdown(nested, depth + 1);
        }).join("\\n\\n");
      }
      return jsonScalarToMarkdown(value);
    }

    function jsonScalarToMarkdown(value) {
      if (typeof value === "string") return value || "_Empty_";
      const tick = String.fromCharCode(96);
      return tick + String(value) + tick;
    }

    function formatMarkdown(text) {
      if (!text) return "";
      const tick = String.fromCharCode(96);
      const blocks = [];
      let escaped = escapeHtml(String(text)).replace(new RegExp(tick + tick + tick + "([^\\n]*)\\n?([\\s\\S]*?)" + tick + tick + tick, "g"), (_match, _lang, code) => {
        const token = "@@CODE_BLOCK_" + blocks.length + "@@";
        blocks.push("<pre><code>" + code.replace(/\\n$/, "") + "</code></pre>");
        return "\\n" + token + "\\n";
      });
      const inlineCode = [];
      escaped = escaped.replace(new RegExp(tick + "([^" + tick + "\\n]+)" + tick, "g"), (_match, code) => {
        const token = "@@INLINE_CODE_" + inlineCode.length + "@@";
        inlineCode.push("<code>" + code + "</code>");
        return token;
      });

      function renderInline(line) {
        return line
          .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^ )]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
          .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
          .replace(/__([^_]+)__/g, "<strong>$1</strong>")
          .replace(/(^|[^*])\\*([^*]+)\\*(?!\\*)/g, "$1<em>$2</em>")
          .replace(/~~([^~]+)~~/g, "<del>$1</del>")
          .replace(/@@INLINE_CODE_(\\d+)@@/g, (_match, index) => inlineCode[Number(index)] || "");
      }

      const lines = escaped.split("\\n");
      const output = [];
      let listType = null;
      const closeList = () => {
        if (listType) output.push("</" + listType + ">");
        listType = null;
      };
      for (const line of lines) {
        const unordered = line.match(/^\\s*[-*+]\\s+(.+)$/);
        const ordered = line.match(/^\\s*\\d+\\.\\s+(.+)$/);
        const listMatch = unordered || ordered;
        if (listMatch) {
          const nextType = unordered ? "ul" : "ol";
          if (listType !== nextType) {
            closeList();
            output.push("<" + nextType + ">");
            listType = nextType;
          }
          output.push("<li>" + renderInline(listMatch[1]) + "</li>");
          continue;
        }
        closeList();
        if (!line.trim()) continue;
        const codeBlock = line.match(/^@@CODE_BLOCK_(\\d+)@@$/);
        if (codeBlock) {
          output.push(blocks[Number(codeBlock[1])] || "");
          continue;
        }
        const heading = line.match(/^(#{1,6})\\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          output.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
          continue;
        }
        const quote = line.match(/^&gt;\\s*(.*)$/);
        if (quote) {
          output.push("<blockquote>" + renderInline(quote[1]) + "</blockquote>");
          continue;
        }
        output.push("<p>" + renderInline(line) + "</p>");
      }
      closeList();
      return output.join("");
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>`;
}
