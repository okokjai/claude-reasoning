/** Search results are raw and unread: the kernel never inspects page content. */
export interface ToolResult {
  url: string;
  title: string;
  snippet: string;
}

/** Retrieval is a passive dependency, injected like LlmInvoker. Kernel never imports a concrete backend. */
export interface ToolAdapter {
  search(query: string, maxResults?: number): Promise<ToolResult[]>;
}
