できます。狙っているものは、単なる「Codex SDK ラッパー」ではなく、**Codexを探索アルゴリズムの実行器として扱う開発エージェント・ハーネス**に近いです。

2026年9月時点では、Codex SDK は同一threadの継続、structured output、streaming、working directory、sandbox、approval policy、reasoning effort、web searchなどを制御できます。またCodex側にはmulti-agentとhooksもあるため、この用途にはかなり適しています。([GitHub][1])

私なら以下の構成にします。

```text
                    User Goal
                       │
                       ▼
              ┌─────────────────┐
              │ Meta Supervisor │   ← Codex SDKではなく
              │   TypeScript    │      自作の決定論的FSM
              └────────┬────────┘
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   Investigator     Architect       Researcher
   Codex thread     Codex agents    Codex/Web
        │              │               │
        └──────────────┼───────────────┘
                       ▼
                Hypothesis Pool
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   local fix      subsystem       redesign
   worktree A     worktree B      worktree C
       │               │               │
       └───────────────┼───────────────┘
                       ▼
              Tests / Benchmark /
              Static analysis / CI
                       │
                       ▼
               Evidence Judge
                       │
              ┌────────┴─────────┐
              ▼                  ▼
           reject            integrate
                                  │
                                  ▼
                       GitHub Broker
                branch / commit / PR / CI
                                  │
                                  ▼
                         Clean-room Review
                                  │
                                  ▼
                             merge
```

## 1. 「最小変更」を目的関数から消す

まず最重要なのがこれです。

Codexに、

> 必要なら大きく変更してよい

と書くだけでは足りません。

むしろハーネス側で、

```text
変更量 = 最適化対象ではない
```

とします。

候補の評価を例えば、

$$
S =
w_c C +
w_p P +
w_m M +
w_a A +
w_t T
-
w_r R
-
w_g G
$$

とします。

* `C`: correctness
* `P`: performance
* `M`: maintainability
* `A`: architectural consistency
* `T`: test evidence
* `R`: regression risk
* `G`: migration cost

ここには**diff行数そのものを入れません**。

3000行変更でも設計として正しければ採用し、3行変更でも根本原因を隠すだけなら却下します。

ただし変更量は `R` や `G` を通じて間接的にコストになります。

これによって、

```text
最小diff
↓
最も安全

```

というCodexが陥りやすいヒューリスティックを崩せます。

---

## 2. Codexに「現在のコードは仕様ではない」と明示する

`AGENTS.md` は巨大化させない方がいいです。最近のOpenAIのCodex向けガイダンスでも、強いモデルに過剰な恒常指示を与えると逆に制約しすぎることが指摘されています。([OpenAI Developers][2])

AGENTS.mdには原則だけ置きます。

```md
# Engineering principles

The existing implementation is evidence about the system, not a design constraint.

Optimize for:
1. correctness
2. simplicity of the resulting system
3. architectural coherence
4. performance
5. maintainability

Do NOT optimize for minimizing the size of the diff.

Backward compatibility is required only when it is an explicit project requirement.

When a symptom suggests a deeper design problem, investigate the underlying
assumption rather than layering another workaround on top.

Do not refactor merely for aesthetics. Architectural changes must have
evidence, a falsifiable rationale, and validation.

Before committing to an implementation, consider:
- a local fix
- a subsystem-level solution
- a different architectural approach

You do not need to choose the largest change. Choose the approach best
supported by evidence.
```

残りはphaseごとのpromptにします。

---

# 3. 一番重要な仕組み：Intervention Ladder

Codexに最初からリファクタさせるのではなく、

```text
L0 investigation only
L1 local implementation
L2 module redesign
L3 subsystem redesign
L4 architecture replacement
L5 fundamental/research-oriented redesign
```

という介入レベルを持たせます。

Architectフェーズで、

```json
{
  "rootCause": "...",
  "violatedInvariant": "...",
  "currentArchitectureAssumption": "...",
  "candidates": [
    {
      "level": 1,
      "hypothesis": "...",
      "experiment": "..."
    },
    {
      "level": 3,
      "hypothesis": "...",
      "experiment": "..."
    },
    {
      "level": 4,
      "hypothesis": "...",
      "experiment": "..."
    }
  ]
}
```

をstructured outputで返させます。

Codex SDKはJSON Schemaによるstructured outputを直接扱えます。([GitHub][1])

これがかなり効きます。

---

