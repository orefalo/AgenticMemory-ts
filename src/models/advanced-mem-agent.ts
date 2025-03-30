import { AgenticMemorySystem } from './agentic-memory-system';
import { LLMController } from './llm-controller';
import { LLMBackend } from '../types';

/**
 * Advanced memory agent for evaluation
 */
export class AdvancedMemAgent {
  private memorySystem: AgenticMemorySystem;
  private retrieverLlm: LLMController;
  private retrieveK: number;
  private temperatureC5: number;

  /**
   * Create a new advanced memory agent
   * @param model LLM model to use
   * @param backend LLM backend to use
   * @param retrieveK Number of memories to retrieve
   * @param temperatureC5 Temperature for category 5 questions
   */
  constructor(
    model: string,
    backend: LLMBackend,
    retrieveK: number,
    temperatureC5: number
  ) {
    this.memorySystem = new AgenticMemorySystem(
      'all-MiniLM-L6-v2',
      backend,
      model
    );
    
    this.retrieverLlm = new LLMController(backend, model);
    this.retrieveK = retrieveK;
    this.temperatureC5 = temperatureC5;
  }

  /**
   * Add a memory to the system
   * @param content Memory content
   * @param time Timestamp
   */
  async addMemory(content: string, time?: string): Promise<void> {
    await this.memorySystem.addNote(content, time);
  }

  /**
   * Retrieve memories related to a query
   * @param content Query content
   * @param k Number of memories to retrieve
   * @returns Related memories
   */
  async retrieveMemory(content: string, k: number = 10): Promise<string> {
    return this.memorySystem.findRelatedMemoriesRaw(content, k);
  }

  /**
   * Retrieve memories using LLM
   * @param memoriesText Memories text
   * @param query Query text
   * @returns Relevant parts of memories
   */
  async retrieveMemoryLlm(memoriesText: string, query: string): Promise<string> {
    const prompt = `Given the following conversation memories and a question, select the most relevant parts of the conversation that would help answer the question. Include the date/time if available.

      Conversation memories:
      ${memoriesText}

      Question: ${query}

      Return only the relevant parts of the conversation that would help answer this specific question. Format your response as a JSON object with a "relevant_parts" field containing the selected text. 
      If no parts are relevant, do not do any things just return the input.

      Example response format:
      {"relevant_parts": "2024-01-01: Speaker A said something relevant..."}`;
    
    const response = await this.retrieverLlm.getCompletion(
      prompt,
      {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: {
            type: 'object',
            properties: {
              relevant_parts: {
                type: 'string',
              }
            },
            required: ['relevant_parts'],
            additionalProperties: false
          },
          strict: true
        }
      }
    );
    
    console.log(`response: ${response}`);
    
    try {
      const parsed = JSON.parse(response);
      return parsed.relevant_parts;
    } catch {
      return response;
    }
  }

  /**
   * Generate query keywords using LLM
   * @param question Question text
   * @returns Keywords
   */
  async generateQueryLlm(question: string): Promise<string> {
    const prompt = `Given the following question, generate several keywords, using 'cosmos' as the separator.

      Question: ${question}

      Format your response as a JSON object with a "keywords" field containing the selected text. 

      Example response format:
      {"keywords": "keyword1, keyword2, keyword3"}`;
    
    const response = await this.retrieverLlm.getCompletion(
      prompt,
      {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: {
            type: 'object',
            properties: {
              keywords: {
                type: 'string',
              }
            },
            required: ['keywords'],
            additionalProperties: false
          },
          strict: true
        }
      }
    );
    
    console.log(`response: ${response}`);
    
    try {
      return JSON.parse(response).keywords;
    } catch {
      return response.trim();
    }
  }

  /**
   * Answer a question based on memories
   * @param question Question text
   * @param category Question category
   * @param answer Reference answer
   * @returns Generated answer, user prompt, and raw context
   */
  async answerQuestion(
    question: string,
    category: number,
    answer: string
  ): Promise<[string, string, string]> {
    // Generate keywords for retrieval
    const keywords = await this.generateQueryLlm(question);
    
    // Retrieve context
    const rawContext = await this.retrieveMemory(keywords, this.retrieveK);
    const context = rawContext;
    
    // Validate category
    if (![1, 2, 3, 4, 5].includes(category)) {
      throw new Error(`Invalid category: ${category}`);
    }
    
    // Create prompt based on category
    let userPrompt = `Context:
      ${context}

      Question: ${question}

      Answer the question based only on the information provided in the context above.`;
    
    let temperature = 0.7;
    
    if (category === 5) { // adversarial question
      const answerTmp: string[] = [];
      
      if (Math.random() < 0.5) {
        answerTmp.push('Not mentioned in the conversation');
        answerTmp.push(answer);
      } else {
        answerTmp.push(answer);
        answerTmp.push('Not mentioned in the conversation');
      }
      
      userPrompt = `
        Based on the context: ${context}, answer the following question. ${question} 
        
        Select the correct answer: ${answerTmp[0]} or ${answerTmp[1]}  Short answer:
        `;
      
      temperature = this.temperatureC5;
    } else if (category === 2) {
      userPrompt = `
        Based on the context: ${context}, answer the following question. Use DATE of CONVERSATION to answer with an approximate date.
        Please generate the shortest possible answer, using words from the conversation where possible, and avoid using any subjects.   

        Question: ${question} Short answer:
        `;
    } else if (category === 3) {
      userPrompt = `
        Based on the context: ${context}, write an answer in the form of a short phrase for the following question. Answer with exact words from the context whenever possible.

        Question: ${question} Short answer:
        `;
    } else {
      userPrompt = `Based on the context: ${context}, write an answer in the form of a short phrase for the following question. Answer with exact words from the context whenever possible.

        Question: ${question} Short answer:
        `;
    }
    
    // Get response from LLM
    const response = await this.memorySystem.llmController.getCompletion(
      userPrompt,
      {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: {
            type: 'object',
            properties: {
              answer: {
                type: 'string',
              }
            },
            required: ['answer'],
            additionalProperties: false
          },
          strict: true
        }
      },
      temperature
    );
    
    // Parse response
    let parsedResponse: string;
    try {
      parsedResponse = JSON.parse(response).answer;
    } catch {
      parsedResponse = response;
    }
    
    return [parsedResponse, userPrompt, rawContext];
  }
}
