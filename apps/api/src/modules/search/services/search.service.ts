import { Injectable } from '@nestjs/common';
import type { SearchEnvelope, SearchQuery } from '@rytask/contracts';
import { SearchProvider } from '../providers/search.provider';

/**
 * Search application service — the module's public surface (Principle III). Controllers and
 * (future) MCP `search` tool both call this — no parallel logic. Returns the flat ranked
 * `{ data }` envelope (no cursor: the command palette shows a short permission-scoped list).
 */
@Injectable()
export class SearchService {
  constructor(private readonly provider: SearchProvider) {}

  async search(query: SearchQuery): Promise<SearchEnvelope> {
    const data = await this.provider.search(query);
    return { data };
  }
}