# 4. 「アーキテクチャを疑う」自動昇格条件を作る

プロンプト任せにせずハーネスにルールを入れます。

例えば以下のどれかが成立したらL2以上を必ず探索します。

```text
同種の特殊ケースが3箇所以上
        ↓
設計境界がおかしい可能性

同じbugを過去に2回以上fix
        ↓
局所修正禁止

複数moduleが同じstateを所有
        ↓
source-of-truth設計を再検討

feature追加のたびに既存if/switchが増える
        ↓
abstractionを再検討

performance targetを局所最適化で満たせない
        ↓
data flow / algorithm / architectureを再検討

API変換コードが何層にも存在
        ↓
module boundaryを再検討
```

さらに強力なのが、

### Counterfactual Architecture Check

Architectに必ず一度、

> このrepositoryが今日存在せず、同じ要求だけ渡された場合、あなたなら同じarchitectureを選ぶか？

と問いかけます。

`No`の場合、

```text
現在設計を維持する理由
vs
理想設計へ移行するコスト
```

を比較します。

これで「既存コードを所与として考える」アンカリングをかなり弱められます。

---

# 5. 「ひらめき」を実装可能な探索に変える

ここは単純なbrainstorm agentを置くより、

## Divergent → Falsification

にします。

例えばArchitectを3〜5個spawnします。

```text
Architect A
既存設計を最大限活かして解決

Architect B
境界・責務・データフローから再考

Architect C
アルゴリズムそのものから再考

Architect D
「現在のコードを見なかった」と仮定して設計

Architect E
他分野の類似問題・OSS・論文から解決
```

そのあと別のCodexを、

```text
Falsifier
```

として、

```text
各案が間違っていることを証明しようとせよ。
反例・性能劣化・race・複雑性・隠れた前提を探せ。
```

とします。

つまり、

```text
idea
 ↓
criticism
 ↓
experiment
 ↓
evidence
```

まで要求します。

これで「それっぽいアイデア」ではなく、かなり研究に近い探索になります。

Codexには現在native multi-agent機能もあり、`spawn_agent` 等の連携機能が安定版として提供されています。([developers.openai.com][3])

---

# 6. ただし候補実装はSDK側でworktree分離する

ここはCodex任せにしない方がいいです。

例えば3案なら、

```text
main
│
├─ worktrees/run-42-local
│    agent/run-42/local
│
├─ worktrees/run-42-subsystem
│    agent/run-42/subsystem
│
└─ worktrees/run-42-redesign
     agent/run-42/redesign
```

とします。

各worktreeごとに別Codex thread。

```ts
function createWorker(directory: string) {
  return codex.startThread({
    workingDirectory: directory,

    sandboxMode: "workspace-write",

    approvalPolicy: "never",

    modelReasoningEffort: "xhigh",

    networkAccessEnabled: true,
    webSearchMode: "live",
  });
}
```

Codex SDKはworking directoryをthread単位で指定できます。([github.com][1])

これが非常に重要です。

同一working treeで複数案を検討させると、

```text
案Aの残骸
   +
案B
   +
案C
```

になりやすい。

worktreeなら本当に並列探索できます。

OpenAI自身も長時間CodexタスクではGit worktree、durable project memory、milestoneごとの検証を重要なパターンとして挙げています。([OpenAI Developers][4])

---

# 7. Harness本体はFSMにする

LLMに、

> 次は何をする？

まで完全委任しないのがポイントです。

```ts
enum Phase {
  Inspect,
  Diagnose,
  Diverge,
  Experiment,
  Implement,
  Verify,
  Compare,
  Integrate,
  Review,
  Publish,
  Learn,
}
```

そして、

```ts
while (!state.finished) {
  switch (state.phase) {
    case Phase.Inspect:
      state.repo = await inspectRepo();
      break;

    case Phase.Diagnose:
      state.diagnosis = await diagnose(state);
      break;

    case Phase.Diverge:
      state.candidates = await generateCandidates(state);
      break;

    case Phase.Experiment:
      state.candidates =
        await runExperiments(state.candidates);
      break;

    case Phase.Implement:
      state.implementations =
        await implementInWorktrees(state.candidates);
      break;

    case Phase.Verify:
      state.results =
        await verifyAll(state.implementations);
      break;

    case Phase.Compare:
      state.selection =
        await compareWithEvidence(state.results);
      break;

    case Phase.Integrate:
      await integrate(state.selection);
      break;

    case Phase.Review:
      state.review = await cleanRoomReview();
      break;

    case Phase.Publish:
      await publishToGithub(state);
      break;
  }

  await persist(state);
}
```

