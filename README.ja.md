# 自律型エージェント・ハーネス (`my_harness`)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-83%20passed-brightgreen.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

[**English**](README.md) | **日本語**

---

`my_harness` は、TypeScript と OpenAI / Codex SDK を基盤に構築された、  **証拠駆動型の自律ソフトウェア工学エージェント・ハーネス（Autonomous Software Engineering Harness）** です。

LLMを単なる「diffを生成するパッチ作成器」として扱うのではなく、決定論的な統制アーキテクチャの制御下で稼働する **「仮説探索・反証アルゴリズムの実行エンジン」** として位置付けています。

多層的な介入ラダー（Intervention Ladder）、反事実的設計検証（Counterfactual Architecture Check）、独立したGit Worktreeによる並列探索、メタモルフィック不変条件テスト、そして先入観を排除したブラインド査読（Clean-Room Review）により、既存のコーディングエージェントが陥りがちな **「最小変更の罠（Minimal-Diff Trap: 目先のテストを通すために場当たり的なパッチに逃げる問題）」** を根本から排除します。

---

## 目次

- [背景と課題：最小変更の罠（Minimal-Diff Trap）](#背景と課題最小変更の罠minimal-diff-trap)
- [核となる設計原則（Engineering Principles）](#核となる設計原則engineering-principles)
- [全体アーキテクチャ](#全体アーキテクチャ)
- [実装済みのコア機構](#実装済みのコア機構)
  - [1. 「最小変更」を目的関数から排除した評価機構](#1-最小変更を目的関数から排除した評価機構)
  - [2. 介入ラダー（Intervention Ladder: L0〜L6）](#2-介入ラダーintervention-ladder-l0l6)
  - [3. 反事実的アーキテクチャ検査（Counterfactual Check）](#3-反事実的アーキテクチャ検査counterfactual-check)
  - [4. 発散的多様性生成とダイバーシティ・ゲート](#4-発散的多様性生成とダイバーシティゲート)
  - [5. 安価な反証優先スケジューリング（Cheap-Falsification-First MAB）](#5-安価な反証優先スケジューリングcheap-falsification-first-mab)
  - [6. 独立 Git Worktree による並列探索](#6-独立-git-worktree-による並列探索)
  - [7. 外側Behavior Tree ＋ 内側Deep FSM コントローラー](#7-外側behavior-tree--内側deep-fsm-コントローラー)
  - [8. 多層機械検証と不変条件オラクル（Metamorphic Oracle）](#8-多層機械検証と不変条件オラクルmetamorphic-oracle)
  - [9. ブラインド・クリーンルーム査読（Clean-Room Reviewer）](#9-ブラインドクリーンルーム査読clean-room-reviewer)
  - [10. 4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮](#10-4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮)
  - [11. GitHub Broker と検証済みコミットSHA不変条件](#11-github-broker-と検証済みコミットsha不変条件)
  - [12. SQLite FTS5 耐久メモリと昇格ラダー](#12-sqlite-fts5-耐久メモリと昇格ラダー)
  - [13. キャリブレーション付き DPO 選好軌跡エクスポート](#13-キャリブレーション付き-dpo-選好軌跡エクスポート)
- [クイックスタート](#クイックスタート)
  - [前提要件](#前提要件)
  - [インストール](#インストール)
  - [環境変数の設定](#環境変数の設定)
  - [実行方法](#実行方法)
- [詳細設定](#詳細設定)
  - [GitHub App の連携設定](#github-app-の連携設定)
  - [多次元バジェット・ガバナー](#多次元バジェットガバナー)
- [ディレクトリ構成](#ディレクトリ構成)
- [テストと品質検証](#テストと品質検証)
- [ライセンス](#ライセンス)

---

## 背景と課題：最小変更の罠（Minimal-Diff Trap）

従来のコーディングエージェントは、目先のテストケースをパスするために「最も変更行数が少ないパッチ」を生成しようと最適化しがちです：

```text
バグ/課題の発生 ──▶ LLMが3行の対症療法パッチを提案 ──▶ テスト通過 ──▶ 技術的負債の不可逆な蓄積
```

このヒューリスティックは、ソフトウェア工学上深刻な問題を引き起こします：
1. **根本原因の隠蔽（Symptom Hiding）**: 破綻した設計前提を根本治療せず、`try-catch` で握りつぶしたり場当たり的な `if` 分岐を増設する。
2. **コンテキスト・アンカリング**: 既存コードの欠陥や歪みを「変えてはならない仕様」と錯覚して受け入れてしまう。
3. **自己採点バイアス（Echo Chamber）**: コードを書いた張本人であるLLM自身に「実装完了」を判定させ、客観的な品質基準が失われる。
4. **コンテキスト汚染**: 失敗した試行錯誤の巨大なスタックトレースが対話履歴に蓄積し、モデルの推論能力と注意力が急速に劣化する。

`my_harness` は、この脆弱なアプローチを科学的方法論に基づいた探索サイクルに置き換えます：
 **仮説生成 $\rightarrow$ 敵対的反証 $\rightarrow$ 並列独立実装 $\rightarrow$ 機械的客観検証 $\rightarrow$ ブラインド第三者査読** 。

---

## 核となる設計原則（Engineering Principles）

[AGENTS.md](AGENTS.md) より抜粋：

1. **現在の実装はシステムに関する証拠であり、設計の制約ではない。**
2. **最適化の優先順位**:
   1. 正しさ（Correctness）
   2. 結果として得られるシステムの簡潔性（Simplicity）
   3. アーキテクチャの一貫性（Architectural Coherence）
   4. 性能（Performance）
   5. 保守性（Maintainability）
   *(※「差分の小ささ（Diff行数）」を最適化対象にしてはならない)*
3. **後方互換性は、明示的なプロジェクト要件である場合にのみ必須とする。**
4. **設計変更には、反証可能な根拠、実証データ、および機械的検証を必要とする。**

---

## 全体アーキテクチャ

```text
                             ユーザーのゴール (Goal)
                                       │
                                       ▼
       リポジトリ検査 (AST / トポロジー / Git履歴 / 不変条件の抽出)
                                       │
                                       ▼
           問題シグネチャ生成 (過去の記憶への過度な固執を防止)
                                       │
                                       ▼
           耐久メモリ・スキル検索 (シグネチャ照合 FTS5)
                                       │
                                       ▼
              Fast / Deep トリアージ ─────────────────────────┐
                │ FAST                                         │ DEEP
                ▼                                              ▼
       FastImplement (単一Worktree)              Research Router (Web検索/仕様調査)
                │                                              │
                ▼                                              ▼
         独立機械検証                             Diagnose (介入ラダー L0〜L6)
                │                                              │
                ▼                                              ▼
                │                                 Diversity Gate (直交仮説の保証)
                │                                              │
                ▼                                              ▼
                │                                 Falsification (敵対的反証・批判)
                │                                              │
                ▼                                              ▼
                │                                 並列 Worktree 実装 (A / B / C)
                │                                              │
                ▼                                              ▼
                │                                 Test / Oracle 改ざん検知ゲート
                │                                              │
                ▼                                              ▼
                │                                 機械検証 (終了コード / リグレッション)
                │                                              │
                ▼                                              ▼
                │                                 候補別ハードゲート (ゼロトレランス)
                │                                              │
                ▼                                              ▼
                │                                 パレート / 辞書式ソート (証拠スコア)
                │                                              │
                ▼                                              ▼
                │                                 候補キュー [C1, C2, ..., Cn]
                │                                              │
                ▼                                              ▼
                └───────────────────────────────▶ クリーンルーム査読 (Read-Only)
                                                  │
                                                  ├── REJECT ──▶ 次の候補がキューに存在?
                                                  │               ├── YES ──▶ 次の候補を即座に査読
                                                  │               └── NO  ──▶ 構造化バックトラック・ルーター
                                                  │                             ├── IMPLEMENTATION_ERROR ──▶ 実装へ
                                                  │                             ├── FALSIFICATION_GAP    ──▶ 反証へ
                                                  │                             ├── ROOT_CAUSE_ERROR     ──▶ 診断へ
                                                  │                             ├── EXTERNAL_SPEC        ──▶ 調査へ
                                                  │                             └── REPO_MODEL_ERROR     ──▶ 検査へ
                                                  └── APPROVED
                                                        │
                                                        ▼
                                                フルインテグレーション検証
                                                        │
                                                        ▼
                                                公開 (GitHub Broker Pull Request)
                                                        │
                                                        ▼
                                                経験の結晶化とメモリ昇格
                                                ├── アーキテクチャ決定記録 (ADR) 保存
                                                ├── 再利用可能なプロシージャル・スキルの結晶化
                                                ├── SQLite FTS5 耐久メモリの信頼度昇格
                                                └── DPO 適合選好データセットのエクスポート
```

---

## 実装済みのコア機構

### 1. 「最小変更」を目的関数から排除した評価機構

本ハーネスは、変更差分の行数そのものを評価関数から完全に分離しています。候補の採点は客観的証拠に基づき多次元的に算出されます：

$
S = w_c C + w_p P + w_m M + w_a A + w_t T - w_r R - w_g G
$

- $C$: 正しさ（テスト・形式検証の合格率）
- $P$: 性能（ベンチマークのスループットやレイテンシ向上幅）
- $M$: 保守性およびシステムの簡潔性
- $A$: アーキテクチャの一貫性
- $T$: テスト証拠の網羅密度
- $R$: リグレッション（既存機能破壊）のリスク
- $G$: 移行コスト・過渡的複雑性

ここには「差分行数」が含まれません。根本原因を隠蔽する3行のパッチよりも、アーキテクチャの整合性を高めリグレッションリスクを低減する2,000行のリファクタリングが優位に選定されます。

### 2. 介入ラダー（Intervention Ladder: L0〜L6）

モデルが極端な全面書き換えや浅い局所パッチに安易に逃げるのを防ぐため、探索は多層的な介入レベルに体系化されています：

| レベル | 階層名 | 概要 | 主な適用事例 |
|---|---|---|---|
| **L0** | 調査・原因究明のみ | 再現スクリプト作成、原因分析（コード変更なし） | 診断フェーズ |
| **L1** | 局所的実装 | 単一関数・局所スコープ内での限定的修正 | 独立した局所バグ |
| **L2** | モジュール再設計 | モジュール内のインターフェースや状態所有権の再整理 | カプセル化の破綻 |
| **L3** | サブシステム再設計 | 複数モジュール間の規約調整、パイプラインの再構成 | モジュール間の密結合 |
| **L4** | アーキテクチャ置換 | 状態管理層やランタイム層の抜本的刷新 | 設計不変条件の破綻 |
| **L5** | 研究開発的再設計 | アルゴリズム自体の根本変更、プロトコル刷新 | スケーラビリティの限界 |
| **L6** | 完全アーキテクチャリセット | 同一外部要求のもとでのクリーンシート再設計 | 全面的技術的破綻 |

**自動昇格トリガー:**
- 同種の例外ケースやワークアラウンドが3箇所以上に点在している。
- 過去のGit履歴で同一クラスのバグが2回以上修正されている。
- 複数のモジュールが明確な所有権なしに同一の状態を直接変更している。
- 新機能を追加するたびにコアの条件分岐（`if`/`switch`）が肥大化している。

### 3. 反事実的アーキテクチャ検査（Counterfactual Check）

診断時、モデルに対して以下の反事実的質問を強制します：
> *「もしこのリポジトリが今日存在せず、同じ要求仕様だけを渡された場合、あなたなら現在のアーキテクチャを選びますか？」*

もし答えが「No」であれば、モデルは「現状維持を選ぶ理由」と「理想設計へ移行するコスト」を比較論証しなければならず、現状維持バイアスが中和されます。

### 4. 発散的多様性生成とダイバーシティ・ゲート

互いに視点の異なる複数のアーキテクト・スタンスを並列生成させます：
- **Pragmatist（実務的改良派）**: 現行設計を最大限維持した最短経路での解決
- **Reformer（構造改革派）**: 境界・責務・データフローの見直し
- **Theorist（原理主義派）**: 既存コードを所与とせず、数学・アルゴリズムの第一原理から再設計
- **Analyst（外部アナロジー派）**: 他言語・他エコシステムや学術論文の先行事例を応用

**Diversity Gate** により、生き残った候補同士が構造的に直交していることが保証され、同一アイデアの無駄な並列実装を防止します。

### 5. 安価な反証優先スケジューリング（Cheap-Falsification-First MAB）

高価なコード生成を行う前に、専任の **Falsifier（反証エージェント）** が各仮説に対して反例、競合状態、エッジケース、計算量爆発の観点から猛烈な批判を加えます。

候補の優先順位付けには、費用対情報利得 Multi-Armed Bandit（MAB）を採用しています：

$$
\text{Priority} = \frac{\Delta \text{期待情報利得}}{\text{推定検証コスト}}
$$

安価かつ反証リスクの高い実験から順次実行することで、破綻した仮説を最小のトークン消費と時間で早期枝刈り（Early Pruning）します。

### 6. 独立 Git Worktree による並列探索

未完成なコードが作業ツリーを汚染するのを防ぐため、候補ごとに独立した Git Worktree（`worktrees/run-<id>-<cand>/`）を自動作成します：
- 完全にクリーンなGit作業ツリーの保証。
- 複数候補の並列ビルド・並列テストの安全な実行。
- 却下された候補のブランチとワークツリーの完全自動ロールバック。

### 7. 外側Behavior Tree ＋ 内側Deep FSM コントローラー

本ハーネスは二層の制御構造を採用しています：
- **外側 Behavior Tree (BT)**: 大局的な実行戦略、フォールバック、タイムアウト、リトライ、クリーンアップを `Sequence`, `Selector`, `Parallel`, 各種デコレーター（`Tracer`, `Retry`, `Timeout`）で決定論的に統括。
- **内側 Deep FSM (`DeepController`)**: Deep探索内の `Diagnose`, `Falsify`, `Implement`, `Verify`, `Review` を精密に状態遷移。

候補が失敗した場合、**Backtrack Router** が原因を5つの構造化クラスに分類し、必要なフェーズへピンポイントで直接ジャンプします：
1. `IMPLEMENTATION_ERROR` $\rightarrow$ `Implement` へ直接ジャンプ
2. `FALSIFICATION_GAP` $\rightarrow$ `Falsify` へジャンプ
3. `ROOT_CAUSE_ERROR` $\rightarrow$ `Diagnose` へジャンプ
4. `EXTERNAL_SPEC` $\rightarrow$ `Research` へジャンプ
5. `REPO_MODEL_ERROR` $\rightarrow$ `Inspect` へジャンプ

### 8. 多層機械検証と不変条件オラクル（Metamorphic Oracle）

LLM自身の「実装できました」という自己申告は一切信用しません：
- **Identity Delta 型検査・リント**: 単なる件数比較ではなく、ハッシュ識別子による集合差分（$\text{Cand} \setminus \text{Base} = \emptyset$）を取り、既存エラーの裏に新規エラーが隠蔽されるのを防止。
- **Oracle Integrity Gate**: テストコード自体の不正な書き換えや改ざんを検知して即座に却下。
- **Tier 3 メタモルフィック / 代数的不変条件オラクル**: 具体的な期待値に依存しない代数的性質を検証：
  - 冪等性: $f(f(x)) = f(x)$
  - ラウンドトリップ変換: $\text{decode}(\text{encode}(x)) = x$
  - 状態遷移の可換性および不変量境界の充足。

### 9. ブラインド・クリーンルーム査読（Clean-Room Reviewer）

機械検証をパスした最優秀候補は、独立した **Clean-Room Reviewer** による査読に送られます：
- 実装コンテキスト（試行錯誤のチャット履歴）を一切与えない新規スレッドで起動（サンクコスト効果や言い訳の排除）。
- ネットワーク遮断・`read-only` サンドボックス環境。
- PRの差分（diff）、仕様、検証スコアのみから、敵対的なシニアエンジニアの視点で隠れたエッジケースや設計リグレッションを審査。

### 10. 4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮

長時間セッションによる注意の希釈を防ぐため、揮発性データと不変の事実を明確に分離します：
- **4層構造化証拠ストア**: 事実レコードを `Observation`（観察事実）、`Assertion`（検証結果）、`Inference`（推論・仮説）、`Decision`（採択決定）の4層に不変保存。
- **コンテキスト・コンパクター**: バックトラックやフェーズ遷移時、長大なチャットログやスタックトレースを破棄し、負の制約条件や不変条件違反の教訓のみを蒸留して次期コンテキストへ射影。

### 11. GitHub Broker と検証済みコミットSHA不変条件

セキュリティとリポジトリの整合性を極限まで高めています：
- **最小権限 GitHub App**: LLMには生のPersonal Access Token（PAT）を一切渡さず、厳格に型付けされた `GitHubBroker` 経由でのみGitHub操作を実行。
- **Verified Commit SHA Invariant**: `origin/main` 上でステージングされたコミットに対してフルインテグレーション検証を実行。検証をパスしたSHAと、実際にPRにpushされるSHAが厳密に一致することを暗号学的に保証：

$$
\text{SHA}_{\text{verified}} \equiv \text{SHA}_{\text{PR}}
$$

### 12. SQLite FTS5 耐久メモリと昇格ラダー

過去の知見、アーキテクチャ決定記録（ADR）、プロシージャル・スキルは組み込みの SQLite FTS5 データベースに永続化されます。知識は検証の深さに応じて単調増加する信頼度ラダーを進みます：

```text
UNVERIFIED (未検証: 0.2)
       │
       ▼
LOCAL_TEST_PASSED (局所テスト通過: 0.5)
       │
       ▼
LOCAL_INTEGRATION_VERIFIED (統合検証通過: 0.8)
       │
       ▼
PR_CREATED (PR作成済み: 0.85)
       │
       ▼
MERGED (マージ完了: 1.0)
```

リポジトリ検査時に生成された問題シグネチャを BM25 全文検索で過去の知見と照合し、同じ設計ミスを別タスクで再発させるのを防ぎます。

### 13. キャリブレーション付き DPO 選好軌跡エクスポート

すべての探索履歴は、DPO（Direct Preference Optimization）形式の JSONL データセット（`.agent/trajectories/`）として自動記録されます。採用候補は `chosen`、却下候補は `rejected` としてラベル付けされ、査読の直交性やメタモルフィック検証の深さに基づいた信頼度重みが付与されます。

---

## クイックスタート

### 前提要件

- **Node.js**: `v20.0.0` 以上
- **パッケージマネージャー**: `pnpm`（推奨, `v10.5.2`+）または `npm`
- **Git**: パスが通っており利用可能な状態
- **OpenAI 認証**: `codex login` による ChatGPT アカウントの OAuth ログイン、または `OPENAI_API_KEY`

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/mas2194/my_harness.git
cd my_harness

# 依存パッケージのインストール
pnpm install
# または: npm install

# TypeScriptのビルド
pnpm run build
# または: npm run build
```

### 環境変数の設定

`.env.example` をコピーして `.env` を作成します：

```bash
cp .env.example .env
```

`.env` の内容を編集します：

```env
# LLM / Codex 設定
# `codex login` 済み（ChatGPT OAuth）の場合は OPENAI_API_KEY の設定は不要です
USE_CODEX=true
# OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-6-luna

# 任意: 自動プルリクエスト作成を行う場合のGitHub App設定
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=./secrets/github-app.private-key.pem
GITHUB_APP_INSTALLATION_ID=
GITHUB_TARGET_OWNER=
GITHUB_TARGET_REPO=

# 実行時パラメータ設定
MAX_PARALLEL_EXPERIMENTS=3
EXPERIMENT_TIMEOUT_MS=600000
WORKTREES_DIR=./worktrees
HARNESS_TEST_COMMAND="npm test"
```

### 実行方法

解決したい目標（ゴール）を指定してハーネスを起動します：

```bash
# tsx を用いた直接実行
npx tsx src/main.ts "Migrate storage layer to SQLite and eliminate duplicate state"

# またはビルド後の実行
node dist/main.js "Refactor caching module to support TTL and cache stampsede prevention"
```

実行中、`my_harness` は以下のフローを自律的に進行します：
1. 対象コードベースの AST、依存関係トポロジー、不変条件を自動解析。
2. 介入ラダー（L0〜L6）に沿った多層的な診断仮説を生成。
3. 各仮説に対する敵対的反証・批判を実施。
4. 生き残った有望候補を独立した Git Worktree 上で並列実装。
5. コンパイラ、テストスイート、不変条件オラクルによる厳格な機械検証。
6. クリーンルーム査読者によるブラインド審査。
7. 承認されたコミットを作業ブランチへ統合、または GitHub Pull Request として自動公開。

---

## 詳細設定

### GitHub App の連携設定

ハーネスに自動でブランチのプッシュやPR作成を行わせる場合は、以下の最小権限を設定した GitHub App を作成して連携します：

| 権限項目 | アクセスレベル | 目的 |
|---|---|---|
| **Contents** | 読み取り / 書き込み | 作業ブランチ作成、コミットプッシュ、コード変更 |
| **Pull Requests** | 読み取り / 書き込み | PRの作成、ステータス更新 |
| **Issues** | 読み取り / 書き込み | 発見されたアーキテクチャ技術負債の起票 |
| **Checks** | 読み取りのみ | リモートCI実行結果の監視 |
| **Actions / Workflows** | 読み取りのみ (変更を許可する場合は書き込み) | CIワークフロー結果の取得 |

秘密鍵ファイル（`.pem`）を `./secrets/github-app.private-key.pem` に配置し、`.env` に各識別子を設定してください。

### 多次元バジェット・ガバナー

探索の無限ループや過剰なトークン消費を防止するため、多次元の予算制約を設定できます：

```typescript
const harness = new HarnessStateMachine({
  goal: "Refactor core event loop",
  budgetLimits: {
    maxIterations: 5,           // FSMの最大ループ反復数
    maxCandidates: 8,           // 最大候補実装数
    maxTestRuns: 20,            // 最大テスト実行回数
    maxBacktracks: 4,           // フェーズ差し戻し最大回数
    wallClockTimeoutMs: 1800000 // タイムアウト時間（30分）
  }
});
```

---

## ディレクトリ構成

```text
my_harness/
├── AGENTS.md                  # システムの最優先設計原則・制約事項
├── .env.example               # 環境変数テンプレート
├── prompts/                   # 各役割に特化したシステムプロンプト
│   ├── architect.md           # 発散的仮説生成アーキテクト
│   ├── falsifier.md           # 敵対的反証・批判エージェント
│   ├── implementer.md         # Worktree実装ワーカー
│   ├── researcher.md          # 外部仕様・学術調査エージェント
│   └── reviewer.md            # クリーンルーム・ブラインド査読者
├── src/
│   ├── main.ts                # CLIエントリーポイント
│   ├── bt/                    # Behavior Tree エンジン（Composite, Decorator, Node）
│   ├── orchestrator/          # ハイブリッド・オーケストレーター（BT, FSM, 証拠ストア, 圧縮器）
│   │   ├── tree.ts            # Behavior Tree 構造定義
│   │   ├── deep-controller.ts # Deep探索用内側FSMコントローラー
│   │   ├── backtrack-router.ts# 5クラスの構造化バックトラック・ルーター
│   │   ├── evidence-store.ts  # 4層構造化不変証拠ストア
│   │   └── compactor.ts       # 不可逆損失のないコンテキスト蒸留・圧縮器
│   ├── phases/                # 各自律実行フェーズ
│   │   ├── inspect-repo.ts    # トポロジー・AST・不変条件解析
│   │   ├── triage.ts          # Fast / Deep パス判定ルーター
│   │   ├── architect.ts       # 介入ラダーに基づく仮説生成
│   │   ├── diversity-gate.ts  # 直交仮説フィルタ（ダイバーシティ・ゲート）
│   │   ├── falsify.ts         # 敵対的反証フェーズ
│   │   ├── implement.ts       # Worktree並列コード合成
│   │   └── review.ts          # ブラインド・クリーンルーム査読
│   ├── evaluator/             # 検証エンジンとオラクル
│   │   ├── runner.ts          # 機械テスト・ベンチマーク実行
│   │   ├── integrity.ts       # テスト改ざん検知・不変条件ゲート
│   │   ├── oracle.ts          # Tier 3 メタモルフィック / 代数的不変条件オラクル
│   │   └── pareto.ts          # パレート最適・辞書式ソーター
│   ├── git/                   # Git Worktree / ブランチ管理
│   ├── github/                # 最小権限 GitHub App Broker ＆ ポリシーエンジン
│   ├── journal/               # 実行ジャーナルと障害復旧リコンシリエーション
│   ├── memory/                # SQLite FTS5 耐久メモリ ＆ 昇格ラダー
│   ├── skills/                # 手続き的スキルの結晶化（SKILL.md）
│   ├── budget/                # 多次元バジェット・トラッカー
│   └── trajectory/            # DPO 選好データセット・エクスポーター
└── tests/                     # Vitest 総合テストスイート（全83テスト合格）
```

---

## テストと品質検証

本リポジトリは、単体テスト・結合テスト・メタモルフィック検証を含む徹底したテストスイートを備えています：

```bash
# 全テストスイートの実行
pnpm test
# または: npm test

# ウォッチモードでの実行
pnpm run test:watch

# TypeScript 型検査
pnpm run lint
```

テスト検証内容：
- Behavior Tree（Composite, Decorator）の実行セマンティクス
- DeepController FSM の状態遷移と構造化バックトラッキング
- 並列 Git Worktree の安全な生成・分離・ロールバック処理
- コンテキスト・コンパクターによる証拠損失のない蒸留処理
- メモリ検証昇格ラダーの状態遷移
- パレート面計算と差分最小化排除スコアリング
- メタモルフィック不変条件検証とテスト改ざん検知

---

## ライセンス

本プロジェクトは **Apache-2.0 License** のもとで公開されています。詳細は [LICENSE](LICENSE) を参照してください。
