// Basic types for the Agentic Memory System

export type LLMBackend = 'openai' | 'ollama';

export interface LLMResponse {
  content: string;
}

export interface ResponseFormat {
  type: string;
  json_schema?: {
    name: string;
    schema: {
      type: string;
      properties: Record<string, any>;
      required: string[];
      additionalProperties: boolean;
    };
    strict: boolean;
  };
}

export interface MemoryNoteData {
  id?: string;
  content: string;
  keywords?: string[];
  links?: number[];
  importance_score?: number;
  retrieval_count?: number;
  timestamp?: string;
  last_accessed?: string;
  context?: string;
  evolution_history?: any[];
  category?: string;
  tags?: string[];
}

export interface ContentAnalysis {
  keywords: string[];
  context: string;
  tags: string[];
}

export interface EvolutionResponse {
  should_evolve: boolean;
  actions: string[];
  suggested_connections: number[];
  tags_to_update: string[];
  new_context_neighborhood: string[];
  new_tags_neighborhood: string[][];
}

// Dataset types
export interface QA {
  question: string;
  answer: string | null;
  evidence: string[];
  category?: number;
  adversarial_answer?: string | null;
}

export interface Turn {
  speaker: string;
  dia_id: string;
  text: string;
}

export interface Session {
  session_id: number;
  date_time: string;
  turns: Turn[];
}

export interface Conversation {
  speaker_a: string;
  speaker_b: string;
  sessions: Record<number, Session>;
}

export interface EventSummary {
  events: Record<string, Record<string, string[]>>;
}

export interface Observation {
  observations: Record<string, Record<string, string[][]>>;
}

export interface LoCoMoSample {
  sample_id: string;
  qa: QA[];
  conversation: Conversation;
  event_summary: EventSummary;
  observation: Observation;
  session_summary: Record<string, string>;
}

// Metrics types
export interface Metrics {
  exact_match: number;
  f1: number;
  rouge1_f: number;
  rouge2_f: number;
  rougeL_f: number;
  bleu1: number;
  bleu2: number;
  bleu3: number;
  bleu4: number;
  bert_f1: number;
  meteor: number;
  sbert_similarity: number;
}

export interface MetricStats {
  mean: number;
  std: number;
  median: number;
  min: number;
  max: number;
  count: number;
}

export interface AggregateMetrics {
  [key: string]: Record<string, MetricStats>;
}

export interface EvaluationResult {
  sample_id: number;
  question: string;
  prediction: string;
  reference: string | null;
  category: number;
  metrics: Metrics;
}

export interface FinalResults {
  model: string;
  dataset: string;
  total_questions: number;
  category_distribution: Record<string, number>;
  aggregate_metrics: AggregateMetrics;
  individual_results: EvaluationResult[];
}
