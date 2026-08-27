import { ToolPlugin } from '../../src/kernel/types';
import type { AppConfig } from '../../src/kernel/config-loader';
import { SeqThinkingTool } from './seq-thinking';
import { UnifiedFetchTool } from './unified-fetch';
import { DshLogTool } from './dsh-log';

export interface ToolRegistry {
  getTool(id: string): ToolPlugin | undefined;
  listTools(): ToolPlugin[];
  getToolsByCapability(capability: string): ToolPlugin[];
  close(): Promise<void>;
}

export function createToolRegistry(config?: Pick<AppConfig, 'mcp_servers' | 'tools'>): ToolRegistry {
  const servers = config?.mcp_servers ?? {};
  const tools: ToolPlugin[] = [
    new SeqThinkingTool(servers['sequential-thinking']),
    new UnifiedFetchTool(servers['unified-fetch']),
    new DshLogTool(),
  ];
  const configuredIds = new Set<string>(Object.values(config?.tools ?? {}));
  for (const id of configuredIds) {
    if (tools.some((tool) => tool.id === id)) continue;
    const server = servers[id];
    if (!server) continue;
    const capabilities = id === config?.tools['reasoning-logger'] ? ['reasoning-logger'] : ['search', 'scrape'];
    const base = capabilities.includes('reasoning-logger') ? new SeqThinkingTool(server) : new UnifiedFetchTool(server);
    tools.push(Object.assign(base, { id, capabilities }));
  }
  return {
    getTool: (id) => tools.find((tool) => tool.id === id),
    listTools: () => tools,
    getToolsByCapability: (capability) => tools.filter((tool) => tool.capabilities.includes(capability)),
    close: async () => { await Promise.all(tools.map((tool) => (tool as ToolPlugin & { close?: () => Promise<void> }).close?.())); },
  };
}

const defaultRegistry = createToolRegistry();
export function getTool(id: string): ToolPlugin | undefined { return defaultRegistry.getTool(id); }
export function listTools(): ToolPlugin[] { return defaultRegistry.listTools(); }
export function getToolsByCapability(capability: string): ToolPlugin[] { return defaultRegistry.getToolsByCapability(capability); }
