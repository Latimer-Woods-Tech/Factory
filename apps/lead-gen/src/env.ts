export interface Env {
  ENVIRONMENT: 'development' | 'staging' | 'production';
  
  // Secrets
  SCRAPE_CREATORS_API_KEY: string;
  LOOPS_API_KEY: string;
  
  // Bindings
  LEAD_GEN_QUEUE: Queue;
  
  // LLM Config (injected via @latimer-woods-tech/llm)
  LLM_CONFIG: string;
}