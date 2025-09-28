import OpenAI from 'openai';
import { config } from './config.js';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class AIClient {
  private openai: OpenAI;
  private model: string;
  private temperature: number;

  constructor() {
    const cfg = config.get();
    
    this.openai = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
    });
    
    this.model = cfg.model;
    this.temperature = cfg.temperature;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  ) {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature: this.temperature,
      stream: false
    });

    return response;
  }

  async *chatStream(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
  ) {
    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature: this.temperature,
      stream: true
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}

