export interface Env {
  ENVIRONMENT: 'development' | 'staging' | 'production';

  // Secrets
  SCRAPE_CREATORS_API_KEY: string;
  LOOPS_API_KEY: string;

  // Pushover
  PUSHOVER_TOKEN: string;
  PUSHOVER_USER_KEY: string;

  // LLM Bindings (required by @latimer-woods-tech/llm)
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;

  // Bindings
  LEAD_GEN_QUEUE: Queue;
}
