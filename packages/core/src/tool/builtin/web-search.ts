import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchBackend {
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

export interface FetchSearchConfig {
  /** API endpoint URL. Supports {query} and {maxResults} placeholders. */
  endpoint: string;
  /** Headers to include (e.g. Authorization for paid APIs). */
  headers?: Record<string, string>;
  /** Extract SearchResult[] from the JSON response body. */
  extractResults: (data: unknown) => SearchResult[];
}

export class FetchSearchBackend implements SearchBackend {
  constructor(private config: FetchSearchConfig) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = this.config.endpoint
      .replace('{query}', encodeURIComponent(query))
      .replace('{maxResults}', String(maxResults));

    const res = await fetch(url, { headers: this.config.headers });
    if (!res.ok) {
      throw new Error(`Search API returned HTTP ${res.status}`);
    }
    const data = await res.json();
    return this.config.extractResults(data);
  }
}

export class WebSearchTool implements BuiltInTool {
  name = 'web_search';
  description = 'Search the web for information. Returns a list of results with titles, URLs, and snippets.';

  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10).',
      },
    },
    required: ['query'],
  };

  private backend: SearchBackend | null = null;

  setBackend(backend: SearchBackend): void {
    this.backend = backend;
  }

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    if (!this.backend) {
      return {
        content: [{ type: 'text', text: 'Error: no search backend configured. Call webSearchTool.setBackend() first.' }],
        isError: true,
      };
    }

    const query = args.query as string;
    const maxResults = Math.min((args.maxResults as number) || 5, 10);

    if (!query) {
      return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
    }

    try {
      const results = await this.backend.search(query, maxResults);
      const text = results.length === 0
        ? 'No results found.'
        : results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Search error: ${msg}` }], isError: true };
    }
  }
}
