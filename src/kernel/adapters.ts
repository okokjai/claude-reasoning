// ============================================================
// 能力介面（Tool Plugin 的抽象層）
// Tool plugin 實作這些能力，stage 只認識能力不認識具體工具。
// ============================================================
import { Thought, SearchResult, PageContent } from './types';

export interface ReasoningLogger {
  record(thought: Thought): void;
  getHistory(): Thought[];
}

export interface SearchEngine {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

export interface Scraper {
  scrape(url: string, focus?: string): Promise<PageContent>;
}

// 能力註冊表
export type Capability = 'reasoning-logger' | 'search' | 'scrape';

export const CAPABILITY_NAMES: Record<Capability, string> = {
  'reasoning-logger': 'Reasoning Logger',
  'search': 'Search Engine',
  'scrape': 'Scraper',
};