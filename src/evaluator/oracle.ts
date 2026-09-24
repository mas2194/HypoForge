import type { MetamorphicResult } from "../schemas/result.js";

export interface MetamorphicTestProperty<T, R> {
  name: string;
  type: "idempotence" | "commutativity" | "round_trip" | "monotonicity" | "state_invariant";
  run: (subject: any) => Promise<{ passed: boolean; reason?: string }>;
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
