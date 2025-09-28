import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export class WebFetchTool implements Tool {
  name = 'webfetch';
  description = 'Fetch content from web URLs. Use this tool to get real-time information from websites, documentation, or any web resource.';
  parameters = z.object({
    url: z.string().url().describe('The URL to fetch content from'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET').describe('HTTP method to use'),
    headers: z.record(z.string()).optional().describe('HTTP headers to include in the request'),
    body: z.string().optional().describe('Request body (for POST/PUT requests)'),
    timeout: z.number().default(10000).describe('Request timeout in milliseconds (default: 10000)')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { url, method = 'GET', headers = {}, body, timeout = 10000 } = args;

      // Security check - only allow HTTP/HTTPS URLs
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          success: false,
          output: '',
          error: 'Only HTTP and HTTPS URLs are allowed'
        };
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'User-Agent': 'PodCode-WebFetch/1.0',
            ...headers
          },
          signal: controller.signal
        };

        if (body && (method === 'POST' || method === 'PUT')) {
          fetchOptions.body = body;
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          return {
            success: false,
            output: '',
            error: `HTTP ${response.status}: ${response.statusText}`
          };
        }

        const contentType = response.headers.get('content-type') || '';
        
        // Handle different content types
        if (contentType.includes('application/json')) {
          const jsonData = await response.json();
          return {
            success: true,
            output: `📄 JSON Response from ${url}:\n${JSON.stringify(jsonData, null, 2)}`
          };
        } else if (contentType.includes('text/')) {
          const textData = await response.text();
          // Truncate very long responses
          const truncatedText = textData.length > 10000 
            ? textData.substring(0, 10000) + '\n\n... (truncated)'
            : textData;
          
          return {
            success: true,
            output: `📄 Text Response from ${url}:\n${truncatedText}`
          };
        } else {
          return {
            success: true,
            output: `📄 Binary Response from ${url} (Content-Type: ${contentType})\nResponse size: ${response.headers.get('content-length') || 'unknown'} bytes`
          };
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          return {
            success: false,
            output: '',
            error: `Request timeout after ${timeout}ms`
          };
        }
        
        throw fetchError;
      }

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `WebFetch error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
            url: {
              type: 'string',
              format: 'uri',
              description: 'The URL to fetch content from'
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              default: 'GET',
              description: 'HTTP method to use'
            },
            headers: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              },
              description: 'HTTP headers to include in the request'
            },
            body: {
              type: 'string',
              description: 'Request body (for POST/PUT requests)'
            },
            timeout: {
              type: 'number',
              default: 10000,
              description: 'Request timeout in milliseconds (default: 10000)'
            }
          },
          required: ['url']
        }
      }
    };
  }
}