ここは普通のコードです。

Codexには、

```text
判断・探索・実装
```

をさせ、

ハーネスには、

```text
状態管理
権限制御
Git管理
評価
再試行
```

をさせます。

---

# 8. GitHubはCodexにtokenを直接渡さない

ここも設計上かなり重要です。

こうしない方がいいです。

```text
Codex sandbox
   │
   └── GITHUB_TOKEN
         ↓
       gh CLI
```

代わりに、

```text
Codex
  ↓
typed request
  ↓
GitHub Broker
  ↓
GitHub App
  ↓
GitHub API
```

とします。

例えばBrokerが公開する操作は、

```ts
createBranch()
pushBranch()
createPullRequest()
updatePullRequest()
readChecks()
readWorkflowRun()
requestReview()
enableAutoMerge()
createIssue()
commentIssue()
```

程度。

token自体には触らせません。

OpenAIのCodexプラットフォーム設計も、ホストアプリケーション側がツールや承認境界を管理する構造を前提にしています。([OpenAI Developers][5])

---

# 9. GitHub Appを使う

PATよりGitHub App installation tokenの方がこの用途には向いています。

基本的には、

```text
Contents          read/write
Pull requests     read/write
Issues            read/write
Checks            read
Actions           read
```

程度。

Codexが`.github/workflows/**`自体も改善できるようにするなら、

```text
Workflows         write
```

を追加します。

GitHub公式でも、HTTP Git操作にはContents権限、Actions workflowファイルを編集する場合にはWorkflows repository permissionが必要とされています。([GitHub Docs][6])

---

# 10. workflow自体もCodexの改善対象にする

ここはあなたの要件とかなり相性がいいです。

普通のcoding agentは、

```text
CIが落ちた
↓
コードを変更
```

だけやります。

このハーネスなら、

```text
CIが落ちた
 ↓
原因分類

code defect?
test defect?
toolchain?
workflow?
cache?
dependency?
architecture?
```

まで行います。

したがって場合によってはCodex自身が、

```text
.github/workflows/ci.yml
```

を書き換えます。

ただし、

```text
workflow変更
  ↓
専用branch
  ↓
PR
  ↓
workflow syntax validation
  ↓
branch protection
```

に必ず通す。

workflowを直接mainへpushさせない方がいいです。

Codex用の公式GitHub Actionも存在し、GitHub Actions内から権限を絞ったCodex実行ができます。([GitHub][7])

---

# 11. Git branchingもモデルに「提案」させ、Policy Engineが実行する

例えばCodexから、

```json
{
  "gitStrategy": {
    "type": "split-pr",
    "branches": [
      {
        "name": "agent/42/refactor-core",
        "purpose": "core architecture migration"
      },
      {
        "name": "agent/42/adapt-callers",
        "dependsOn": "agent/42/refactor-core"
      }
    ]
  }
}
```

を出させる。

Policy Engineで、

```text
mainへのdirect push           reject
force push main               reject
delete default branch         reject

agent/*作成                   allow
commit                         allow
push agent/*                  allow
PR作成                         allow
PR更新                         allow
CI再実行                       allow

workflow変更                   allow through PR
dependency major update        PR required
secret変更                     reject
branch protection変更          reject
```

とします。

つまり、

**Git戦略そのものはCodexが考えるが、GitHubの不変条件はCodexには変更できない**

構造です。

---

# 12. 「実装できた」をCodex自身に判定させない

これも重要です。

例えばHarnessが、

```text
npm test
npm run lint
npm run typecheck
npm run build

benchmark
integration tests
property tests
mutation tests
```

などを直接実行。

Codexの、

> 実装は問題なく動作しています

という文章は採点対象にしません。

採点対象は、

```json
{
  "tests": {
    "passed": 327,
    "failed": 0
  },
  "benchmark": {
    "before": 42.1,
    "after": 17.6
  },
  "complexity": {},
  "regressions": []
}
```

です。

---

# 13. Clean-room reviewerを置く

実装したthread自身にレビューさせない方がいいです。

新しいthreadを作り、

```text
You did not implement this change.

Review the resulting diff as if it came from an unknown engineer.

Try to find:
- incorrect assumptions
- accidental compatibility breaks
- hidden state duplication
- race conditions
- architecture regressions
- unnecessary complexity
- cases where the patch hides rather than fixes the root cause
```

