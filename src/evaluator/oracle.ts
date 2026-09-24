import type {
  MetamorphicResult,
  AcceptanceResult,
  AdversarialResult,
} from "../schemas/result.js";

export interface AcceptanceCriterion {
  id: string;
  description: string;
  evaluate: (context: { worktreePath: string; testOutput: string }) => Promise<boolean> | boolean;
}

export interface AdversarialScenario {
  id: string;
  description: string;
  type: "boundary_condition" | "malformed_input" | "resource_stress" | "concurrency_race";
  run: (context: { worktreePath: string }) => Promise<{ passed: boolean; reason?: string }>;
}

export interface MetamorphicTestProperty<T, R> {
  name: string;
  type: "idempotence" | "commutativity" | "round_trip" | "monotonicity" | "state_invariant";
  run: (subject: any) => Promise<{ passed: boolean; reason?: string }>;
}

export class FourTierVerificationRunner {
  private metamorphicRunner = new MetamorphicOracleRunner();

  /**
   * Tier 2: Acceptance Oracle Evaluation
   * Verifies high-level user specification / criteria independently of candidate implementation details.
   */
  async evaluateAcceptance(
    criteria: AcceptanceCriterion[],
    context: { worktreePath: string; testOutput: string }
  ): Promise<AcceptanceResult> {
    if (!criteria || criteria.length === 0) {
      return { tested: false, passed: true, verifiedCriteria: [], missingCriteria: [] };
    }

    const verifiedCriteria: string[] = [];
    const missingCriteria: string[] = [];

    for (const c of criteria) {
      try {
        const passed = await c.evaluate(context);
        if (passed) {
          verifiedCriteria.push(c.description);
        } else {
          missingCriteria.push(c.description);
        }
      } catch (err: any) {
        missingCriteria.push(`${c.description} (Error: ${err.message || String(err)})`);
      }
    }

    return {
      tested: true,
      passed: missingCriteria.length === 0,
      verifiedCriteria,
      missingCriteria,
    };
  }

  /**
   * Tier 3: Hidden Adversarial Scenarios
   * Subjects candidate to boundary inputs, stress, and race condition tests.
   */
  async evaluateAdversarial(
    scenarios: AdversarialScenario[],
    context: { worktreePath: string }
  ): Promise<AdversarialResult> {
    if (!scenarios || scenarios.length === 0) {
      return { tested: false, passed: true, scenarios: {}, failureReasons: [] };
    }

    const scenarioResults: Record<string, boolean> = {};
    const failureReasons: string[] = [];

    for (const s of scenarios) {
      try {
        const res = await s.run(context);
        scenarioResults[s.id] = res.passed;
        if (!res.passed) {
          failureReasons.push(`Adversarial [${s.id} (${s.type})]: ${res.reason ?? "Assertion failed"}`);
        }
      } catch (err: any) {
        scenarioResults[s.id] = false;
        failureReasons.push(`Adversarial [${s.id} (${s.type})] threw: ${err.message || String(err)}`);
      }
    }

    return {
      tested: true,
      passed: failureReasons.length === 0,
      scenarios: scenarioResults,
      failureReasons,
    };
  }

  /**
   * Tier 4: Metamorphic & Invariant Properties
   */
  async evaluateMetamorphic(
    subject: any,
    properties: MetamorphicTestProperty<any, any>[]
  ): Promise<MetamorphicResult> {
    return this.metamorphicRunner.evaluateProperties(subject, properties);
  }
}

export class MetamorphicOracleRunner {
  /**
   * Executes specification-free algebraic metamorphic invariant checks.
   * Prevents specification blind spots and collusion where both developer and tester LLMs misinterpret requirements.
   */
  async evaluateProperties(
    subject: any,
    properties: MetamorphicTestProperty<any, any>[]
  ): Promise<MetamorphicResult> {
    if (!properties || properties.length === 0) {
      return {
        tested: false,
        passed: true,
        properties: {},
        failureReasons: [],
      };
    }

    const propResults: Record<string, boolean> = {};
    const failureReasons: string[] = [];

    for (const prop of properties) {
      try {
        const res = await prop.run(subject);
        propResults[prop.name] = res.passed;
        if (!res.passed) {
          failureReasons.push(`Property [${prop.name} (${prop.type})] failed: ${res.reason ?? "Assertion error"}`);
        }
      } catch (err: any) {
        propResults[prop.name] = false;
        failureReasons.push(`Property [${prop.name}] threw exception: ${err.message || String(err)}`);
      }
    }

    const passedAll = failureReasons.length === 0;

    return {
      tested: true,
      passed: passedAll,
      properties: propResults,
      failureReasons,
    };
  }

  /**
   * Built-in standard metamorphic properties templates
   */
  static createIdempotenceProperty<T>(name: string, fn: (input: T) => Promise<T> | T, sampleInput: T): MetamorphicTestProperty<T, T> {
    return {
      name,
      type: "idempotence",
      run: async () => {
        const once = await fn(sampleInput);
        const twice = await fn(once);
        const passed = JSON.stringify(once) === JSON.stringify(twice);
        return {
          passed,
          reason: passed ? undefined : `Idempotence violated: f(x) !== f(f(x))`,
        };
      },
    };
  }

  static createRoundTripProperty<T, S>(
    name: string,
    serialize: (input: T) => Promise<S> | S,
    deserialize: (serialized: S) => Promise<T> | T,
    sampleInput: T
  ): MetamorphicTestProperty<T, T> {
    return {
      name,
      type: "round_trip",
      run: async () => {
        const encoded = await serialize(sampleInput);
        const decoded = await deserialize(encoded);
        const passed = JSON.stringify(sampleInput) === JSON.stringify(decoded);
        return {
          passed,
          reason: passed ? undefined : `Round-trip violated: deserialize(serialize(x)) !== x`,
        };
      },
    };
  }
}
