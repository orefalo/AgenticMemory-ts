import { LLMBackend, ResponseFormat } from '../types';
import OpenAI from 'openai';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Abstract base class for LLM controllers
 */
export abstract class BaseLLMController {
  /**
   * Get completion from LLM
   * @param prompt Prompt to send to LLM
   * @param responseFormat Format for the response
   * @param temperature Temperature for generation
   */
  abstract getCompletion(
    prompt: string, 
    responseFormat: ResponseFormat, 
    temperature?: number
  ): Promise<string>;
}

/**
 * OpenAI controller implementation
 */
export class OpenAIController extends BaseLLMController {
  private client: OpenAI;
  private model: string;

  /**
   * Create a new OpenAI controller
   * @param model Model to use
   * @param apiKey API key (optional, will use env var if not provided)
   */
  constructor(model: string = 'gpt-4', apiKey?: string) {
    super();
    this.model = model;
    
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
    }
    
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Get completion from OpenAI
   * @param prompt Prompt to send to OpenAI
   * @param responseFormat Format for the response
   * @param temperature Temperature for generation
   * @returns Generated text
   */
  async getCompletion(
    prompt: string, 
    responseFormat: ResponseFormat, 
    temperature: number = 0.7
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You must respond with a JSON object.' },
        { role: 'user', content: prompt }
      ],
      response_format: responseFormat as any,
      temperature,
      max_tokens: 1000
    });

    return response.choices[0].message.content || '';
  }
}

/**
 * Ollama controller implementation
 */
export class OllamaController extends BaseLLMController {
  private model: string;

  /**
   * Create a new Ollama controller
   * @param model Model to use
   */
  constructor(model: string = 'llama2') {
    super();
    this.model = model;
  }

  /**
   * Generate empty value based on schema type
   * @param schemaType Schema type
   * @param schemaItems Schema items (for arrays)
   * @returns Empty value
   */
  private generateEmptyValue(schemaType: string, schemaItems?: any): any {
    if (schemaType === 'array') {
      return [];
    } else if (schemaType === 'string') {
      return '';
    } else if (schemaType === 'object') {
      return {};
    } else if (schemaType === 'number') {
      return 0;
    } else if (schemaType === 'boolean') {
      return false;
    }
    return null;
  }

  /**
   * Generate empty response based on schema
   * @param responseFormat Response format
   * @returns Empty response
   */
  private generateEmptyResponse(responseFormat: ResponseFormat): any {
    if (!responseFormat.json_schema) {
      return {};
    }
    
    const schema = responseFormat.json_schema.schema;
    const result: Record<string, any> = {};
    
    if ('properties' in schema) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        result[propName] = this.generateEmptyValue(
          propSchema.type, 
          propSchema.items
        );
      }
    }
    
    return result;
  }

  /**
   * Get completion from Ollama
   * @param prompt Prompt to send to Ollama
   * @param responseFormat Format for the response
   * @param temperature Temperature for generation
   * @returns Generated text
   */
  async getCompletion(
    prompt: string, 
    responseFormat: ResponseFormat, 
    temperature: number = 0.7
  ): Promise<string> {
    try {
      // This is a simplified implementation - in a real app, you'd use the actual Ollama API
      const response = await axios.post('http://localhost:11434/api/chat', {
        model: this.model,
        messages: [
          { role: 'system', content: 'You must respond with a JSON object.' },
          { role: 'user', content: prompt }
        ],
        options: {
          temperature
        }
      });

      return response.data.message.content;
    } catch (error) {
      // Return empty response on error
      const emptyResponse = this.generateEmptyResponse(responseFormat);
      return JSON.stringify(emptyResponse);
    }
  }
}

/**
 * Main LLM controller that selects the appropriate backend
 */
export class LLMController {
  private llm: BaseLLMController;

  /**
   * Create a new LLM controller
   * @param backend Backend to use
   * @param model Model to use
   * @param apiKey API key (for OpenAI)
   */
  constructor(
    backend: LLMBackend = 'openai',
    model: string = 'gpt-4',
    apiKey?: string
  ) {
    if (backend === 'openai') {
      this.llm = new OpenAIController(model, apiKey);
    } else if (backend === 'ollama') {
      this.llm = new OllamaController(model);
    } else {
      throw new Error("Backend must be either 'openai' or 'ollama'");
    }
  }

  /**
   * Get completion from LLM
   * @param prompt Prompt to send to LLM
   * @param responseFormat Format for the response
   * @param temperature Temperature for generation
   * @returns Generated text
   */
  async getCompletion(
    prompt: string, 
    responseFormat: ResponseFormat, 
    temperature: number = 0.7
  ): Promise<string> {
    return this.llm.getCompletion(prompt, responseFormat, temperature);
  }
}