とします。

さらに、

```text
implementation contextを渡さない
```

のも有効です。

PR diff、仕様、テスト結果だけを渡す。

かなり違う問題を発見します。

---

# 14. 「ひらめき探索」専用phaseを入れる

これはかなり面白い部分です。

通常の、

```text
Diagnose → Implement
```

の間に、

```text
Discovery
```

を入れます。

例えば、

```text
Spend one reasoning pass looking for a qualitatively different solution.

You may challenge:
- the algorithm
- data representation
- concurrency model
- control flow
- persistence model
- protocol
- architecture
- build system

Look for solutions that would not naturally emerge from incrementally
editing the current implementation.

Every idea must have a cheap experiment capable of disproving it.
```

とする。

ただし採用条件は、

```text
novelty
```

ではありません。

```text
novelty
 +
evidence
```

です。

これで「ひらめいたから全面書き換え」が防げます。

---

# 15. Repo内にdurable memoryを持たせる

OpenAIの長時間Codex実験でも、この部分がかなり重要だったとされています。spec、plan、decision、statusをファイルとして残し、検証をmilestoneごとに実施することで長時間タスクのcoherenceを保っています。([OpenAI Developers][4])

私はこうします。

```text
.agent/
├── PROJECT.md
├── ARCHITECTURE.md
├── CONSTRAINTS.md
│
├── decisions/
│   ├── ADR-0001.md
│   └── ADR-0002.md
│
└── runs/
    └── 2026-09-24-0042/
        ├── objective.json
        ├── diagnosis.json
        ├── hypotheses.json
        ├── experiments.json
        ├── results.json
        └── final.json
```

特に、

```text
なぜそのarchitectureになったのか
```

を残すのが大事です。

次のCodexがコードだけ見て、

> これは変な実装なので綺麗にしよう

と過去の意図を壊すのを防げます。

---

# 16. Hooksも使う

現在のCodexには、

* `SessionStart`
* `PreToolUse`
* `PostToolUse`
* `PermissionRequest`
* `PreCompact`
* `PostCompact`
* `SubagentStart`
* `SubagentStop`
* `Stop`

などのhookがあります。([developers.openai.com][3])

例えば、

```text
PreToolUse
  git push main
       ↓
      reject
```

や、

```text
PostToolUse
  cargo test
       ↓
 result DBへ保存
```

や、

```text
Stop
 ↓
未実行のrequired testsが存在
 ↓
stopを拒否してvalidationへ戻す
```

という使い方ができます。

これはハーネスをかなり堅牢にします。

---

# 17. 推奨ディレクトリ構成

実装するなら、このくらいにします。

```text
autonomous-codex/
├── src/
│   ├── main.ts
│   │
│   ├── orchestrator/
│   │   ├── state-machine.ts
│   │   ├── state.ts
│   │   └── scheduler.ts
│   │
│   ├── codex/
│   │   ├── client.ts
│   │   ├── thread.ts
│   │   └── events.ts
│   │
│   ├── phases/
│   │   ├── inspect.ts
│   │   ├── diagnose.ts
│   │   ├── architect.ts
│   │   ├── discover.ts
│   │   ├── falsify.ts
│   │   ├── experiment.ts
│   │   ├── implement.ts
│   │   ├── verify.ts
│   │   ├── compare.ts
│   │   └── review.ts
│   │
│   ├── git/
│   │   ├── worktree.ts
│   │   ├── branch.ts
│   │   └── diff.ts
│   │
│   ├── github/
│   │   ├── app.ts
│   │   ├── broker.ts
│   │   ├── pull-request.ts
│   │   └── workflow.ts
│   │
│   ├── policy/
│   │   ├── git-policy.ts
│   │   ├── file-policy.ts
│   │   └── risk.ts
│   │
│   ├── evaluator/
│   │   ├── tests.ts
│   │   ├── benchmark.ts
│   │   └── score.ts
│   │
│   └── schemas/
│       ├── diagnosis.ts
│       ├── candidate.ts
│       └── result.ts
│
├── prompts/
│   ├── architect.md
│   ├── falsifier.md
│   ├── researcher.md
│   ├── implementer.md
│   └── reviewer.md
│
└── AGENTS.md
```

---

# 18. 中核コードは意外と小さくできる

概念的には、

