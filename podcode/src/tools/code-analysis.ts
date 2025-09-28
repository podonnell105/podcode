import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { readFileSync, statSync } from 'fs';
import { extname, basename } from 'path';

interface CodeMetrics {
  lines: number;
  characters: number;
  functions: number;
  classes: number;
  imports: number;
  comments: number;
  complexity: 'low' | 'medium' | 'high';
}

export class CodeAnalysisTool implements Tool {
  name = 'code_analysis';
  description = 'Analyze code files for metrics, patterns, and quality indicators. Provides insights into code structure, complexity, and potential issues.';
  parameters = z.object({
    file_path: z.string().describe('Path to the code file to analyze'),
    analysis_type: z.enum(['metrics', 'structure', 'quality', 'security', 'performance', 'all']).default('all').describe('Type of analysis to perform'),
    include_suggestions: z.boolean().default(true).describe('Whether to include improvement suggestions'),
    working_directory: z.string().optional().describe('Working directory for relative paths')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { 
        file_path, 
        analysis_type = 'all', 
        include_suggestions = true,
        working_directory = context.workingDirectory 
      } = args;

      // Resolve file path
      const fullPath = file_path.startsWith('/') 
        ? file_path 
        : `${working_directory}/${file_path}`;

      // Check if file exists
      try {
        const stats = statSync(fullPath);
        if (!stats.isFile()) {
          return {
            success: false,
            output: '',
            error: `Path is not a file: ${fullPath}`
          };
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `File not found: ${fullPath}`
        };
      }

      // Read file content
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const fileName = basename(fullPath);
      const fileExt = extname(fullPath);

      // Perform analysis based on type
      let analysis = '';

      if (analysis_type === 'metrics' || analysis_type === 'all') {
        analysis += this.analyzeMetrics(content, lines, fileName, fileExt);
      }

      if (analysis_type === 'structure' || analysis_type === 'all') {
        analysis += this.analyzeStructure(content, lines, fileName, fileExt);
      }

      if (analysis_type === 'quality' || analysis_type === 'all') {
        analysis += this.analyzeQuality(content, lines, fileName, fileExt);
      }

      if (analysis_type === 'security' || analysis_type === 'all') {
        analysis += this.analyzeSecurity(content, lines, fileName, fileExt);
      }

      if (analysis_type === 'performance' || analysis_type === 'all') {
        analysis += this.analyzePerformance(content, lines, fileName, fileExt);
      }

      if (include_suggestions) {
        analysis += this.generateSuggestions(content, lines, fileName, fileExt);
      }

      return {
        success: true,
        output: `📊 **Code Analysis Report for ${fileName}**\n\n${analysis}`
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Code analysis error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private analyzeMetrics(content: string, lines: string[], fileName: string, fileExt: string): string {
    const metrics: CodeMetrics = {
      lines: lines.length,
      characters: content.length,
      functions: this.countFunctions(content, fileExt),
      classes: this.countClasses(content, fileExt),
      imports: this.countImports(content, fileExt),
      comments: this.countComments(content, fileExt),
      complexity: this.calculateComplexity(content, fileExt)
    };

    return `## 📈 **Metrics**
- **Total Lines:** ${metrics.lines}
- **Characters:** ${metrics.characters.toLocaleString()}
- **Functions:** ${metrics.functions}
- **Classes:** ${metrics.classes}
- **Imports:** ${metrics.imports}
- **Comments:** ${metrics.comments}
- **Complexity:** ${metrics.complexity.toUpperCase()}
- **Comment Ratio:** ${((metrics.comments / metrics.lines) * 100).toFixed(1)}%

`;
  }

  private analyzeStructure(content: string, lines: string[], fileName: string, fileExt: string): string {
    const structure = this.extractStructure(content, fileExt);
    
    return `## 🏗️ **Structure Analysis**
${structure}

`;
  }

  private analyzeQuality(content: string, lines: string[], fileName: string, fileExt: string): string {
    const issues = this.findQualityIssues(content, lines, fileExt);
    
    if (issues.length === 0) {
      return `## ✅ **Quality Analysis**
No major quality issues detected.

`;
    }

    return `## ⚠️ **Quality Issues**
${issues.map(issue => `- ${issue}`).join('\n')}

`;
  }

  private analyzeSecurity(content: string, lines: string[], fileName: string, fileExt: string): string {
    const securityIssues = this.findSecurityIssues(content, fileExt);
    
    if (securityIssues.length === 0) {
      return `## 🔒 **Security Analysis**
No obvious security vulnerabilities detected.

`;
    }

    return `## 🚨 **Security Issues**
${securityIssues.map(issue => `- ${issue}`).join('\n')}

`;
  }

  private analyzePerformance(content: string, lines: string[], fileName: string, fileExt: string): string {
    const performanceIssues = this.findPerformanceIssues(content, fileExt);
    
    if (performanceIssues.length === 0) {
      return `## ⚡ **Performance Analysis**
No obvious performance issues detected.

`;
    }

    return `## 🐌 **Performance Issues**
${performanceIssues.map(issue => `- ${issue}`).join('\n')}

`;
  }

  private generateSuggestions(content: string, lines: string[], fileName: string, fileExt: string): string {
    const suggestions = this.generateImprovementSuggestions(content, lines, fileExt);
    
    if (suggestions.length === 0) {
      return `## 💡 **Suggestions**
Code looks good! No specific suggestions at this time.

`;
    }

    return `## 💡 **Improvement Suggestions**
${suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

`;
  }

  // Helper methods for analysis
  private countFunctions(content: string, fileExt: string): number {
    const patterns = {
      '.js': /function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(/g,
      '.ts': /function\s+\w+|const\s+\w+\s*=\s*(?:async\s+)?\(|export\s+(?:async\s+)?function/g,
      '.py': /def\s+\w+/g,
      '.java': /(?:public|private|protected)?\s*(?:static\s+)?\w+\s+\w+\s*\(/g,
      '.cpp': /(?:void|int|string|bool|auto)\s+\w+\s*\(/g,
      '.c': /(?:void|int|char|float|double)\s+\w+\s*\(/g
    };
    
    const pattern = patterns[fileExt as keyof typeof patterns] || patterns['.js'];
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private countClasses(content: string, fileExt: string): number {
    const patterns = {
      '.js': /class\s+\w+/g,
      '.ts': /class\s+\w+/g,
      '.py': /class\s+\w+/g,
      '.java': /(?:public\s+)?class\s+\w+/g,
      '.cpp': /class\s+\w+/g,
      '.c': /struct\s+\w+/g
    };
    
    const pattern = patterns[fileExt as keyof typeof patterns] || patterns['.js'];
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private countImports(content: string, fileExt: string): number {
    const patterns = {
      '.js': /import\s+.*from|require\s*\(/g,
      '.ts': /import\s+.*from/g,
      '.py': /import\s+\w+|from\s+\w+\s+import/g,
      '.java': /import\s+\w+/g,
      '.cpp': /#include\s*<|#include\s*"/g,
      '.c': /#include\s*<|#include\s*"/g
    };
    
    const pattern = patterns[fileExt as keyof typeof patterns] || patterns['.js'];
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private countComments(content: string, fileExt: string): number {
    const patterns = {
      '.js': /\/\/.*|\/\*[\s\S]*?\*\//g,
      '.ts': /\/\/.*|\/\*[\s\S]*?\*\//g,
      '.py': /#.*|""".*?"""|'''.*?'''/g,
      '.java': /\/\/.*|\/\*[\s\S]*?\*\//g,
      '.cpp': /\/\/.*|\/\*[\s\S]*?\*\//g,
      '.c': /\/\/.*|\/\*[\s\S]*?\*\//g
    };
    
    const pattern = patterns[fileExt as keyof typeof patterns] || patterns['.js'];
    const matches = content.match(pattern);
    return matches ? matches.length : 0;
  }

  private calculateComplexity(content: string, fileExt: string): 'low' | 'medium' | 'high' {
    const lines = content.split('\n');
    const complexityIndicators = [
      /if\s*\(/g, /else\s*{/g, /for\s*\(/g, /while\s*\(/g, /switch\s*\(/g,
      /catch\s*\(/g, /try\s*{/g, /case\s+/g, /&&/g, /\|\|/g
    ];
    
    let complexityScore = 0;
    complexityIndicators.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) complexityScore += matches.length;
    });
    
    if (complexityScore < 10) return 'low';
    if (complexityScore < 25) return 'medium';
    return 'high';
  }

  private extractStructure(content: string, fileExt: string): string {
    // This is a simplified structure extraction
    const lines = content.split('\n');
    const structure: string[] = [];
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.match(/^(function|class|const|let|var|export|import)/)) {
        structure.push(`Line ${index + 1}: ${trimmed.substring(0, 80)}${trimmed.length > 80 ? '...' : ''}`);
      }
    });
    
    return structure.length > 0 
      ? structure.slice(0, 10).join('\n') + (structure.length > 10 ? '\n...' : '')
      : 'No major structural elements detected';
  }

  private findQualityIssues(content: string, lines: string[], fileExt: string): string[] {
    const issues: string[] = [];
    
    // Check for long lines
    lines.forEach((line, index) => {
      if (line.length > 120) {
        issues.push(`Line ${index + 1}: Line too long (${line.length} characters)`);
      }
    });
    
    // Check for TODO/FIXME comments
    const todoMatches = content.match(/(TODO|FIXME|HACK|XXX):\s*(.+)/gi);
    if (todoMatches) {
      issues.push(`${todoMatches.length} TODO/FIXME comments found`);
    }
    
    // Check for console.log in production code
    if (content.includes('console.log') && !content.includes('// console.log')) {
      issues.push('Console.log statements found (consider removing for production)');
    }
    
    return issues.slice(0, 10); // Limit to 10 issues
  }

  private findSecurityIssues(content: string, fileExt: string): string[] {
    const issues: string[] = [];
    
    // Check for common security issues
    const securityPatterns = [
      { pattern: /eval\s*\(/g, message: 'eval() usage detected - potential security risk' },
      { pattern: /innerHTML\s*=/g, message: 'innerHTML usage detected - potential XSS risk' },
      { pattern: /document\.write/g, message: 'document.write usage detected - potential XSS risk' },
      { pattern: /password\s*=\s*["'][^"']*["']/gi, message: 'Hardcoded password detected' },
      { pattern: /api[_-]?key\s*=\s*["'][^"']*["']/gi, message: 'Hardcoded API key detected' }
    ];
    
    securityPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(content)) {
        issues.push(message);
      }
    });
    
    return issues;
  }

  private findPerformanceIssues(content: string, fileExt: string): string[] {
    const issues: string[] = [];
    
    // Check for common performance issues
    const performancePatterns = [
      { pattern: /for\s*\(\s*var\s+/g, message: 'var in for loop - consider using let' },
      { pattern: /document\.getElementById/g, message: 'Multiple getElementById calls - consider caching' },
      { pattern: /setInterval\s*\(/g, message: 'setInterval usage - ensure proper cleanup' },
      { pattern: /setTimeout\s*\(/g, message: 'setTimeout usage - ensure proper cleanup' }
    ];
    
    performancePatterns.forEach(({ pattern, message }) => {
      if (pattern.test(content)) {
        issues.push(message);
      }
    });
    
    return issues;
  }

  private generateImprovementSuggestions(content: string, lines: string[], fileExt: string): string[] {
    const suggestions: string[] = [];
    
    // Generate suggestions based on analysis
    if (lines.length > 200) {
      suggestions.push('Consider breaking this file into smaller modules');
    }
    
    if (this.countComments(content, fileExt) < lines.length * 0.1) {
      suggestions.push('Add more comments to improve code documentation');
    }
    
    if (this.calculateComplexity(content, fileExt) === 'high') {
      suggestions.push('Consider refactoring to reduce complexity');
    }
    
    if (content.includes('console.log')) {
      suggestions.push('Remove or replace console.log statements with proper logging');
    }
    
    return suggestions;
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
            file_path: {
              type: 'string',
              description: 'Path to the code file to analyze'
            },
            analysis_type: {
              type: 'string',
              enum: ['metrics', 'structure', 'quality', 'security', 'performance', 'all'],
              default: 'all',
              description: 'Type of analysis to perform'
            },
            include_suggestions: {
              type: 'boolean',
              default: true,
              description: 'Whether to include improvement suggestions'
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for relative paths'
            }
          },
          required: ['file_path']
        }
      }
    };
  }
}
