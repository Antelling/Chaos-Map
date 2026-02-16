# requirements.md — Python Symbolic Codegen Server

---

# 1. Project Context

This service is part of a real-time nonlinear dynamics visualization platform.

The overall system:

* Allows users to explore chaotic ODE systems in the browser.
* Computes FTLE fields and trajectories entirely on the GPU.
* Uses dynamically generated GLSL shaders for system-specific math.
* Supports both RK4 and Störmer–Verlet integration.
* Allows interactive parameter changes and dimension navigation.

The Python server:

* Does **not** simulate systems.
* Does **not** render anything.
* Only performs symbolic processing and GLSL code generation.
* Must be deterministic, secure, and testable.

It is exposed to the internet and must be hardened accordingly.

---

# 2. Responsibilities

The server must:

1. Parse symbolic system definitions.
2. Validate mathematical consistency.
3. Generate:

   * RHS functions (generic ODE systems)
   * Continuous Jacobians
   * Hamiltonian partial derivatives
   * Discrete Verlet map Jacobians (if Hamiltonian)
4. Perform algebraic simplification and common subexpression elimination.
5. Emit GLSL code bundles.
6. Provide structured metadata for the client.
7. Reject unsafe or malformed inputs.
8. Provide full integration test coverage.

It must not execute arbitrary user code.

---

# 3. Supported System Types

## 3.1 Generic ODE

Input:

* State variables
* Parameters
* First-order RHS expressions

Generates:

* `system_rhs`
* Continuous Jacobian
* RK4-compatible output

---

## 3.2 Hamiltonian Systems

Input:

* Hamiltonian expression H(q, p)

Generates:

* ∂T/∂p
* ∂V/∂q (or full ∂H derivatives)
* Discrete Verlet update rule
* Jacobian of discrete Verlet map

Must support:

* Arbitrary dimension (2N)
* Parameterized Hamiltonians

---

# 4. API Contract

## POST /generate

### Input

```json
{
  "name": "system_name",
  "structure": "generic" | "hamiltonian",
  "state_variables": [...],
  "parameters": [...],
  "equations": { ... }  // for generic
}
```

OR

```json
{
  "name": "system_name",
  "structure": "hamiltonian",
  "coordinates": ["q1", "q2"],
  "momenta": ["p1", "p2"],
  "parameters": [...],
  "hamiltonian": "..."
}
```

---

### Output

```json
{
  "dimension": N,
  "structure": "...",
  "parameters": [...],
  "state_labels": [...],
  "integrators_supported": ["rk4", "verlet"],
  "glsl": {
    "rhs": "...",
    "jacobian": "...",
    "verlet_step": "...",
    "verlet_map_jacobian": "...",
    "common_subexpressions": "..."
  }
}
```

Unavailable sections must be null.

---

# 5. Symbolic Processing Requirements

* Use SymPy exclusively.
* Perform:

  * Symbol validation
  * Dimension consistency check
  * Jacobian shape validation
  * Simplification
  * Common subexpression elimination
* Avoid uncontrolled expression explosion.
* Enforce maximum expression size threshold.
* Enforce maximum system dimension limit (configurable).

---

# 6. Security Requirements

The server will be publicly accessible.

Therefore:

## 6.1 No Arbitrary Code Execution

* Do not use `eval`.
* Do not allow arbitrary Python execution.
* Only parse symbolic math expressions.

## 6.2 Resource Limits

Must enforce:

* Max equation length
* Max symbol count
* Max simplification time
* Max CPU time per request
* Max memory usage per request

Reject requests exceeding limits.

---

## 6.3 Rate Limiting

* Implement request rate limiting.
* Consider API keys or authentication layer.

---

## 6.4 Sandboxing

Service must:

* Run inside Docker.
* Run as non-root user.
* Disable outbound network access (if possible).
* Restrict file system access.
* Avoid dynamic imports based on user input.

---

# 7. Docker Requirements

* Provide Dockerfile.
* Pin Python and SymPy versions.
* Disable debug mode in production.
* Use minimal base image.
* Expose only required port.
* Health check endpoint required.

---

# 8. Integration Testing Requirements

Integration tests are mandatory.

The implementor must provide:

## 8.1 End-to-End Tests

Given known systems:

* Double pendulum
* Elastic double pendulum
* Hénon–Heiles
* Duffing oscillator

Tests must:

1. Submit system definition.
2. Validate returned GLSL contains required functions.
3. Validate Jacobian dimension matches system dimension.
4. Numerically verify Jacobian correctness.

---

## 8.2 Numerical Jacobian Validation

For generic systems:

* Substitute random numeric values.
* Compute:

  * Symbolic Jacobian
  * Finite-difference Jacobian
* Assert tolerance match.

This prevents silent algebra mistakes.

---

## 8.3 Discrete Map Validation

For Hamiltonian systems:

* Numerically verify discrete Verlet map derivative.
* Compare symbolic map Jacobian against finite-difference derivative of map.

---

## 8.4 Failure Case Tests

Must test:

* Missing symbols
* Mismatched dimensions
* Invalid expressions
* Excessive complexity
* Malformed JSON

Server must return structured error responses.

---

# 9. Determinism Requirements

Given identical input:

* Server must produce identical output.
* No randomness.
* Stable ordering of expressions.
* Stable symbol naming.

---

# 10. Logging and Observability

* Log request metadata (not full equations unless debug).
* Log processing time.
* Log rejection reasons.
* Provide health endpoint.

---

# 11. Performance Requirements

* Target < 1 second for moderate systems (≤ 8D).
* Must degrade gracefully for larger systems.
* Must fail fast on pathological inputs.

---

# 12. Future-Proofing

Design must allow future support for:

* Lyapunov spectrum (multiple deviation vectors)
* Time-dependent forcing
* Parameter sensitivity equations
* Three-body problem
* Higher-dimensional Hamiltonians

---

# 13. Explicit Non-Goals

The server must not:

* Run numerical simulations
* Store user systems long-term
* Persist user data
* Perform rendering
* Provide arbitrary symbolic algebra API

It is a narrow, secure code generation service.

---

# Summary

This backend is a hardened symbolic compilation service that:

* Converts user-defined ODE/Hamiltonian systems into GPU-ready GLSL.
* Supports both RK4 and Störmer–Verlet.
* Provides verified Jacobians.
* Is secured for public internet exposure.
* Is fully containerized.
* Includes mandatory integration testing to prevent mathematical or structural regressions.

It is a compiler, not a compute engine.