```ts
const diagnosis = await diagnose(repo);

const ideas = await Promise.all([
  architect(diagnosis, "incremental"),
  architect(diagnosis, "subsystem"),
  architect(diagnosis, "first-principles"),
]);

const challenged = await falsify(ideas);

const candidates = challenged
  .filter(x => x.worthExperimenting);

const experiments =
  await experimentInParallel(candidates);

const survivors =
  selectPromisingCandidates(experiments);

const implementations = await Promise.all(
  survivors.map(candidate =>
    implementInIsolatedWorktree(candidate)
  )
);

const verified =
  await verifyIndependently(implementations);

const winner =
  await evidenceBasedSelection(verified);

await integrate(winner);

const review =
  await cleanRoomReview(winner);

if (!review.blockingIssues.length) {
  await github.publishPullRequest(winner);
} else {
  await repair(review);
}
```

本質はこれです。

---

# 19. さらに一段強くするなら「Architecture Debt Detector」

通常タスクとは別に、

```text
今回の要求を実装する際、
要求そのものとは無関係だが
将来的な開発速度を著しく落としている構造を発見したか？
```

を記録します。

例えば、

```json
{
  "architecturalSignals": [
    {
      "location": "src/control/...",
      "issue": "duplicate ownership of state",
      "severity": 0.83,
      "evidence": ["...", "..."],
      "recommendedExperiment": "..."
    }
  ]
}
```

一定値を超えたら別branchを作り、

```text
agent/architecture/<topic>
```

で自主的に実験。

ただし元タスクのPRとは分離します。

これで、

> 今の依頼だけを終わらせて次へ

というagentから、

> コードベースそのものを継続的に改善するagent

になります。

---

# 20. キリのいい段階でのコンテキスト圧縮（Context Compaction & Distillation）

長時間探索や複数回のリトライ（Self-Healing Loop）を行うと、コンテキスト（対話履歴や共有ステート）が肥大化し、**注意の希釈（Attention Dilution）** や **過去の失敗したコードへの引きずられ（Anchoring）** が発生します。

本ハーネスでは `ContextCompactor` により、**「キリのいい段階」** で決定論的にコンテキストを圧縮・蒸留します。

```text
       [Clean-Room Review Reject / Test Fail]
                         │
                         ▼
        ┌─────────────────────────────────┐
        │       ContextCompactor          │
        │   - 失敗したWorktree/実装をパージ   │
        │   - 不変条件違反・教訓のみを蒸留    │
        │   - SQLite FTS5へ永続化退避     │
        └────────────────┬────────────────┘
                         │
                         ▼ (Distilled High-Signal Context)
                [Diagnose (Retry)]
```

### 1. 圧縮のトリガーポイント
1. **自己修復リトライのバックトラック時（Backtrack Boundary）**:
   Reviewリジェクトやテスト全滅で再試行する際、過去の全コード差分やスタックトレースを破棄し、「何がダメだったのか（制約・不変条件）」だけを抽出してリセット。
2. **フェーズ遷移境界（Phase Boundary）**:
   ResearchやReviewのチャット詳細ログを捨て、スキーマ化された要約アーティファクトのみを次のフェーズへ引き継ぐ（Ephemeral Worker Pattern）。

### 2. 残すもの vs 捨てるもの
* **残すもの（State / Invariants）**: ゴール、破られた不変条件（Negative Constraints）、確定したADR/スキル、客観的テスト数値。
* **捨てるもの（Transient Noise）**: 試行錯誤の途中チャットログ、スタックトレース全文、却下された候補の中間コード。

---

## 最終的に目指すべきループ（実装完了）

本リポジトリでは、エキスパートレビューと実証検証に基づき、単なる「最小変更に逃げるスクリプト」を排し、仮説探索・反証・機械的検証・ブラインド査読を行う**自律型ソフトウェア工学ハーネス（Autonomous Software Engineering Harness）**を完全実装しました。

