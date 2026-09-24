# Autonomous Agent Harness (`my_harness`)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-83%20passed-brightgreen.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

**English** | [**日本語**](README.ja.md)

---

`my_harness` is an autonomous software engineering harness built on TypeScript and the OpenAI / Codex SDK. Rather than treating Large Language Models as simple "diff generators" that apply superficial patches, `my_harness` treats LLMs as **hypothesis exploration engines** regulated by a deterministic, evidence-driven supervisory architecture.

It systematically eliminates the **"Minimal-Diff Trap"** (where agents apply short-sighted workarounds to minimize changes) through multi-level architectural exploration, counterfactual checks, isolated Git worktrees, metamorphic invariant verification, and blind clean-room peer review.

---

## Table of Contents

- [The Problem: The Minimal-Diff Trap](#the-problem-the-minimal-diff-trap)
- [Core Engineering Principles](#core-engineering-principles)
- [System Architecture](#system-architecture)
- [Key Mechanisms](#key-mechanisms)
  - [1. Objective Function Without Minimal-Diff Bias](#1-objective-function-without-minimal-diff-bias)
  - [2. The Intervention Ladder (L0–L6)](#2-the-intervention-ladder-l0l6)
  - [3. Counterfactual Architecture Check](#3-counterfactual-architecture-check)
  - [4. Divergent Generation & Diversity Gate](#4-divergent-generation--diversity-gate)
  - [5. Cheap-Falsification-First Scheduling (MAB)](#5-cheap-falsification-first-scheduling-mab)
  - [6. Parallel Exploration via Isolated Git Worktrees](#6-parallel-exploration-via-isolated-git-worktrees)
  - [7. Outer Behavior Tree + Inner Deep FSM Controller](#7-outer-behavior-tree--inner-deep-fsm-controller)
  - [8. Multi-Tier Verification & Metamorphic / Invariant Oracles](#8-multi-tier-verification--metamorphic--invariant-oracles)
  - [9. Clean-Room Reviewer](#9-clean-room-reviewer)
  - [10. Structured Evidence Store & Lossless Context Compactor](#10-structured-evidence-store--lossless-context-compactor)
  - [11. GitHub Broker & Verified Commit SHA Invariant](#11-github-broker--verified-commit-sha-invariant)
  - [12. Durable SQLite FTS5 Memory & Promotion Ladder](#12-durable-sqlite-fts5-memory--promotion-ladder)
  - [13. Calibrated DPO Trajectory Exporter](#13-calibrated-dpo-trajectory-exporter)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Usage](#usage)
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

`my_harness` replaces this fragile paradigm with a rigorous scientific method: **Hypothesis Generation $\rightarrow$ Counter-Argument Falsification $\rightarrow$ Parallel Isolated Execution $\rightarrow$ Objective Machine Verification $\rightarrow$ Blind Peer Review**.

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

### 1. Objective Function Without Minimal-Diff Bias

The harness decouples diff size from candidate scoring. Candidates are ranked using an evidence-based objective function:

$
S = w_c C + w_p P + w_m M + w_a A + w_t T - w_r R - w_g G
$

Where:
- $C$: Correctness (test passage & invariant proofs)
- $P$: Performance delta (benchmark throughput/latency)
- $M$: Maintainability & modular simplicity
- $A$: Architectural coherence
- $T$: Empirical test evidence density
- $R$: Regression risk
- $G$: Migration / transitional cost

Diff line count is **never** an explicit metric. A 2,000-line modular overhaul is favored over a 2-line workaround if it yields higher architectural coherence and lower regression risk.

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

### 5. Cheap-Falsification-First Scheduling (MAB)

Before expensive code generation, a dedicated **Falsifier** attempts to break each hypothesis with counter-arguments, race conditions, edge-case proofs, and complexity traps.

Candidates are scheduled using an Information-Gain-per-Cost Multi-Armed Bandit (MAB):

$$
\text{Priority} = \frac{\Delta \text{Information Gain}}{\text{Estimated Verification Cost}}
$$

Cheap, high-risk tests run first to prune invalid hypotheses with minimal token and runtime expenditure.

### 6. Parallel Exploration via Isolated Git Worktrees

Unlike naive agents that pollute the workspace with abandoned intermediate changes, `my_harness` isolates every candidate into dedicated Git worktrees (`worktrees/run-<id>-<cand>/`):
- Clean git state with separate working trees.
- Parallel worker execution in isolated filesystem roots.
- Automated branch cleanup upon candidate rejection.

### 7. Outer Behavior Tree + Inner Deep FSM Controller

The harness employs a dual-control architecture:
- **Outer Behavior Tree (BT)**: Manages global strategy, high-level fallbacks, timeouts, retries, and clean-up using `Sequence`, `Selector`, `Parallel`, and decorator nodes (`Tracer`, `Retry`, `Timeout`).
- **Inner Deep FSM (`DeepController`)**: Orchestrates precision transitions between `Diagnose`, `Falsify`, `Implement`, `Verify`, and `Review`.

When a candidate fails, the **Backtrack Router** classifies the failure into one of 5 structured classes:
1. `IMPLEMENTATION_ERROR` $\rightarrow$ Jump directly to `Implement`
2. `FALSIFICATION_GAP` $\rightarrow$ Jump to `Falsify`
3. `ROOT_CAUSE_ERROR` $\rightarrow$ Jump to `Diagnose`
4. `EXTERNAL_SPEC` $\rightarrow$ Jump to `Research`
5. `REPO_MODEL_ERROR` $\rightarrow$ Jump to `Inspect`

### 8. Multi-Tier Verification & Metamorphic / Invariant Oracles

The harness never trusts the LLM's own declaration that code works. Verification is performed mechanically:
- **Baseline-Relative Hard Gate & Identity Delta**: Computes hash-based set differences of compiler/linter diagnostics ($\text{Cand} \setminus \text{Base} = \emptyset$) to prevent accidental regression masking.
- **Oracle Integrity Gate**: Detects and rejects unauthorized modifications to test suites or verification fixtures.
- **Tier 3 Metamorphic / Invariant Oracles**: Evaluates algebraic properties independent of static test cases:
  - Idempotence: $f(f(x)) = f(x)$
  - Round-trip serialization: $\text{decode}(\text{encode}(x)) = x$
  - State commutativity and invariant bounds.

### 9. Clean-Room Reviewer

Approved candidates are submitted to an independent, blind **Clean-Room Reviewer**:
- Spawned in an isolated thread with **no prior implementation context** (preventing sunk-cost rationalization).
- Sandboxed in `read-only` mode with disabled network access.
- Given only the PR diff, the original goal, and the verification metrics.
- Evaluates the change from the perspective of an adversarial principal engineer.

### 10. Structured Evidence Store & Lossless Context Compactor

Extended self-healing loops suffer from context pollution. `my_harness` separates volatile scratchpads from permanent facts:
- **4-Layer Structured Evidence Store**: Immutable records divided into `Observation`, `Assertion`, `Inference`, and `Decision`.
- **Context Compactor**: Upon backtrack or phase transitions, transient chat logs and massive stack traces are purged. Only negative constraints, violated invariants, and distilled lessons are preserved into prompt projections.

### 11. GitHub Broker & Verified Commit SHA Invariant

Security and branch integrity are strictly maintained:
- **Least-Privilege GitHub App**: No raw personal access tokens (PAT) or `GITHUB_TOKEN` credentials are exposed to the LLM. All operations flow through a strictly typed `GitHubBroker`.
- **Verified Commit SHA Invariant**: Commits staged on `origin/main` are cryptographically verified through full local integration test suites. Only the exact commit SHA that passed all tests is pushed to GitHub:

$$
\text{SHA}_{\text{verified}} \equiv \text{SHA}_{\text{PR}}
$$

### 12. Durable SQLite FTS5 Memory & Promotion Ladder

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

### 13. Calibrated DPO Trajectory Exporter

Execution trajectories are automatically recorded and exported in Direct Preference Optimization (DPO) compatible JSONL datasets (`.agent/trajectories/`). Winning solutions form `chosen` entries while rejected candidates form `rejected` entries, annotated with empirical confidence weights based on reviewer orthogonality and invariant verification depth.

---

## Getting Started

### Prerequisites

- **Node.js**: `v20.0.0` or higher
- **Package Manager**: `pnpm` (recommended, `v10.5.2`+) or `npm`
- **Git**: Installed and configured on your path
- **OpenAI API Key**: With access to modern reasoning models (e.g. `gpt-4o`, `codex`)

### Installation

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
# LLM / OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o

# Optional: GitHub App Integration for automated PR publication
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=./secrets/github-app.private-key.pem
GITHUB_APP_INSTALLATION_ID=
GITHUB_TARGET_OWNER=
GITHUB_TARGET_REPO=

# Execution Configuration
MAX_PARALLEL_EXPERIMENTS=3
EXPERIMENT_TIMEOUT_MS=600000
WORKTREES_DIR=./worktrees
HARNESS_TEST_COMMAND="npm test"
```

### Usage

Run the harness against a specific engineering objective:

```bash
# Execute via tsx
npx tsx src/main.ts "Migrate storage layer to SQLite and eliminate duplicate state"

# Or after building
node dist/main.js "Refactor caching module to support TTL and cache stampsede prevention"
```

During execution, `my_harness` will:
1. Inspect the repository AST, topology, and invariant contracts.
2. Formulate diagnostic hypotheses across multiple intervention levels.
3. Subject hypotheses to counter-argument falsification.
4. Spawn isolated Git worktrees and implement surviving candidates.
5. Execute compiler, test suite, and invariant oracles against all candidates.
6. Submit the winning candidate to clean-room review.
7. Integrate the verified commit into the workspace or publish an authenticated GitHub Pull Request.

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

To prevent run-away exploration costs, `my_harness` enforces a multi-dimensional budget governor:

```typescript
const harness = new HarnessStateMachine({
  goal: "Refactor core event loop",
  budgetLimits: {
    maxIterations: 5,           // Maximum FSM loop iterations
    maxCandidates: 8,           // Maximum candidate implementations
    maxTestRuns: 20,            // Maximum automated test runs
    maxBacktracks: 4,           // Maximum phase backtracks
    wallClockTimeoutMs: 1800000 // 30 minutes wall-clock timeout
  }
});
```

---

## Repository Structure

```text
my_harness/
├── AGENTS.md                  # Engineering principles & negative constraints
├── .env.example               # Environment variables template
├── prompts/                   # Specialized system prompts for each agent role
│   ├── architect.md           # Divergent hypothesis generator
│   ├── falsifier.md           # Adversarial counter-argument reviewer
│   ├── implementer.md         # Worktree implementation worker
│   ├── researcher.md          # External specification & literature investigator
│   └── reviewer.md            # Clean-room blind peer reviewer
├── src/
│   ├── main.ts                # CLI entry point
│   ├── bt/                    # Behavior Tree engine (Composites, Decorators, Nodes)
│   ├── orchestrator/          # Hybrid Orchestration (BT, Deep FSM, Evidence Store, Compactor)
│   │   ├── tree.ts            # Behavior tree structure definition
│   │   ├── deep-controller.ts # Inner FSM controller for deep exploration
│   │   ├── backtrack-router.ts# Structured 5-class failure routing
│   │   ├── evidence-store.ts  # 4-layer immutable structured evidence store
│   │   └── compactor.ts       # Context distillation and state compactor
│   ├── phases/                # Autonomous execution phases
│   │   ├── inspect-repo.ts    # Codebase topology, AST & invariant inspection
│   │   ├── triage.ts          # Fast vs Deep execution path router
│   │   ├── architect.ts       # Intervention Ladder hypothesis generator
│   │   ├── diversity-gate.ts  # Orthogonal candidate filter
│   │   ├── falsify.ts         # Adversarial counter-argument scrutiny
│   │   ├── implement.ts       # Worktree-isolated code synthesis
│   │   └── review.ts          # Blind clean-room reviewer
│   ├── evaluator/             # Verification engines & oracles
│   │   ├── runner.ts          # Machine test & benchmark runner
│   │   ├── integrity.ts       # Test & fixture anti-tampering gate
│   │   ├── oracle.ts          # Tier 3 metamorphic / invariant oracles
│   │   └── pareto.ts          # Multi-objective Pareto / lexicographic sorter
│   ├── git/                   # Git worktree & branch manager
│   ├── github/                # Authenticated GitHub App broker & policy engine
│   ├── journal/               # Execution journal & crash-recovery reconciliation
│   ├── memory/                # SQLite FTS5 durable memory & verification ladder
│   ├── skills/                # Reusable procedural skill crystallization (SKILL.md)
│   ├── budget/                # Multi-dimensional budget tracker
│   └── trajectory/            # DPO preference dataset exporter
└── tests/                     # Vitest comprehensive test suites (83 tests)
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
- Pareto frontier calculation and anti-minimal-diff objective scoring.
- Metamorphic invariant validation and test integrity verification.

---

## License

This project is licensed under the **Apache-2.0 License**. See [LICENSE](LICENSE) for details.
