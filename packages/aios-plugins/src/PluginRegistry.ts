export interface LLMCompleteParams {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[];
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{ toolId: string; callId: string; input: Record<string, unknown> }>;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: 'stop' | 'tool_use' | 'max_tokens';
}

export interface LLMPlugin {
  name: string;
  supportedModels: string[];
  complete(params: LLMCompleteParams): Promise<LLMResponse>;
  stream?(params: LLMCompleteParams): AsyncGenerator<string>;
}

export class AnthropicPlugin implements LLMPlugin {
  name = 'anthropic';
  supportedModels = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];

  constructor(private readonly apiKey: string) {}

  async complete(params: LLMCompleteParams): Promise<LLMResponse> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens ?? 4096,
        temperature: params.temperature ?? 0.7,
        system: params.systemPrompt,
        messages: params.messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { content: Array<{type:string;text?:string}>; usage: {input_tokens:number;output_tokens:number}; stop_reason: string };
    const content = data.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    return {
      content,
      usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
      stopReason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason === 'max_tokens' ? 'max_tokens' : 'stop',
    };
  }
}

export class OpenAIPlugin implements LLMPlugin {
  name = 'openai';
  supportedModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];

  constructor(private readonly apiKey: string) {}

  async complete(params: LLMCompleteParams): Promise<LLMResponse> {
    const messages = [
      { role: 'system' as const, content: params.systemPrompt },
      ...params.messages,
    ];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: params.model, max_tokens: params.maxTokens ?? 4096, temperature: params.temperature ?? 0.7, messages }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { choices: Array<{message:{content:string};finish_reason:string}>; usage: {prompt_tokens:number;completion_tokens:number} };
    return {
      content: data.choices[0]?.message.content ?? '',
      usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens },
      stopReason: data.choices[0]?.finish_reason === 'length' ? 'max_tokens' : 'stop',
    };
  }
}

export class PluginRegistry {
  private plugins = new Map<string, LLMPlugin>();

  register(plugin: LLMPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  get(name: string): LLMPlugin | null {
    return this.plugins.get(name) ?? null;
  }

  resolveByModel(model: string): LLMPlugin | null {
    for (const plugin of this.plugins.values()) {
      if (plugin.supportedModels.includes(model)) return plugin;
    }
    return null;
  }

  list(): LLMPlugin[] {
    return [...this.plugins.values()];
  }
}