```text
Goal
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
Research Router ───────────────→ Research (network=true, webSearch=live)
  │                                    │
  └────────────────────────────────────┘
  │
  ▼
Diagnose (Intervention Ladder L0〜L7 & Structured Evidence Output)
  ├── L1 local patch
  ├── L4 state / data model
  └── L6 architectural redesign
  │
  ▼
Falsification (Counter-argument Scrutiny)
  │
  ▼
Hypothesis Diversity Gate (Enforces Non-homogeneous Exploration Radii)
  │
  ▼
Parallel Worktrees (Isolated Git Worktrees A / B / C)
  │
  ▼
Machine Verification (Process Exit Code, JUnit, Regressions, Complexity)
  │
  ▼
Hard Gates (Zero tolerance for test failures or regressions)
  │
  ▼
Pareto / Lexicographic Comparison (Multi-objective soft metrics vs Candidate 0 Baseline)
  │
  ▼
Candidate Queue [C1, C2, ..., Cn]
  │
  ▼
Clean-Room Blind Review (Anonymous Candidate X / Strict Offline Audit)
  ├── REJECT → Next candidate in queue available?
  │             ├── YES → Review next candidate immediately (No backtracking!)
  │             └── NO  → All candidates exhausted
  │                         │
  │                         ▼
  │                   Backtrack Router (Intelligent Multi-Tier Recovery)
  │                   ├── Syntax/Typo        → Implement
  │                   ├── Counterexample     → Falsify
  │                   ├── Architectural Flaw → Diagnose
  │                   ├── API Spec Mismatch  → Research
  │                   └── Invariant Error    → Inspect
  │
  └── APPROVED
        │
        ▼
Integration Verification (Merge branch to active workspace)
  │
  ▼
Publish (GitHub Broker Pull Request)
  │
  ▼
Verified Learning & Context Compaction
  ├── Record ADR (Architecture Decision Record)
  ├── Crystallize Reusable Procedural Skills
  ├── Persist Verified Memory (Empirical facts only; no LLM thoughts)
  └── Export Preference Trajectories (DPO-compatible)
```

### 実装済みのコア機構
1. **Candidate Queue**: 1位候補がリジェクトされた場合でも全体を破棄せず、同一イテレーション内で次順位の候補を自動査読。無駄な再探索コストを激減。
2. **Hard Gates & Pareto / Lexicographic 比較**: 単一スカラー評価によるGoodhartの法則崩壊を排除。客観的テスト・リグレッションゼロを必須足切りとし、Intervention Level $\rightarrow$ 性能改善 $\rightarrow$ 差分簡潔性の辞書式順序で評価。Candidate 0（mainブランチ）を常時参戦させて変更不要時の撤退判断を保証。
3. **Clean-Room Review の完全匿名化**: Candidate ID や事前スコアを剥奪した「Anonymous Candidate X」としてブラインド査読。オフラインサンドボックス（network=false）を強制。
4. **Research Router**: 性能限界、並行性、未知のアルゴリズム、アーキテクチャ再設計などの高不確実性シグナルがある場合のみWeb調査を発動。
5. **Intervention Ladder L0〜L7 & Hypothesis Diversity Gate**: 設定から要求前提まで8段階の階層を持ち、並列候補が局所修正ばかりに偏る擬似多様性を機械的に排除。
6. **Backtrack Router**: 失敗モードに応じた階層的ロールバック（Implement/Falsify/Diagnose/Research/Inspect）。
7. **探索 Budget Tracker**: イテレーション数、候補数、テスト回数、実行時間を第一級状態として監視。予算超過時は安全に `UNRESOLVED` 終了。
8. **Verified Memory & Anti-Anchoring Inspect**: リポジトリ構造から Problem Signature を先行生成して先入観による誤認（Memory Anchoring）を防止し、確定事実のみを SQLite FTS5 に永続化。

[1]: https://github.com/openai/codex/blob/main/sdk/typescript/README.md?utm_source=chatgpt.com "codex/sdk/typescript/README.md at main · openai/codex · GitHub"
[2]: https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra?utm_source=chatgpt.com "Rethinking skills and prompts for GPT-6 Astra | OpenAI Developers"
[3]: https://developers.openai.com/ja-JP/docs/config-file/config-reference?utm_source=chatgpt.com "構成リファレンス | ChatGPT Learn"
[4]: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex?utm_source=chatgpt.com "Run long horizon tasks with Codex | OpenAI Developers"
[5]: https://developers.openai.com/ja-JP/blog/codex-as-a-platform?utm_source=chatgpt.com "プラットフォームとしての Codex：オープンなエージェントハーネスを使った開発 | OpenAI Developers"
[6]: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app?utm_source=chatgpt.com "Choosing permissions for a GitHub App - GitHub Docs"
[7]: https://github.com/openai/codex-action?utm_source=chatgpt.com "GitHub - openai/codex-action · GitHub"
