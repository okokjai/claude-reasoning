// src/index.ts — programmatic library entry (spec §10.1)
export { reason, resume, buildReasoningGraph } from "./kernel/executor.js";
export type { GraphState } from "./kernel/types.js";
export type { LlmInvoker } from "./kernel/invoker.js";
export { HttpInvoker, type HttpInvokerConfig } from "./adapters/http-invoker.js";
