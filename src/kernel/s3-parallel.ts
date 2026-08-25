// ============================================================
// Stage 3 平行化引擎
// 多假設 × 多引擎 × scrape 並行執行，合併結果。
// ============================================================
import { SearchResult, PageContent } from './types';

export interface VerificationTask {
  hypothesis: string;
  query: string;
  engine: string;
  focus?: string;
}

export interface VerificationResult {
  hypothesis: string;
  query: string;
  engine: string;
  search_results: SearchResult[];
  pages: PageContent[];
  engine_available: boolean;
  error?: string;
}

export interface MergedEvidence {
  hypothesis: string;
  sources: { url: string; title: string; tier: string }[];
  evidence_summary: string;
  confidence_bucket: 'high' | 'medium' | 'low';
  has_negative_evidence: boolean;
  negative_evidence: string[];
}

/**
 * 建立驗證任務清單（假設 × 引擎 × query）
 */
export function createVerificationTasks(
  hypotheses: string[],
  base_query: string,
  engines: string[] = ['unified-fetch'],
  domain?: string,
): VerificationTask[] {
  const tasks: VerificationTask[] = [];
  for (const hypothesis of hypotheses) {
    for (const engine of engines) {
      const domainSuffix = domain ? ` ${domain}` : '';
      tasks.push({
        hypothesis,
        query: `${base_query} ${hypothesis}${domainSuffix}`,
        engine,
      });
      // 負面搜尋（逢正必反）
      tasks.push({
        hypothesis,
        query: `${base_query} ${hypothesis} limitations drawbacks${domainSuffix}`,
        engine,
        focus: 'limitations and drawbacks',
      });
    }
  }
  return tasks;
}

/**
 * 合併多 subagent 的回傳結果
 */
export function mergeEvidence(results: VerificationResult[]): MergedEvidence[] {
  const byHypothesis = new Map<string, VerificationResult[]>();

  for (const r of results) {
    const existing = byHypothesis.get(r.hypothesis) || [];
    existing.push(r);
    byHypothesis.set(r.hypothesis, existing);
  }

  const merged: MergedEvidence[] = [];

  for (const [hypothesis, hypothesisResults] of byHypothesis) {
    const allSources = hypothesisResults.flatMap(r => r.search_results);
    const allPages = hypothesisResults.flatMap(r => r.pages);
    const hasNegative = hypothesisResults.some(r =>
      r.query.includes('limitations') || r.query.includes('drawbacks')
    );

    // 檢查是否有負面證據
    const negativeEvidence: string[] = [];
    if (hasNegative) {
      for (const result of hypothesisResults) {
        if (result.query.includes('limitations') || result.query.includes('drawbacks')) {
          for (const page of result.pages) {
            if (page.content_ok) {
              negativeEvidence.push(page.content.slice(0, 100));
            }
          }
        }
      }
    }

    // 信心評估
    const confidence: 'high' | 'medium' | 'low' =
      allSources.length >= 3 ? 'high'
      : allSources.length >= 1 ? 'medium'
      : 'low';

    merged.push({
      hypothesis,
      sources: allSources.slice(0, 5).map(s => ({
        url: s.url,
        title: s.title,
        tier: 'T3',  // 預設 T3，實際由 precision.ts 評估
      })),
      evidence_summary: `${allSources.length} sources, ${allPages.length} pages scraped`,
      confidence_bucket: confidence,
      has_negative_evidence: negativeEvidence.length > 0,
      negative_evidence: negativeEvidence.slice(0, 3),
    });
  }

  return merged;
}

/**
 * 跨來源驗證
 */
export function crossValidate(evidence: MergedEvidence[]): {
  has_multiple_sources: boolean;
  has_discrepancy: boolean;
  consensus_range?: string;
} {
  const totalSources = evidence.reduce((sum, e) => sum + e.sources.length, 0);
  return {
    has_multiple_sources: totalSources >= 2,
    has_discrepancy: evidence.some(e => e.has_negative_evidence),
    consensus_range: 'median of available sources',
  };
}