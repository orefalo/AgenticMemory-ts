
import { ContentAnalysis, MemoryNoteData } from '../types';
import { LLMController } from './llm-controller';
import { nanoid } from 'nanoid';

/**
 * Basic memory unit with metadata
 */
export class MemoryNote {
  id: string;
  content: string;
  keywords: string[];
  links: number[];
  importance_score: number;
  retrieval_count: number;
  timestamp: string;
  last_accessed: string;
  context: string;
  evolution_history: any[];
  category: string;
  tags: string[];

  /**
   * Create a new memory note
   * @param data Memory note data
   * @param llmController LLM controller for generating metadata
   */
  constructor(
    data: MemoryNoteData,
    llmController?: LLMController
  ) {
    this.content = data.content;
    
    // Set default values for optional parameters
    this.id = data.id || nanoid();
    this.links = data.links || [];
    this.importance_score = data.importance_score || 1.0;
    this.retrieval_count = data.retrieval_count || 0;
    
    const currentTime = new Date().toISOString().replace(/[-:]/g, '').slice(0, 12);
    this.timestamp = data.timestamp || currentTime;
    this.last_accessed = data.last_accessed || currentTime;
    
    // Use provided values or defaults
    this.keywords = data.keywords || [];
    this.context = data.context || 'General';
    this.tags = data.tags || [];
    
    // Handle context that can be either string or array
    if (Array.isArray(this.context)) {
      this.context = this.context.join(' ');
    }
    
    this.evolution_history = data.evolution_history || [];
    this.category = data.category || 'Uncategorized';
    
    // Generate metadata using LLM if not provided and controller is available
    if (llmController && 
        (!data.keywords || !data.context || !data.tags)) {
      // Asynchronously analyze content and update metadata
      this.analyzeAndUpdateMetadata(llmController);
    }
  }

  /**
   * Analyze content and update metadata asynchronously
   * @param llmController LLM controller
   */
  private async analyzeAndUpdateMetadata(llmController: LLMController): Promise<void> {
    try {
      const analysis = await MemoryNote.analyzeContent(this.content, llmController);
      
      // Update metadata with analysis results
      if (!this.keywords || this.keywords.length === 0) {
        this.keywords = analysis.keywords;
      }
      
      if (!this.context || this.context === 'General') {
        this.context = analysis.context;
      }
      
      if (!this.tags || this.tags.length === 0) {
        this.tags = analysis.tags;
      }
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }

  /**
   * Analyze content to extract keywords, context, and other metadata
   * @param content Content to analyze
   * @param llmController LLM controller
   * @returns Analysis results
   */
  static async analyzeContent(
    content: string, 
    llmController: LLMController
  ): Promise<ContentAnalysis> {
    const prompt = `Generate a structured analysis of the following content by:
      1. Identifying the most salient keywords (focus on nouns, verbs, and key concepts)
      2. Extracting core themes and contextual elements
      3. Creating relevant categorical tags

      Format the response as a JSON object:
      {
          "keywords": [
              // several specific, distinct keywords that capture key concepts and terminology
              // Order from most to least important
              // Don't include keywords that are the name of the speaker or time
              // At least three keywords, but don't be too redundant.
          ],
          "context": 
              // one sentence summarizing:
              // - Main topic/domain
              // - Key arguments/points
              // - Intended audience/purpose
          ,
          "tags": [
              // several broad categories/themes for classification
              // Include domain, format, and type tags
              // At least three tags, but don't be too redundant.
          ]
      }

      Content for analysis:
      ${content}`;

    try {
      const response = await llmController.getCompletion(
        prompt,
        {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            schema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                },
                context: {
                  type: 'string',
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                },
              },
              required: ['keywords', 'context', 'tags'],
              additionalProperties: false
            },
            strict: true
          }
        }
      );
      
      try {
        return JSON.parse(response) as ContentAnalysis;
      } catch {
        // If parsing fails, return the response as is (assuming it's already an object)
        return response as unknown as ContentAnalysis;
      }
    } catch (error) {
      console.error(`Error analyzing content: ${error}`);
      return {
        keywords: [],
        context: 'General',
        tags: []
      };
    }
  }
}
