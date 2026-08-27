import { ToolPlugin, SearchResult, PageContent } from '../../src/kernel/types';
import { MCPStdioClient, MCPStdioClientOptions } from '../../src/kernel/mcp-stdio-client';

export class UnifiedFetchTool implements ToolPlugin {
  id = 'unified-fetch';
  capabilities = ['search', 'scrape'];
  private readonly client?: MCPStdioClient;

  constructor(options?: MCPStdioClientOptions) { this.client = options ? new MCPStdioClient(options) : undefined; }

  async call(operation: string, params: any): Promise<any> {
    switch (operation) {
      case 'search': return this.search(params.query, params.maxResults);
      case 'scrape': return this.scrape(params.url, params.focus);
      case 'status': return this.status();
      default: throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!query) throw new Error('Search query is required');
    if (this.client) {
      await this.client.initialize();
      return this.unwrap(await this.client.callTool('search', { query, max_results: maxResults })) as SearchResult[];
    }
    return [{ url: 'https://example.com/result', title: `Search results for: ${query}`, snippet: 'Synthetic fallback; MCP service unavailable', source_engine: 'unified-fetch', synthetic: true, available: false }];
  }

  async scrape(url: string, focus?: string): Promise<PageContent> {
    if (!url) throw new Error('URL is required');
    if (this.client) {
      await this.client.initialize();
      return this.unwrap(await this.client.callTool('scrape', { url, ...(focus === undefined ? {} : { focus }) })) as PageContent;
    }
    return { url, title: 'Scraped page', content: 'Synthetic fallback; MCP service unavailable', content_ok: false, engine_used: 'unavailable', synthetic: true, available: false };
  }

  async status(): Promise<any> {
    if (this.client) { await this.client.initialize(); return this.unwrap(await this.client.callTool('status', {})); }
    return { available: false, synthetic: true, engines: [] };
  }

  async close(): Promise<void> { await this.client?.close(); }

  private unwrap(result: any): any {
    if (result && Array.isArray(result.content)) {
      const text = result.content.find((item: any) => item.type === 'text')?.text;
      if (typeof text === 'string') { try { return JSON.parse(text); } catch { return text; } }
    }
    return result;
  }
}

export default UnifiedFetchTool;
