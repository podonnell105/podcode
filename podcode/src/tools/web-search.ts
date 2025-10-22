import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool implements Tool {
  name = 'web_search';
  description = 'Search the web for real-time information about any topic. Use this proactively when you need up-to-date information, documentation, tutorials, or to understand how to accomplish tasks. Examples: "how to create custom field in platform", "best practices for API integration", "CLI command syntax reference".';
  parameters = z.object({
    search_term: z.string().describe('The search term to look up on the web. Be specific and include relevant keywords for better results.'),
    max_results: z.number().default(5).describe('Maximum number of search results to return')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { search_term, max_results = 5 } = args;

      // Use DuckDuckGo HTML search (no API key required)
      const results = await this.searchDuckDuckGo(search_term, max_results);
      
      if (results.length === 0) {
        return {
          success: true,
          output: `🌐 No search results found for "${search_term}". Try different keywords or check your internet connection.`
        };
      }
      
      const formattedResults = results.map((result, index) => 
        `${index + 1}. **${result.title}**\n   URL: ${result.url}\n   ${result.snippet}\n`
      ).join('\n');

      return {
        success: true,
        output: `🌐 Web Search Results for "${search_term}":\n\n${formattedResults}`
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Web search error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      
      // Parse the HTML to extract search results
      const results: SearchResult[] = [];
      
      // Simple regex-based parsing for DuckDuckGo HTML results
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
      
      let match;
      let count = 0;
      
      // Extract URLs and titles
      const urlMatches = [...html.matchAll(resultRegex)];
      const snippetMatches = [...html.matchAll(snippetRegex)];
      
      for (let i = 0; i < Math.min(urlMatches.length, maxResults); i++) {
        const urlMatch = urlMatches[i];
        const snippetMatch = snippetMatches[i];
        
        if (urlMatch && urlMatch[1] && urlMatch[2]) {
          const url = this.decodeHTMLEntities(urlMatch[1]);
          const title = this.stripHtmlTags(this.decodeHTMLEntities(urlMatch[2]));
          const snippet = snippetMatch ? this.stripHtmlTags(this.decodeHTMLEntities(snippetMatch[1])) : '';
          
          // Filter out DuckDuckGo internal links
          if (!url.includes('duckduckgo.com') && url.startsWith('http')) {
            results.push({ title, url, snippet });
            count++;
            if (count >= maxResults) break;
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('DuckDuckGo search failed:', error);
      // Return empty array instead of throwing to allow graceful degradation
      return [];
    }
  }

  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#x2F;': '/',
      '&#x27;': "'"
    };
    
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }

  toOpenAITool(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            search_term: {
              type: 'string',
              description: 'The search term to look up on the web. Be specific and include relevant keywords for better results.'
            },
            max_results: {
              type: 'number',
              default: 5,
              description: 'Maximum number of search results to return'
            },
            language: {
              type: 'string',
              default: 'en',
              description: 'Language for search results'
            },
            region: {
              type: 'string',
              default: 'us',
              description: 'Region for search results'
            }
          },
          required: ['search_term']
        }
      }
    };
  }
}
