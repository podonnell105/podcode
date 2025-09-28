import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ConfigSchema = z.object({
  apiKey: z.string(),
  baseURL: z.string().optional(),
  model: z.string().default('gpt-4'),
  temperature: z.number().min(0).max(2).default(1),
  workingDirectory: z.string().default(process.cwd()),
  mcp: z.record(z.object({
    enabled: z.boolean().default(true),
    type: z.enum(['local', 'remote']),
    command: z.array(z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string()).optional(),
    environment: z.record(z.string()).optional()
  })).default({})
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config | null = null;
  private configPath: string;

  constructor() {
    // Try local config first, then home directory
    const localConfig = join(process.cwd(), 'podcode.json');
    const homeConfig = join(homedir(), '.podcode', 'config.json');
    
    this.configPath = existsSync(localConfig) ? localConfig : homeConfig;
  }

  async load(): Promise<Config> {
    if (this.config) return this.config;

    // Try to load from file
    if (existsSync(this.configPath)) {
      try {
        const raw = readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.config = ConfigSchema.parse(parsed);
        return this.config;
      } catch (error) {
        console.warn(`Failed to load config from ${this.configPath}:`, error);
      }
    }

    // Fallback to environment variables
    const envConfig = {
      apiKey: process.env.OPENAI_API_KEY || process.env.CORPORATE_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || process.env.CORPORATE_BASE_URL,
      model: process.env.OPENAI_MODEL || 'gpt-4',
      temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : 1,
 
      workingDirectory: process.cwd(),
      mcp: {}
    };

    this.config = ConfigSchema.parse(envConfig);
    return this.config;
  }

  get(): Config {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }
}

export const config = new ConfigManager();
