# 自律型エージェント・ハーネス (`HypoForge`)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%207.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-21%20suites%20%2F%20140%2B%20passed-brightgreen.svg?logo=vitest&logoColor=white)](https://vitest.dev/)

[**English**](README.md) | **日本語**

---

`HypoForge` は、TypeScript と OpenAI / Codex SDK を基盤に構築された、  **証拠駆動型の自律ソフトウェア工学エージェント・ハーネス（Autonomous Software Engineering Harness）** です。

LLMを単なる「diffを生成するパッチ作成器」として扱うのではなく、決定論的な統制アーキテクチャの制御下で稼働する **「仮説探索・反証アルゴリズムの実行エンジン」** として位置付けています。

多層的な介入ラダー（Intervention Ladder）、反事実的設計検証（Counterfactual Architecture Check）、独立したGit Worktreeによる並列探索、メタモルフィック不変条件テスト、そしてブラインド査読（Clean-Room Review）を組み合わせ、既存のコーディングエージェントが陥りがちな **「最小変更の罠（Minimal-Diff Trap: 目先のテストを通すために場当たり的なパッチに逃げる問題）」** に対処することを目指します。

---

## 目次

- [背景と課題：最小変更の罠（Minimal-Diff Trap）](#背景と課題最小変更の罠minimal-diff-trap)
- [核となる設計原則（Engineering Principles）](#核となる設計原則engineering-principles)
- [全体アーキテクチャ](#全体アーキテクチャ)
- [実装済みのコア機構](#実装済みのコア機構)
  - [1. 証拠に基づく候補順位付け](#1-証拠に基づく候補順位付け)
  - [2. 介入ラダー（Intervention Ladder: L0〜L6）](#2-介入ラダーintervention-ladder-l0l6)
  - [3. 反事実的アーキテクチャ検査（Counterfactual Check）](#3-反事実的アーキテクチャ検査counterfactual-check)
  - [4. 発散的多様性生成とダイバーシティ・ゲート](#4-発散的多様性生成とダイバーシティゲート)
  - [5. モデル主導のリサーチ・ルーティング](#5-モデル主導のリサーチルーティング)
  - [6. 安価な反証優先スケジューリング（Cheap-Falsification-First MAB）](#6-安価な反証優先スケジューリングcheap-falsification-first-mab)
  - [7. 独立 Git Worktree による並列探索](#7-独立-git-worktree-による並列探索)
  - [8. 自律的テスト選択と自己修復フィードバックループ](#8-自律的テスト選択と自己修復フィードバックループ)
  - [9. 外側Behavior Tree ＋ 蓄積コンテキスト障害復旧](#9-外側behavior-tree--蓄積コンテキスト障害復旧)
  - [10. 多層機械検証と不変条件オラクル（Metamorphic Oracle）](#10-多層機械検証と不変条件オラクルmetamorphic-oracle)
  - [11. ブラインド・クリーンルーム査読（Clean-Room Reviewer）](#11-ブラインドクリーンルーム査読clean-room-reviewer)
  - [12. 4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮](#12-4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮)
  - [13. GitHub Broker と検証済みコミットSHA不変条件](#13-github-broker-と検証済みコミットsha不変条件)
  - [14. SQLite FTS5 耐久メモリと昇格ラダー](#14-sqlite-fts5-耐久メモリと昇格ラダー)
  - [15. キャリブレーション付き DPO 選好軌跡エクスポート](#15-キャリブレーション付き-dpo-選好軌跡エクスポート)
- [クイックスタート](#クイックスタート)
  - [前提要件](#前提要件)
  - [インストール](#インストール)
  - [環境変数の設定](#環境変数の設定)
  - [実行方法](#実行方法)
  - [インタラクティブ・スラッシュコマンド & ファイル補完](#インタラクティブスラッシュコマンド)
  - [Web UI サーバーモード（3カラム・ダッシュボード）](#web-ui-サーバーモード--server---s)
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

`HypoForge` は、この脆弱なアプローチを科学的方法論に基づいた探索サイクルに置き換えます：
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

### 1. 証拠に基づく候補順位付け

候補はまずベースライン相対のハードゲートで判定します。合格候補は、計測された性能改善率、証拠強度、検証スコアの順で順位付けし、すべて同じ場合は候補IDで順序を決めます。介入レベルと差分サイズは記録しますが、順位付けには使いません。

正しさと回帰の検査はハードゲートで扱います。順位付けでは保守性やアーキテクチャの一貫性を直接測定しておらず、行数をその代理指標にもしていません。変更が大きいという理由だけで優先されることはなく、検証結果と証拠に基づいて順位が決まります。機械的に検証された事項と経験的仮説の境界についての客観的な評価・分析は、[docs/architecture-evaluation.md](docs/architecture-evaluation.md) を参照してください。

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

### 5. モデル主導のリサーチ・ルーティング

深いアーキテクチャ診断を開始する前に、外部の文献や仕様調査が必要かを動的に判定します（`src/phases/research-router.ts`）：
- **モデル推論（`judgeResearchNeed`）**: 与えられた言語（日本語・英語等）のまま、リポジトリ外の先行事例比較やプロトコル仕様、ドメイン知識の調査が必要かをLLMが自律判定。
- **シグナル検出**: レイテンシ/スループット目標、並行処理/ロックフリー、アルゴリズム/データ構造選定、コア再設計、SOTA/論文調査、外部API刷新などのパターンを自動識別。
- 必要な場合は自律リサーチワーカーが調査を行い、構造化された知見（`CandidateResearchSchema`）を抽出してから診断へ進みます。

### 6. 安価な反証優先スケジューリング（Cheap-Falsification-First MAB）

高価なコード生成を行う前に、専任の **Falsifier（反証エージェント）** が各仮説に対して反例、競合状態、エッジケース、計算量爆発の観点から猛烈な批判を加えます。

候補の優先順位付けには、費用対情報利得 Multi-Armed Bandit（MAB）を採用しています：

$$
\text{Priority} = \frac{\Delta \text{期待情報利得}}{\text{推定検証コスト}}
$$

安価かつ反証リスクの高い実験から順次実行することで、破綻した仮説を最小のトークン消費と時間で早期枝刈り（Early Pruning）します。

### 7. 独立 Git Worktree による並列探索

未完成なコードが作業ツリーを汚染するのを防ぐため、候補ごとに独立した Git Worktree（`worktrees/run-<id>-<cand>/`）を自動作成します：
- 完全にクリーンなGit作業ツリーの保証。
- 複数候補の並列ビルド・並列テストの安全な実行。
- 却下された候補のブランチとワークツリーの完全自動ロールバック。

### 8. 自律的テスト選択と自己修復フィードバックループ

実装段階において、候補ワーカーはリポジトリの規約を遵守しつつ高い自律性をもって作業します（`src/phases/implement.ts`）：
- **自律的テスト選択**: 機械的に全テストを回すのではなく、変更内容に応じてテストの有用性、適切なテスト範囲やスクリプトを自律的に選定。
- **自動自己修復ループ（`repairFailedCandidates`）**: 独立ハーネス検証でテスト失敗（非ゼロ終了コード、テスト失敗ID、回帰エラー等）が検出された場合、最大20,000文字の失敗ログを該当候補のワーカースレッドへフィードバック。ワークツリー内で根本原因を調査・修正し、テストを再実行した上で修正コミットを作成して再検証を受けます。

### 9. 外側Behavior Tree ＋ 蓄積コンテキスト障害復旧

本ハーネスは回復力の高い二層制御構造を採用しています：
- **外側 Behavior Tree (BT)**: 大局的な実行戦略、フォールバック、タイムアウト、リトライ、クリーンアップを `Sequence`, `Selector`, `Parallel`, 各種デコレーター（`Tracer`, `Retry`, `Timeout`）で決定論的に統括。
- **内側 Deep FSM (`DeepController`)**: Deep探索内の `Diagnose`, `Falsify`, `Implement`, `Verify`, `Review` を精密に状態遷移。
- **蓄積コンテキスト障害復旧（`maxAutomaticRestarts`）**: Behavior Tree の実行が失敗した場合でも、過去の試行で蓄積されたエラーログ、診断結果、検証結果（`recoveryHistory`）をコンテキストに保持したまま `Inspect` から自動再実行。失敗アプローチの繰り返しを回避しながら自己修復を図ります。
- **構造化バックトラック・ルーター**: 実行中の候補却下原因を5つの構造化クラスに分類し、必要なフェーズへピンポイントで直接ジャンプ：
  1. `IMPLEMENTATION_ERROR` $\rightarrow$ `Implement` へ直接ジャンプ
  2. `FALSIFICATION_GAP` $\rightarrow$ `Falsify` へジャンプ
  3. `ROOT_CAUSE_ERROR` $\rightarrow$ `Diagnose` へジャンプ
  4. `EXTERNAL_SPEC` $\rightarrow$ `Research` へジャンプ
  5. `REPO_MODEL_ERROR` $\rightarrow$ `Inspect` へジャンプ

### 10. 多層機械検証と不変条件オラクル（Metamorphic Oracle）

LLM自身の「実装できました」という自己申告は一切信用しません：
- **Identity Delta 型検査・リント**: 単なる件数比較ではなく、ハッシュ識別子による集合差分（$\text{Cand} \setminus \text{Base} = \emptyset$）を取り、既存エラーの裏に新規エラーが隠蔽されるのを防止。
- **Oracle Integrity Gate**: テストコード自体の不正な書き換えや改ざんを検知して即座に却下。
- **Tier 3 メタモルフィック / 代数的不変条件オラクル**: 具体的な期待値に依存しない代数的性質を検証：
  - 冪等性: $f(f(x)) = f(x)$
  - ラウンドトリップ変換: $\text{decode}(\text{encode}(x)) = x$
  - 状態遷移の可換性および不変量境界の充足。

### 11. ブラインド・クリーンルーム査読（Clean-Room Reviewer）

機械検証をパスした最優秀候補は、独立した **Clean-Room Reviewer** による査読に送られます：
- 実装コンテキスト（試行錯誤のチャット履歴）を一切与えない新規スレッドで起動（サンクコスト効果や言い訳の排除）。
- ネットワーク遮断・`read-only` サンドボックス環境。
- PRの差分（diff）、仕様、検証スコアのみから、敵対的なシニアエンジニアの視点で隠れたエッジケースや設計リグレッションを審査。

### 12. 4層構造化証拠ストアと不可逆損失のないコンテキスト圧縮

長時間セッションによる注意の希釈を防ぐため、揮発性データと不変の事実を明確に分離します：
- **4層構造化証拠ストア**: 事実レコードを `Observation`（観察事実）、`Assertion`（検証結果）、`Inference`（推論・仮説）、`Decision`（採択決定）の4層に不変保存。
- **コンテキスト・コンパクター**: バックトラックやフェーズ遷移時、長大なチャットログやスタックトレースを破棄し、負の制約条件や不変条件違反の教訓のみを蒸留して次期コンテキストへ射影。

### 13. GitHub Broker と検証済みコミットSHA不変条件

セキュリティとリポジトリの整合性を極限まで高めています：
- **最小権限 GitHub App**: LLMには生のPersonal Access Token（PAT）を一切渡さず、厳格に型付けされた `GitHubBroker` 経由でのみGitHub操作を実行。
- **Verified Commit SHA Invariant**: `origin/main` 上でステージングされたコミットに対してフルインテグレーション検証を実行。検証をパスしたSHAと、実際にPRにpushされるSHAが厳密に一致することを暗号学的に保証：

$$
\text{SHA}_{\text{verified}} \equiv \text{SHA}_{\text{PR}}
$$

### 14. SQLite FTS5 耐久メモリと昇格ラダー

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

### 15. キャリブレーション付き DPO 選好軌跡エクスポート

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
git clone https://github.com/mas2194/HypoForge.git
cd HypoForge

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
WORKTREES_DIR=./worktrees
# 任意: 未設定の場合、候補エージェントが有効なチェック方法を判断します。
HARNESS_TEST_COMMAND="npm test"
```

### 実行方法

対話型プロンプトまたは引数指定でハーネスを起動します：

```bash
# 対話型モード（Enter: 送信、Shift+Enter: 改行、Tab: @ ファイル補完）
npx tsx src/main.ts

# 直接目標（ゴール）を指定して実行
npx tsx src/main.ts "Migrate storage layer to SQLite and eliminate duplicate state"

# モデル（-m）や推論Effort（-e）を直接指定して実行
npx tsx src/main.ts -m gpt-6-sol -e high "Refactor network layer"

# Web UI サーバーモード（-s）をポート指定（-p）で起動
npx tsx src/main.ts -s -p 8080

# またはビルド後の実行
node dist/main.js
```

#### CLI フラグ一覧

| フラグ | 短縮形 | 説明 | デフォルト値 |
|---|---|---|---|
| `--model <name>` | `-m` | 使用する LLM / Codex モデル（例: `gpt-6-sol`, `gpt-6-luna`, `o3-mini`） | `gpt-6-luna`（または `OPENAI_MODEL`） |
| `--effort <level>` | `-e` | 推論深度（`minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `persistent`） | `medium` |
| `--server` | `-s` | ブラウザ操作用 Web UI サーバーを起動 | `false`（CLI 対話モード） |
| `--port <num>` | `-p` | Web UI サーバーのポート番号 | `3000`（または `PORT` 環境変数） |

#### 対話型スラッシュコマンド（Codex CLI準拠）

対話プロンプト内で Codex CLI と同様のスラッシュコマンドが利用可能です：

- **`/model`** または **`/model <name|番号>`**:
  - 引数なし：利用可能な Codex モデル一覧（`~/.codex/models_cache.json` から自動ロード）とサポートされる推論Effortを表示し、対話的に選択。
  - 引数指定：アクティブなモデルを動的に切り替え（例: `/model gpt-6-sol` や `/model 2`）。
- **`/effort`** または **`/effort <level|番号>`**:
  - 引数なし：利用可能な推論Effort一覧（`minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, `persistent`）とその説明を表示。
  - 引数指定：推論Effortを動的に切り替え（例: `/effort high` や `/effort 4`）。
- **`/status`**：現在のアクティブモデル、Effort、テストコマンドなどの設定状況を表示。
- **`/help`**：利用可能なコマンド一覧と操作方法を表示。
- **`/exit`**, **`/quit`**, **`/q`**（または `exit`, `quit`, `q`）：セッションを終了。

#### `@` コマンド（ファイル読み込み & Tab補完）

プロンプト内で `@` を入力することで、ワークスペース内のファイルを読み込んでコンテキストに含めることができます：

- **`@<file>`** または **`@ <file>`**：
  - 指定したファイルの内容を読み込み、構造化コードブロックとしてプロンプトコンテキストに自動展開します。
  - 例: `@src/main.ts エラーハンドリングをリファクタリングして`
  - 例: `Compare @src/main.ts and @src/codex/commands.ts`
  - 行番号範囲の指定もサポート: `@src/main.ts:10-50`
- **Tab キー（tap）による候補補完 & 選択**：
  - `@` または `@ファイル名の一部` を入力して **Tab** キーを押すと、ワークスペース内の候補ファイル一覧が表示されます。
  - **Tab**（または **↓** / **↑** / **Shift+Tab**）を押すことで候補をインプレースで順次切り替えて選択できます。
  - **Enter** または **Space** で候補を確定し、そのまま指示の入力を続けられます（**Esc** でキャンセル）。

#### Web UI サーバーモード（`--server` / `-s`）

起動時に `--server`（または `-s`）オプションを渡すことで、ブラウザから操作できる Web UI サーバーを起動できます：

```bash
# Web UI サーバーの起動（デフォルトポート: 3000）
npm run server
# または
npx tsx src/main.ts --server

# ポート番号やモデル、推論Effortを指定して起動
npx tsx src/main.ts -s -p 8080 -m o3-mini -e high
```

ブラウザで `http://localhost:3000` にアクセスすると、モダンな **3カラム・ダッシュボード** で操作できます：

- **左側ペイン（会話とコントロール: Chat Pane）**:
  - チャット形式で目標（Goal）を入力し、モデルと対話しながら自律探索を実行。
  - 上部バーからアクティブモデルや推論Effortを動的に切り替え可能。
  - クイックアクションチップ（`@src/main.ts`, `/help` 等）および `@<file>` 入力時の自動補完ドロップダウン。
  - `/model`, `/effort`, `/status`, `/help` 等の対話型スラッシュコマンドをフルサポート。
- **中央ペイン（ファイル閲覧 & パイプライン活動: Viewer Pane）**:
  - **`📄 File Content` タブ**:
    - 多言語シンタックスハイライト（TypeScript/JavaScript, JSON, Python, HTML, CSS, Markdown, Shell 等）。
    - 行番号表示、言語バッジ、ファイルサイズ・行数のステータス表示。
    - 行折り返しトグル（Wrap: On/Off）、チャット入力への `@ Mention` 挿入ボタン、クリップボードへの Copy 機能。
  - **`📊 Pipeline & Activity` タブ**:
    - **Harness Stage Pipeline Graph**: `Inspect` → `Triage` → `Explore` → `Integrate` → `Publish` → `Learn` の進行状況をリアルタイムに可視化。各フェーズをクリックしてログをフィルタ可能。
    - **Explore Flow Navigator**: Explore フェーズの内部フロー（`Research` から `Review` まで）をステップ表示し、クリックで該当サブエージェント活動へジャンプ。
    - **Codex Sub-Agent Activity Panel**: 各サブエージェントの思考ログ、ツール活動、生成内容、ログ、段階サマリーをリアルタイムにインライン表示。
- **右側ペイン（ワークスペース・ファイルツリー: Workspace File Tree）**:
  - ワークスペース全体のディレクトリツリー表示とリアルタイムテキスト検索フィルター。
  - ファイルをクリックすると中央ペインの `File Content` ビューアで即座にプレビュー表示。
  - 各ファイル横の `@` ボタンをクリックしてチャット入力へ即座にファイルメンションを挿入可能。
- **REST & SSE エンドポイント**:
  - `GET /api/file?path=<path>`: ディレクトリトラバーサル攻撃を防ぐセキュリティチェック付きファイル内容取得 API。
  - `POST /api/chat`, `GET /api/events` (Server-Sent Events), `GET /api/status`, `GET /api/models`, `GET /api/files`。

実行中、`HypoForge` は以下のフローを自律的に進行します：
1. 対象コードベースの AST、依存関係トポロジー、不変条件を自動解析。
2. モデルの推論とシグナルパターンに基づき、必要に応じて外部仕様・文献リサーチを実施。
3. 介入ラダー（L0〜L6）に沿った多層的な診断仮説を生成。
4. 各仮説に対する敵対的反証・批判を実施し、MABスケジューリングにより選定。
5. 生き残った有望候補を独立した Git Worktree 上で自律的テスト選択を行いながら並列実装。
6. テスト失敗が検出された場合、自動自己修復ループにより根本原因の修正と再テストを反復。
7. コンパイラ、テストスイート、不変条件オラクルによる厳格な機械検証。
8. クリーンルーム査読者によるブラインド審査。
9. 承認されたコミットを作業ブランチへ統合、または GitHub Pull Request として自動公開。
10. 全体の実行が失敗した場合でも、蓄積されたコンテキストとエラー履歴を保持して Inspect から自動再実行。

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
  }
});
```

---

## ディレクトリ構成

```text
HypoForge/
├── AGENTS.md                  # システムの最優先設計原則・制約事項
├── .env.example               # 環境変数テンプレート
├── docs/
│   └── architecture-evaluation.md # 証拠に基づく客観的評価と限界の分析書
├── prompts/                   # 各役割に特化したシステムプロンプト
│   ├── architect.md           # 発散的仮説生成アーキテクト
│   ├── falsifier.md           # 敵対的反証・批判エージェント
│   ├── implementer.md         # Worktree実装ワーカー
│   ├── researcher.md          # 外部仕様・学術調査エージェント
│   └── reviewer.md            # クリーンルーム・ブラインド査読者
├── src/
│   ├── main.ts                # CLI & Web サーバーエントリーポイント
│   ├── bt/                    # Behavior Tree エンジン（Composite, Decorator, Action node）
│   ├── orchestrator/          # ハイブリッド・オーケストレーター（BT, FSM, 証拠ストア, 圧縮器）
│   │   ├── orchestrator.ts    # 蓄積コンテキスト障害復旧を備えた最上位オーケストレーター
│   │   ├── actions.ts         # Behavior Tree アクション実行と状態バインド
│   │   ├── tree.ts            # Behavior Tree 構造定義
│   │   ├── deep-controller.ts # Deep探索用内側FSMコントローラー
│   │   ├── backtrack-router.ts# 5クラスの構造化バックトラック・ルーター
│   │   ├── evidence-store.ts  # 4層構造化不変証拠ストア
│   │   ├── compactor.ts       # 不可逆損失のないコンテキスト蒸留・圧縮器
│   │   ├── context.ts         # ハーネス・試行コンテキスト定義
│   │   └── state-machine.ts   # 公開ファサード API
│   ├── phases/                # 各自律実行フェーズ
│   │   ├── inspect-repo.ts    # トポロジー・AST・不変条件解析
│   │   ├── triage.ts          # Fast / Deep パス判定ルーター
│   │   ├── research-router.ts # モデル推論とシグナルに基づくリサーチ判定ゲート
│   │   ├── research.ts        # 外部仕様・学術調査ワーカー
│   │   ├── architect.ts       # 介入ラダーに基づく仮説生成
│   │   ├── diversity-gate.ts  # 直交仮説フィルタ（ダイバーシティ・ゲート）
│   │   ├── adaptive-scheduler.ts # 期待情報利得 / コスト MAB スケジューラー
│   │   ├── falsify.ts         # 敵対的反証フェーズ
│   │   ├── implement.ts       # Worktree並列コード合成 ＆ 自動自己修復ループ
│   │   └── review.ts          # ブラインド・クリーンルーム査読
│   ├── evaluator/             # 検証エンジンとオラクル
│   │   ├── runner.ts          # 機械テスト・ベンチマーク実行
│   │   ├── integrity.ts       # テスト改ざん検知・不変条件ゲート
│   │   ├── oracle.ts          # Tier 3 メタモルフィック / 代数的不変条件オラクル
│   │   └── pareto.ts          # パレート最適・辞書式ソーター
│   ├── codex/                 # Codex SDK 連携 ＆ 対話型 CLI ツール
│   │   ├── client.ts          # Codex クライアントマネージャー ＆ ワーカースレッド
│   │   ├── commands.ts        # 動的スラッシュコマンド（/model, /effort 等）
│   │   ├── config.ts          # モデル設定 ＆ キャッシュローダー
│   │   └── file-mention.ts    # ワークスペースファイル @ 展開・補完
│   ├── server/                # Web UI ＆ REST / SSE サーバー
│   │   ├── server.ts          # HTTP サーバー、ファイル API ＆ SSE 配信
│   │   ├── harness-runner.ts  # バックグラウンドハーネス実行マネージャー
│   │   ├── event-bus.ts       # 中央型付きイベントバス
│   │   ├── events.ts          # イベントスキーマ・プロトコル定義
│   │   └── web/ui.ts          # 3カラム・ダッシュボード UI（会話、ビューア、ツリー）
│   ├── schemas/               # Zod スキーマ ＆ 型定義
│   │   ├── candidate.ts       # 候補実装スキーマ
│   │   ├── diagnosis.ts       # 仮説・診断モデル
│   │   ├── evidence.ts        # 構造化証拠レイヤースキーマ
│   │   ├── research.ts        # 文献・外部調査スキーマ
│   │   └── result.ts          # 検証結果・メトリクス
│   ├── git/                   # Git Worktree / ブランチ管理
│   ├── github/                # 最小権限 GitHub App Broker ＆ ポリシーエンジン
│   ├── journal/               # 実行ジャーナルと障害復旧リコンシリエーション
│   ├── memory/                # SQLite FTS5 耐久メモリ ＆ 昇格ラダー
│   ├── skills/                # 手続き的スキルの結晶化（SKILL.md）
│   ├── budget/                # 多次元バジェット・トラッカー
│   └── trajectory/            # DPO 選好データセット・エクスポーター
└── tests/                     # 総合 Vitest テストスイート（全21ファイル・140+テスト合格）
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
- 差分サイズを優遇しない、性能改善率と証拠強度に基づくパレート順位付け
- メタモルフィック不変条件検証とテスト改ざん検知
- 候補エージェントの自律的テスト選択と自動自己修復ループ検証
- モデル推論およびシグナルパターンによるリサーチ・ルーティング判定
- パストラバーサル防止セキュリティチェック付き Web UI / REST API ファイル取得
- 対話型 CLI のスラッシュコマンド、`@` ファイルメンション、インプレース候補巡回
- 蓄積されたコンテキストとエラー履歴による再実行障害復旧

---

## ライセンス

本プロジェクトは **Apache-2.0 License** のもとで公開されています。詳細は [LICENSE](LICENSE) を参照してください。
