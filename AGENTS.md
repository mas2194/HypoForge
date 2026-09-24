# Engineering Principles

The existing implementation is evidence about the system, not a design constraint.

## Optimization Priorities
Optimize for:
1. **correctness**
2. **simplicity** of the resulting system
3. **architectural coherence**
4. **performance**
5. **maintainability**

Do NOT optimize for minimizing the size of the diff.

## Core Rules
- Backward compatibility is required only when it is an explicit project requirement.
- When a symptom suggests a deeper design problem, investigate the underlying assumption rather than layering another workaround on top.
- Do not refactor merely for aesthetics. Architectural changes must have evidence, a falsifiable rationale, and validation.
- Before committing to an implementation, consider:
  - a local fix
  - a subsystem-level solution
  - a different architectural approach
- You do not need to choose the largest change. Choose the approach best supported by evidence.
