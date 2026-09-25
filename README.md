# Autonomous Agent Harness (`RefuteFlow`)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-21%20suites%20%2F%20140%2B%20passed-brightgreen.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

**English** | [**日本語**](README.ja.md)

---

`RefuteFlow` is an autonomous software engineering harness built on TypeScript and the OpenAI / Codex SDK. Rather than treating Large Language Models as simple "diff generators" that apply superficial patches, `RefuteFlow` treats LLMs as **hypothesis exploration engines** regulated by a deterministic, evidence-driven supervisory architecture.

It is designed to counter the **"Minimal-Diff Trap"** (where agents apply short-sighted workarounds to minimize changes) through multi-level architectural exploration, counterfactual checks, isolated Git worktrees, metamorphic invariant verification, and blind clean-room peer review.

---

## Table of Contents

- [The Problem: The Minimal-Diff Trap](#the-problem-the-minimal-diff-trap)
- [Core Engineering Principles](#core-engineering-principles)
- [System Architecture](#system-architecture)
- [Key Mechanisms](#key-mechanisms)
  - [1. Evidence-Based Candidate Ranking](#1-evidence-based-candidate-ranking)
  - [2. The Intervention Ladder (L0–L6)](#2-the-intervention-ladder-l0l6)
  - [3. Counterfactual Architecture Check](#3-counterfactual-architecture-check)
  - [4. Divergent Generation & Diversity Gate](#4-divergent-generation--diversity-gate)
  - [5. Model-Directed Research Routing](#5-model-directed-research-routing)
  - [6. Cheap-Falsification-First Scheduling (MAB)](#6-cheap-falsification-first-scheduling-mab)
  - [7. Parallel Exploration via Isolated Git Worktrees](#7-parallel-exploration-via-isolated-git-worktrees)
  - [8. Autonomous Candidate Testing & Self-Repair Feedback Loop](#8-autonomous-candidate-testing--self-repair-feedback-loop)
  - [9. Outer Behavior Tree + Accumulated Context Recovery](#9-outer-behavior-tree--accumulated-context-recovery)
  - [10. Multi-Tier Verification & Metamorphic / Invariant Oracles](#10-multi-tier-verification--metamorphic--invariant-oracles)
  - [11. Clean-Room Reviewer](#11-clean-room-reviewer)
  - [12. Structured Evidence Store & Lossless Context Compactor](#12-structured-evidence-store--lossless-context-compactor)
  - [13. GitHub Broker & Verified Commit SHA Invariant](#13-github-broker--verified-commit-sha-invariant)
  - [14. Durable SQLite FTS5 Memory & Promotion Ladder](#14-durable-sqlite-fts5-memory--promotion-ladder)
  - [15. Calibrated DPO Trajectory Exporter](#15-calibrated-dpo-trajectory-exporter)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Usage](#usage)
  - [Interactive Slash Commands & File Completion](#interactive-slash-commands)
  - [Web UI Server Mode (3-Column Dashboard)](#web-ui-server-mode---server----s)
- [Configuration](#configuration)
  - [GitHub App Setup](#github-app-setup)
  - [Multi-Dimensional Budget Governor](#multi-dimensional-budget-governor)
- [Repository Structure](#repository-structure)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [License](#license)

---

## The Problem: The Minimal-Diff Trap

Conventional coding agents typically optimize for the shortest edit distance that satisfies immediate test cases:

```text
Bug / Task Influx ──▶ LLM predicts 3-line patch ──▶ Tests Pass ──▶ Technical Debt Accumulates
```

This heuristic leads to severe engineering failures:
1. **Symptom Hiding**: Wrapping failing code in `try-catch` blocks or adding ad-hoc `if` branches instead of fixing broken architectural assumptions.
2. **Context Anchoring**: Blindly accepting existing codebase flaws as immutable design constraints.
3. **Self-Grading Bias (Echo Chamber)**: Allowing the same LLM instance that authored the code to declare "implementation successful" without independent adversarial verification.
4. **Context Window Contamination**: Accumulating megabytes of failed trial traces, which dilutes attention and degrades model reasoning over extended sessions.

`RefuteFlow` replaces this fragile paradigm with a rigorous scientific method: **Hypothesis Generation $\rightarrow$ Counter-Argument Falsification $\rightarrow$ Parallel Isolated Execution $\rightarrow$ Objective Machine Verification $\rightarrow$ Blind Peer Review**.

---

## Core Engineering Principles

From [AGENTS.md](AGENTS.md):

1. **The existing implementation is evidence about the system, not a design constraint.**
2. **Optimization Priorities**:
   1. Correctness
   2. Simplicity of the resulting system
   3. Architectural coherence
   4. Performance
   5. Maintainability
   *(Do NOT optimize for minimizing the size of the diff).*
3. **Backward compatibility is required only when it is an explicit project requirement.**
4. **Architectural changes require falsifiable rationale, empirical evidence, and machine validation.**

---

## System Architecture

```text
                                User Goal
                                    │
                                    ▼
       Repo Inspect (Topology / AST / Git History / Invariants)
                                    │
                                    ▼
         Problem Signature Generation (Anti-Memory Anchoring)
                                    │
                                    ▼
         Memory / Skill Retrieval (Signature-targeted FTS5)
                                    │
                                    ▼
            Fast / Deep Triage ─────────────────────────┐
              │ FAST                                     │ DEEP
              ▼                                          ▼
       FastImplement (Single Worktree)      Research Router (live web search)
              │                                          │
              ▼                                          ▼
       Independent Verify                         Diagnose (Intervention Ladder L0–L6)
              │                                          │
              ▼                                          ▼
              │                             Diversity Gate (Orthogonal hypotheses)
              │                                          │
              ▼                                          ▼
              │                             Falsification (Counter-argument scrutiny)
              │                                          │
              ▼                                          ▼
              │                             Parallel Worktrees (Isolated A / B / C)
              │                                          │
              ▼                                          ▼
              │                             Test & Oracle Integrity Gate (Anti-cheat)
              │                                          │
              ▼                                          ▼
              │                             Machine Verification (Exit code / Regressions)
              │                                          │
              ▼                                          ▼
              │                             Per-Candidate Hard Gate (Zero tolerance)
              │                                          │
              ▼                                          ▼
              │                             Pareto / Lexicographic Sort (Evidence score)
              │                                          │
              ▼                                          ▼
              │                             Candidate Queue [C1, C2, ..., Cn]
              │                                          │
              ▼                                          ▼
              └────────────────────────────▶ Clean-Room Review (read-only sandbox)
                                              │
                                              ├── REJECT ──▶ Next in queue available?
                                              │               ├── YES ──▶ Review next candidate
                                              │               └── NO  ──▶ Structured Backtrack Router
                                              │                             ├── IMPLEMENTATION_ERROR ──▶ Implement
                                              │                             ├── FALSIFICATION_GAP    ──▶ Falsify
                                              │                             ├── ROOT_CAUSE_ERROR     ──▶ Diagnose
                                              │                             ├── EXTERNAL_SPEC        ──▶ Research
                                              │                             └── REPO_MODEL_ERROR     ──▶ Inspect
                                              └── APPROVED
                                                    │
                                                    ▼
                                            Integration Verification (Full Test Suite)
                                                    │
                                                    ▼
                                            Publish (GitHub Broker Pull Request)
                                                    │
                                                    ▼
                                            Provenance Memory & Skill Crystallization
                                            ├── Record Architecture Decision Record (ADR)
                                            ├── Crystallize Reusable Procedural Skills
                                            ├── Update Verified Durable Memory (FTS5)
                                            └── Export Calibrated DPO Trajectories
```

---

## Key Mechanisms

### 1. Evidence-Based Candidate Ranking

Candidates first pass baseline-relative hard gates. Qualified candidates are then ranked by measured performance improvement, evidence strength, and verification score, in that order. Candidate ID breaks exact ties deterministically. Architectural intervention level and diff size are recorded as context, not used to rank candidates.

Correctness and regression checks are enforced by the hard gates. The ranking does not directly measure maintainability or architectural coherence, and it does not treat line count as a proxy for either. A larger change is not preferred merely for being larger; candidates rank according to their verified outcomes and evidence. For a comprehensive, evidence-based assessment of what is mechanically verified versus empirical hypotheses, see [docs/architecture-evaluation.md](docs/architecture-evaluation.md).

### 2. The Intervention Ladder (L0–L6)

To prevent models from prematurely defaulting to either surface-level patches or ungrounded rewrites, exploration is categorized across explicit intervention tiers:

| Level | Tier | Description | Typical Use Case |
|---|---|---|---|
| **L0** | Investigation Only | Root-cause analysis, reproduction scripts, no code changes | Diagnostic phase |
| **L1** | Local Implementation | Targeted fix within a single function or module | Isolated bug fix |
| **L2** | Module Redesign | Refactoring interface/state ownership within one module | Encapsulation leaks |
| **L3** | Subsystem Redesign | Cross-module contract adjustments and pipeline re-alignment | Multi-module coupling |
| **L4** | Architecture Replacement | Overhauling subsystems, state managers, or runtime layers | Invariant collapse |
| **L5** | Research-Oriented Redesign | Novel algorithmic or protocol restructuring | Hard scalability ceilings |
| **L6** | Complete Architecture Reset | Clean-slate rewrite under identical external requirements | Total technical bankruptcy |

**Automatic Escalation Triggers:**
- Same failure pattern repeated across $\ge 3$ distinct call sites.
- Same bug class previously patched $\ge 2$ times in git history.
- Multiple modules mutating the same shared state without clear ownership.
- Every feature increment introduces new conditional branches (`if`/`switch`) to core abstractions.

### 3. Counterfactual Architecture Check

During architectural diagnosis, the model is confronted with an anti-anchoring question:
> *"If this codebase did not exist today and you were given only the functional requirements, would you choose the current architecture?"*

If the answer is `No`, the model must justify maintaining the legacy design versus migrating to the ideal design, neutralizing status-quo bias.

### 4. Divergent Generation & Diversity Gate

The system prompts multiple distinct architectural stances in parallel:
- **Pragmatist**: Resolves the problem while maximizing reuse of the current design.
- **Architectural Reformer**: Redesigns boundaries, state ownership, and dataflow.
- **First-Principles Theorist**: Re-derives algorithms from scratch, disregarding existing code.
- **External Analogy Scout**: Adapts patterns proven in other ecosystems or literature.

The **Diversity Gate** mathematically ensures that surviving candidates are structurally orthogonal before wasting compute on implementation.

### 5. Model-Directed Research Routing

Before launching deep architectural diagnosis, `RefuteFlow` dynamically determines whether external literature or ecosystem research is required (`src/phases/research-router.ts`):
- **Model Judgment (`judgeResearchNeed`)**: Prompts the LLM in the task's native language to evaluate whether the goal demands prior-art comparison, protocol RFCs, or domain knowledge not self-contained in the repo.
- **Pattern Signals**: Automatically flags triggers such as latency/throughput targets, lock-free/concurrency primitives, algorithmic data structure overhauls, core subsystem redesigns, or major API migrations.
- When routed to `Research`, an autonomous worker queries live documentation and crystallizes structured architectural findings into `CandidateResearchSchema` before diagnosis begins.

### 6. Cheap-Falsification-First Scheduling (MAB)

Before expensive code generation, a dedicated **Falsifier** attempts to break each hypothesis with counter-arguments, race conditions, edge-case proofs, and complexity traps.

Candidates are scheduled using an Information-Gain-per-Cost Multi-Armed Bandit (MAB):

$$
\text{Priority} = \frac{\Delta \text{Information Gain}}{\text{Estimated Verification Cost}}
$$

Cheap, high-risk tests run first to prune invalid hypotheses with minimal token and runtime expenditure.

### 7. Parallel Exploration via Isolated Git Worktrees

Unlike naive agents that pollute the workspace with abandoned intermediate changes, `RefuteFlow` isolates every candidate into dedicated Git worktrees (`worktrees/run-<id>-<cand>/`):
- Clean git state with separate working trees.
- Parallel worker execution in isolated filesystem roots.
- Automated branch cleanup upon candidate rejection.

### 8. Autonomous Candidate Testing & Self-Repair Feedback Loop

During implementation, candidate workers act with high autonomy while respecting repository conventions (`src/phases/implement.ts`):
- **Autonomous Check Selection**: Rather than running blindly rigid test commands, workers evaluate whether testing adds useful confidence, selecting appropriate tests, scripts, and scopes from existing fixtures.
- **Automated Self-Repair Loop (`repairFailedCandidates`)**: If independent harness verification detects failures (e.g. non-zero exit codes, failing test IDs, regression errors), the failure output (up to 20,000 characters) is fed back directly to the candidate's worker thread. The worker diagnoses the failure in its worktree, repairs the underlying defect without altering test intent, reruns checks, and commits the fix for re-verification.

### 9. Outer Behavior Tree + Accumulated Context Recovery

The harness employs a resilient dual-control architecture:
- **Outer Behavior Tree (BT)**: Manages global strategy, high-level fallbacks, timeouts, retries, and clean-up using `Sequence`, `Selector`, `Parallel`, and decorator nodes (`Tracer`, `Retry`, `Timeout`).
- **Inner Deep FSM (`DeepController`)**: Orchestrates precision transitions between `Diagnose`, `Falsify`, `Implement`, `Verify`, and `Review`.
- **Accumulated Context Recovery (`maxAutomaticRestarts`)**: If the Behavior Tree execution returns a failure, the orchestrator preserves the accumulated context—including failed phase, error traces, previous implementations, and verification outcomes (`recoveryHistory`)—and restarts from `Inspect`. Subsequent attempts leverage prior failure evidence to avoid repeating dead-end approaches.
- **Structured Backtrack Router**: Classifies mid-flight candidate rejections into 5 structured classes:
  1. `IMPLEMENTATION_ERROR` $\rightarrow$ Jump directly to `Implement`
  2. `FALSIFICATION_GAP` $\rightarrow$ Jump to `Falsify`
  3. `ROOT_CAUSE_ERROR` $\rightarrow$ Jump to `Diagnose`
  4. `EXTERNAL_SPEC` $\rightarrow$ Jump to `Research`
  5. `REPO_MODEL_ERROR` $\rightarrow$ Jump to `Inspect`

### 10. Multi-Tier Verification & Metamorphic / Invariant Oracles

The harness never trusts the LLM's own declaration that code works. Verification is performed mechanically:
- **Baseline-Relative Hard Gate & Identity Delta**: Computes hash-based set differences of compiler/linter diagnostics ($\text{Cand} \setminus \text{Base} = \emptyset$) to prevent accidental regression masking.
- **Oracle Integrity Gate**: Detects and rejects unauthorized modifications to test suites or verification fixtures.
- **Tier 3 Metamorphic / Invariant Oracles**: Evaluates algebraic properties independent of static test cases:
  - Idempotence: $f(f(x)) = f(x)$
  - Round-trip serialization: $\text{decode}(\text{encode}(x)) = x$
  - State commutativity and invariant bounds.

### 11. Clean-Room Reviewer

Approved candidates are submitted to an independent, blind **Clean-Room Reviewer**:
- Spawned in an isolated thread with **no prior implementation context** (preventing sunk-cost rationalization).
- Sandboxed in `read-only` mode with disabled network access.
- Given only the PR diff, the original goal, and the verification metrics.
- Evaluates the change from the perspective of an adversarial principal engineer.

### 12. Structured Evidence Store & Lossless Context Compactor

Extended self-healing loops suffer from context pollution. `RefuteFlow` separates volatile scratchpads from permanent facts:
- **4-Layer Structured Evidence Store**: Immutable records divided into `Observation`, `Assertion`, `Inference`, and `Decision`.
- **Context Compactor**: Upon backtrack or phase transitions, transient chat logs and massive stack traces are purged. Only negative constraints, violated invariants, and distilled lessons are preserved into prompt projections.

### 13. GitHub Broker & Verified Commit SHA Invariant

Security and branch integrity are strictly maintained:
- **Least-Privilege GitHub App**: No raw personal access tokens (PAT) or `GITHUB_TOKEN` credentials are exposed to the LLM. All operations flow through a strictly typed `GitHubBroker`.
- **Verified Commit SHA Invariant**: Commits staged on `origin/main` are cryptographically verified through full local integration test suites. Only the exact commit SHA that passed all tests is pushed to GitHub:

$$
\text{SHA}_{\text{verified}} \equiv \text{SHA}_{\text{PR}}
$$

### 14. Durable SQLite FTS5 Memory & Promotion Ladder

Past discoveries, architecture decision records (ADRs), and procedural skills are stored in an embedded SQLite FTS5 database. Knowledge progresses through a monotonic verification lifecycle:

```text
UNVERIFIED (0.2)
       │
       ▼
LOCAL_TEST_PASSED (0.5)
       │
       ▼
LOCAL_INTEGRATION_VERIFIED (0.8)
       │
       ▼
PR_CREATED (0.85)
       │
       ▼
MERGED (1.0)
```

Problem signatures generated during repository inspection match relevant historical lessons via BM25 full-text indexing, preventing recurrent architectural mistakes across runs.

### 15. Calibrated DPO Trajectory Exporter

Execution trajectories are automatically recorded and exported in Direct Preference Optimization (DPO) compatible JSONL datasets (`.agent/trajectories/`). Winning solutions form `chosen` entries while rejected candidates form `rejected` entries, annotated with empirical confidence weights based on reviewer orthogonality and invariant verification depth.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **Package Manager**: `pnpm` (recommended, `v10.5.2`+) or `npm`
- **OpenAI Authentication**: Either ChatGPT OAuth via `codex login`, or `OPENAI_API_KEY`

### Standalone macOS Executables (Zero-Dependency)

Download pre-built standalone macOS executables from GitHub Releases (Universal binary supporting both Apple Silicon and Intel Macs):

```bash
# Download and extract the latest Universal macOS binary
curl -fsSL https://github.com/mas2194/my_harness/releases/latest/download/my_harness-darwin-universal.tar.gz | tar -xz
chmod +x my_harness
sudo mv my_harness /usr/local/bin/

# Run
my_harness /help
```

To build macOS executables from source:
```bash
npm run build:binary
# Generates arm64, x64, and universal executables in release/
```

### Installation from Source

```bash
# Clone the repository
git clone https://github.com/mas2194/my_harness.git
cd my_harness

# Install dependencies
pnpm install
# or: npm install

# Build the TypeScript project
pnpm run build
# or: npm run build
```

### Environment Setup

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# LLM / Codex Configuration
# When logged in via `codex login` (ChatGPT OAuth), OPENAI_API_KEY is not required.
USE_CODEX=true
# OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-6-luna

# Optional: GitHub App Integration for automated PR publication
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=./secrets/github-app.private-key.pem
GITHUB_APP_INSTALLATION_ID=
GITHUB_TARGET_OWNER=
GITHUB_TARGET_REPO=

# Execution Configuration
MAX_PARALLEL_EXPERIMENTS=3
WORKTREES_DIR=./worktrees
# Optional: leave unset to let each candidate agent choose useful checks.
HARNESS_TEST_COMMAND="npm test"
```

### Usage

Run the harness interactively or against a specific engineering objective:

```bash
# Interactive mode (Enter: submit, Shift+Enter: newline, Tab: @ file completion)
npx tsx src/main.ts

# Directly pass an objective
npx tsx src/main.ts "Migrate storage layer to SQLite and eliminate duplicate state"

# Directly specify model (-m) and reasoning effort (-e) via CLI flags
npx tsx src/main.ts -m gpt-6-sol -e high "Refactor network layer"

# Launch Web UI Server (-s) on custom port (-p)
npx tsx src/main.ts -s -p 8080

# Or after building
node dist/main.js
```

#### CLI Flags Reference

| Flag | Short | Description | Default |
|---|---|---|---|
| `--model <name>` | `-m` | Active LLM / Codex model (e.g. `gpt-6-sol`, `gpt-6-luna`, `o3-mini`) | `gpt-6-luna` (or `OPENAI_MODEL`) |
| `--effort <level>` | `-e` | Reasoning effort (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `persistent`) | `medium` |
| `--server` | `-s` | Start the browser-based Web UI server | `false` (interactive CLI) |
| `--port <num>` | `-p` | Port number for the Web UI server | `3000` (or `PORT` env) |

#### Interactive Slash Commands

Similar to Codex CLI, `RefuteFlow` supports dynamic interactive slash commands in the interactive prompt:

- **`/model`** or **`/model <name|number>`**:
  - Without arguments: Lists all available Codex models (auto-loaded from `~/.codex/models_cache.json`), supported reasoning effort levels, and interactive selection.
  - With argument: Switches the active model dynamically (e.g. `/model gpt-6-sol` or `/model 2`).
- **`/effort`** or **`/effort <level|number>`**:
  - Without arguments: Lists all reasoning effort levels (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `persistent`) and their descriptions.
  - With argument: Switches reasoning effort level dynamically (e.g. `/effort high` or `/effort 4`).
- **`/status`**: Displays current active model, effort, test command, and execution settings.
- **`/help`**: Lists available commands and prompt navigation instructions.
- **`/exit`**, **`/quit`**, **`/q`** (or `exit`, `quit`, `q`): Exit the harness session.

#### `@` Command (File Loading & Tab Completion)

Reference and load workspace files directly into your goal context using `@`:

- **`@<file>`** or **`@ <file>`**:
  - Automatically loads the specified file's contents and injects them as structured markdown into the prompt context.
  - Example: `@src/main.ts Refactor error handling`
  - Example: `Compare @src/main.ts and @src/codex/commands.ts`
  - Line range slicing: `@src/main.ts:10-50`
- **Tab Key (tap) Candidate Completion & Selection**:
  - Type `@` or `@<prefix>` and press **Tab** to list candidate workspace files.
  - Press **Tab** (or **Down** / **Up** / **Shift+Tab**) to cycle through candidates and select one in place.
  - Press **Enter** or **Space** to confirm the selection and continue typing your prompt (**Esc** to dismiss).

#### Web UI Server Mode (`--server` / `-s`)

Launch the harness with `--server` (or `-s`) to interact with the system via a browser-based Web UI:

```bash
# Start Web UI Server (default port: 3000)
npm run server
# or:
npx tsx src/main.ts --server

# Custom port, model, and reasoning effort
npx tsx src/main.ts -s -p 8080 -m o3-mini -e high
```

Open `http://localhost:3000` in your browser for a modern **3-Column Dashboard**:

- **Left Pane (Model Conversation & Controls)**:
  - Chat interface to submit engineering goals, converse with the agent, and inspect progress.
  - Header controls for dynamic model switching and reasoning effort selection.
  - Quick-action chips (`@src/main.ts`, `/help`, etc.) and `@<file>` auto-completion dropdown.
  - Supports all interactive slash commands (`/model`, `/effort`, `/status`, `/help`).
- **Center Pane (File Content & Pipeline / Activity View)**:
  - **`📄 File Content` Tab**:
    - High-fidelity file viewer with syntax highlighting (TypeScript/JavaScript, JSON, Python, HTML, CSS, Markdown, Shell).
    - Line numbering, language badge, line count, and file size indicators.
    - Word wrap toggle, one-click `@ Mention` insertion into chat, and clipboard copy.
  - **`📊 Pipeline & Activity` Tab**:
    - **Harness Stage Pipeline Graph**: Real-time interactive visualization of pipeline stages (`Inspect` → `Triage` → `Explore` → `Integrate` → `Publish` → `Learn`) with live status indicators and phase-click filtering.
    - **Explore Flow Navigator**: Visualizes the ordered exploration steps (`Research` through `Review`) with direct jumps to corresponding sub-agent activity.
    - **Codex Sub-Agent Activity Panel**: Real-time stream of sub-agent thoughts, tool execution, generated output, logs, and phase summaries.
- **Right Pane (Workspace File Tree)**:
  - Full workspace file tree browser with real-time text search and directory expand/collapse.
  - Clicking any file opens it instantly in the center File Content viewer.
  - Dedicated `@` button next to each file to insert its mention directly into the chat input.
- **REST & SSE Endpoints**:
  - `GET /api/file?path=<path>`: Safe workspace file retrieval with strict path traversal prevention.
  - `POST /api/chat`, `GET /api/events` (Server-Sent Events), `GET /api/status`, `GET /api/models`, `GET /api/files`.

During execution, `RefuteFlow` will:
1. Inspect the repository AST, topology, and invariant contracts.
2. Route external research if needed based on model judgment and pattern signals.
3. Formulate diagnostic hypotheses across multiple intervention levels.
4. Subject hypotheses to counter-argument falsification and MAB scheduling.
5. Spawn isolated Git worktrees and implement surviving candidates with autonomous check selection.
6. Trigger automated self-repair feedback loops if tests fail during candidate verification.
7. Execute compiler, test suite, and invariant oracles against all candidates.
8. Submit the winning candidate to clean-room review.
9. Integrate the verified commit into the workspace or publish an authenticated GitHub Pull Request.
10. If execution fails, automatically restart from Inspect with accumulated context and error history.

---

## Configuration

### GitHub App Setup

For production automation where the harness creates branches and pull requests, configure a GitHub App with the following least-privilege repository permissions:

| Permission | Access | Purpose |
|---|---|---|
| **Contents** | Read & Write | Branch creation, commit pushes, file changes |
| **Pull Requests** | Read & Write | Opening PRs, adding review comments |
| **Issues** | Read & Write | Logging architectural debt issues |
| **Checks** | Read-Only | Reading remote CI status |
| **Actions / Workflows** | Read-Only (Write optional) | Reading workflow outcomes |

Save the private key `.pem` file to `./secrets/github-app.private-key.pem` and populate the `GITHUB_APP_*` values in `.env`.

### Multi-Dimensional Budget Governor

To prevent run-away exploration costs, `RefuteFlow` enforces a multi-dimensional budget governor:

```typescript
const harness = new HarnessStateMachine({
  goal: "Refactor core event loop",
  budgetLimits: {
    maxIterations: 5,           // Maximum FSM loop iterations
    maxCandidates: 8,           // Maximum candidate implementations
    maxTestRuns: 20,            // Maximum automated test runs
    maxBacktracks: 4,           // Maximum phase backtracks
  }
});
```

---

## Repository Structure

```text
RefuteFlow/
├── AGENTS.md                  # Engineering principles & negative constraints
├── .env.example               # Environment variables template
├── docs/
│   └── architecture-evaluation.md # Evidence-based evaluation & limitations analysis
├── prompts/                   # Specialized system prompts for each agent role
│   ├── architect.md           # Divergent hypothesis generator
│   ├── falsifier.md           # Adversarial counter-argument reviewer
│   ├── implementer.md         # Worktree implementation worker
│   ├── researcher.md          # External specification & literature investigator
│   └── reviewer.md            # Clean-room blind peer reviewer
├── src/
│   ├── main.ts                # CLI & Web Server entry point
│   ├── bt/                    # Behavior Tree engine (Composites, Decorators, Action nodes)
│   ├── orchestrator/          # Hybrid Orchestration (BT, Deep FSM, Evidence Store, Compactor)
│   │   ├── orchestrator.ts    # Top-level orchestrator with accumulated context recovery
│   │   ├── actions.ts         # Behavior tree action execution & state binding
│   │   ├── tree.ts            # Behavior tree structure definition
│   │   ├── deep-controller.ts # Inner FSM controller for deep exploration
│   │   ├── backtrack-router.ts# Structured 5-class failure routing
│   │   ├── evidence-store.ts  # 4-layer immutable structured evidence store
│   │   ├── compactor.ts       # Context distillation and state compactor
│   │   ├── context.ts         # Harness & attempt context definitions
│   │   └── state-machine.ts   # Public facade API
│   ├── phases/                # Autonomous execution phases
│   │   ├── inspect-repo.ts    # Codebase topology, AST & invariant inspection
│   │   ├── triage.ts          # Fast vs Deep execution path router
│   │   ├── research-router.ts # Model-directed & pattern-based research router
│   │   ├── research.ts        # External & literature research worker
│   │   ├── architect.ts       # Intervention Ladder hypothesis generator
│   │   ├── diversity-gate.ts  # Orthogonal candidate filter
│   │   ├── adaptive-scheduler.ts # Information-gain / cost MAB candidate scheduler
│   │   ├── falsify.ts         # Adversarial counter-argument scrutiny
│   │   ├── implement.ts       # Worktree-isolated code synthesis & self-repair loop
│   │   └── review.ts          # Blind clean-room reviewer
│   ├── evaluator/             # Verification engines & oracles
│   │   ├── runner.ts          # Machine test & benchmark runner
│   │   ├── integrity.ts       # Test & fixture anti-tampering gate
│   │   ├── oracle.ts          # Tier 3 metamorphic / invariant oracles
│   │   └── pareto.ts          # Multi-objective Pareto / lexicographic sorter
│   ├── codex/                 # Codex SDK integration & CLI interactive tools
│   │   ├── client.ts          # Codex client manager & worker threads
│   │   ├── commands.ts        # Dynamic slash commands (/model, /effort, etc.)
│   │   ├── config.ts          # Model configuration & cache loader
│   │   └── file-mention.ts    # Workspace @file loading, parsing & completion
│   ├── server/                # Web UI & REST / SSE Server
│   │   ├── server.ts          # HTTP server, file API & SSE dispatching
│   │   ├── harness-runner.ts  # Background harness execution manager
│   │   ├── event-bus.ts       # Central typed harness event bus
│   │   ├── events.ts          # Event schemas & protocol definitions
│   │   └── web/ui.ts          # 3-column dashboard UI (Chat, Viewer, File Tree)
│   ├── schemas/               # Zod schemas & typed domain models
│   │   ├── candidate.ts       # Candidate implementation schemas
│   │   ├── diagnosis.ts       # Hypothesis & diagnosis models
│   │   ├── evidence.ts        # Structured evidence layer schemas
│   │   ├── research.ts        # Literature & external research schemas
│   │   └── result.ts          # Verification results & metrics
│   ├── git/                   # Git worktree & branch manager
│   ├── github/                # Authenticated GitHub App broker & policy engine
│   ├── journal/               # Execution journal & crash-recovery reconciliation
│   ├── memory/                # SQLite FTS5 durable memory & verification ladder
│   ├── skills/                # Reusable procedural skill crystallization (SKILL.md)
│   ├── budget/                # Multi-dimensional budget tracker
│   └── trajectory/            # DPO preference dataset exporter
└── tests/                     # Comprehensive Vitest suites (21 files, 140+ tests)
```

---

## Testing & Quality Assurance

The codebase is thoroughly tested across unit, integration, and metamorphic evaluation suites:

```bash
# Run the complete test suite
pnpm test
# or: npm test

# Run tests in watch mode
pnpm run test:watch

# Run TypeScript typecheck
pnpm run lint
```

Test coverage includes:
- Behavior Tree composite and decorator execution contracts.
- DeepController FSM phase transitions and structured backtracking.
- Parallel Git worktree creation, isolation, and safe rollback.
- Context compactor distillation without evidence loss.
- Verification promotion ladder state transitions.
- Pareto ranking by measured performance and evidence strength, without diff-size preference.
- Metamorphic invariant validation and test integrity verification.
- Candidate autonomous testing and automated self-repair loop diagnostics.
- Model-directed and pattern-based research routing decisions.
- Web UI & REST API safe file retrieval with path traversal security checks.
- Interactive CLI slash commands, `@` file mentions, and in-place candidate cycling.
- Accumulated context recovery and automatic restart across failed runs.

---

## License

This project is licensed under the **Apache-2.0 License**. See [LICENSE](LICENSE) for details.
