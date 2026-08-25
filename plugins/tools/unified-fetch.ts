// ============================================================
// unified-fetch MCP Tool Plugin
// 透過 MCP 呼叫 unified-fetch 進行搜尋和爬取。
// ============================================================
import { ToolPlugin, SearchResult, PageContent } from '../../src/kernel/types';

/**
 * unified-fetch MCP adapter。
 * 包裝 mcp__unified-fetch__search / scrape / status。
 */
export class UnifiedFetchTool implements ToolPlugin {
  id = 'unified-fetch';
  capabilities = ['search', 'scrape'];

  async call(operation: string, params: any): Promise<any> {
    switch (operation) {
      case 'search': return this.search(params.query, params.maxResults);
      case 'scrape': return this.scrape(params.url, params.focus);
      case 'status': return this.status();
      default: throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async search(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    // 在實際執行中，這個方法會呼叫：
    // mcp__unified-fetch__search({ query, max_results: maxResults })
    //
    // 這裡只做合約驗證
    if (!query) throw new Error('Search query is required');

    return [{
      url: 'https://example.com/result',
      title: `Search results for: ${query}`,
      snippet: `Results from unified-fetch multi-engine search (Hound → DDG → Google → Direct)`,
      source_engine: 'unified-fetch',
    }];
  }

  async scrape(url: string, focus?: string): Promise<PageContent> {
    // 在實際執行中，這個方法會呼叫：
    // mcp__unified-fetch__scrape({ url, focus })
    if (!url) throw new Error('URL is required');

    return {
      url,
      title: 'Scraped page',
      content: `Content from unified-fetch multi-engine scrape (Hound → newspaper3k → Trafilatura → readability → jusText → DirectFetch)`,
      content_ok: true,
      engine_used: 'unified-fetch',
    };
  }

  async status(): Promise<any> {
    // 在實際執行中，這個方法會呼叫：
    // mcp__unified-fetch__status()
    return {
      available: true,
      engines: ['hound', 'duckduckgo', 'trafilatura', 'newspaper'],
    };
  }
}

export default UnifiedFetchTool;