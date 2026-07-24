const CACHED_READ_PRICES: Record<string, string> = {
  // OpenAI
  "gpt-4.1": "0.5",
  "gpt-4.1-mini": "0.1",
  "gpt-4.1-nano": "0.025",
  "gpt-4o": "1.25",
  "gpt-4o-2024-08-06": "1.25",
  "gpt-4o-2024-11-20": "1.25",
  "gpt-4o-mini": "0.075",
  "gpt-5": "0.125",
  "gpt-5-chat-latest": "0.125",
  "gpt-5-codex": "0.125",
  "gpt-5-mini": "0.025",
  "gpt-5-nano": "0.005",
  "gpt-5.1": "0.125",
  "gpt-5.1-chat-latest": "0.125",
  "gpt-5.1-codex": "0.125",
  "gpt-5.1-codex-max": "0.125",
  "gpt-5.1-codex-mini": "0.025",
  "gpt-5.2": "0.175",
  "gpt-5.2-chat-latest": "0.175",
  "gpt-5.2-codex": "0.175",
  "gpt-5.3-chat-latest": "0.175",
  "gpt-5.3-codex": "0.175",
  "gpt-5.3-codex-spark": "0.175",
  "gpt-5.4": "0.25",
  "gpt-5.4-mini": "0.075",
  "gpt-5.4-nano": "0.02",
  "gpt-5.5": "0.5",
  "gpt-5.6": "0.5",
  "gpt-5.6-sol": "0.5",
  "gpt-5.6-terra": "0.25",
  "gpt-5.6-luna": "0.1",
  o1: "7.5",
  o3: "0.5",
  "o3-mini": "0.55",
  "o4-mini": "0.275",

  // DeepSeek
  "deepseek-chat": "0.0028",
  "deepseek-reasoner": "0.0028",
  "deepseek-v4-flash": "0.0028",
  "deepseek-v4-pro": "0.003625",

  // GLM (Zhipu)
  "glm-4.5": "0.11",
  "glm-4.5-air": "0.03",
  "glm-4.6": "0.11",
  "glm-4.7": "0.11",
  "glm-4.7-flashx": "0.01",
  "glm-5": "0.2",
  "glm-5-turbo": "0.24",
  "glm-5.1": "0.26",
  "glm-5.2": "0.26",
  "glm-5v-turbo": "0.24",

  // xAI (Grok)
  "grok-4.20-0309-non-reasoning": "0.2",
  "grok-4.20-0309-reasoning": "0.2",
  "grok-4.20-multi-agent-0309": "0.2",
  "grok-4.3": "0.2",
  "grok-4.5": "0.3",
  "grok-build-0.1": "0.2",

  // Moonshot (Kimi)
  "kimi-k2-0711-preview": "0.15",
  "kimi-k2-0905-preview": "0.15",
  "kimi-k2-thinking": "0.15",
  "kimi-k2-thinking-turbo": "0.15",
  "kimi-k2-turbo-preview": "0.6",
  "kimi-k2.5": "0.1",
  "kimi-k2.6": "0.16",
  "kimi-k2.7-code": "0.19",
  "kimi-k2.7-code-highspeed": "0.38",
  "kimi-k3": "0.3",

  // MiMo
  "mimo-v2-flash": "0.0028",
  "mimo-v2-omni": "0.0028",
  "mimo-v2-pro": "0.0036",
  "mimo-v2.5": "0.0028",
  "mimo-v2.5-pro": "0.0036",
  "mimo-v2.5-pro-ultraspeed": "0.0108",

  // MiniMax
  "MiniMax-M2.5": "0.03",
  "MiniMax-M2.5-highspeed": "0.06",
  "MiniMax-M2.7": "0.06",
  "MiniMax-M2.7-highspeed": "0.06",
  "MiniMax-M3": "0.06",

  // Anthropic
  "claude-3-5-sonnet-20240620": "0.3",
  "claude-3-5-sonnet-20241022": "0.3",
  "claude-3-7-sonnet-20250219": "0.3",
  "claude-3-haiku-20240307": "0.03",
  "claude-3-opus-20240229": "1.5",
  "claude-3-sonnet-20240229": "0.3",
  "claude-fable-5": "1",
  "claude-haiku-4-5": "0.1",
  "claude-haiku-4-5-20251001": "0.1",
  "claude-opus-4-0": "1.5",
  "claude-opus-4-1": "1.5",
  "claude-opus-4-1-20250805": "1.5",
  "claude-opus-4-20250514": "1.5",
  "claude-opus-4-5": "0.5",
  "claude-opus-4-5-20251101": "0.5",
  "claude-opus-4-6": "0.5",
  "claude-opus-4-7": "0.5",
  "claude-opus-4-8": "0.5",
  "claude-sonnet-4-0": "0.3",
  "claude-sonnet-4-20250514": "0.3",
  "claude-sonnet-4-5": "0.3",
  "claude-sonnet-4-5-20250929": "0.3",
  "claude-sonnet-4-6": "0.3",
  "claude-sonnet-5": "0.2",

  // Google Gemini
  "gemini-2.0-flash": "0.025",
  "gemini-2.5-flash": "0.03",
  "gemini-2.5-flash-image": "0.075",
  "gemini-2.5-flash-lite": "0.01",
  "gemini-2.5-pro": "0.125",
  "gemini-3-flash-preview": "0.05",
  "gemini-3-pro-preview": "0.2",
  "gemini-3.1-flash-lite": "0.025",
  "gemini-3.1-flash-lite-preview": "0.025",
  "gemini-3.1-pro-preview": "0.2",
  "gemini-3.1-pro-preview-customtools": "0.2",
  "gemini-3.5-flash": "0.15",
  "gemini-flash-latest": "0.075",
  "gemini-flash-lite-latest": "0.025",

  // Qwen (Alibaba)
  "qwen3.6-max-preview": "0.13",
  "qwen3.6-plus": "0.05",
  "qwen3.7-max": "0.5",
  "qwen3.7-plus": "0.05",
};

export function getCachedReadPrice(modelId: string): number | null {
  const price = CACHED_READ_PRICES[modelId];
  if (!price) {
    return null;
  }
  return parseFloat(price);
}
