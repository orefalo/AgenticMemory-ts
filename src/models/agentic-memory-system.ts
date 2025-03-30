import { MemoryNote } from './memory-note';
import { SimpleEmbeddingRetriever } from './simple-embedding-retriever';
import { LLMController } from './llm-controller';
import { EvolutionResponse, LLMBackend } from '../types';

/**
 * Memory management system with embedding-based retrieval
 */
export class AgenticMemorySystem {
  private memories: Record<string, MemoryNote> = {};
  private retriever: SimpleEmbeddingRetriever;
  public readonly llmController: LLMController;
  private evolutionSystemPrompt: string;
  private evoCnt: number = 0;
  private evoThreshold: number;

  /**
   * Create a new agentic memory system
   * @param modelName Name of the embedding model
   * @param llmBackend LLM backend to use
   * @param llmModel LLM model to use
   * @param evoThreshold Threshold for memory evolution
   * @param apiKey API key for LLM
   */
  constructor(
    modelName: string = 'all-MiniLM-L6-v2',
    llmBackend: LLMBackend = 'openai',
    llmModel: string = 'gpt-4o-mini',
    evoThreshold: number = 100,
    apiKey?: string
  ) {
    this.retriever = new SimpleEmbeddingRetriever(modelName);
    this.llmController = new LLMController(llmBackend, llmModel, apiKey);
    this.evoThreshold = evoThreshold;
    
    this.evolutionSystemPrompt = `
      You are an AI memory evolution agent responsible for managing and evolving a knowledge base.
      Analyze the the new memory note according to keywords and context, also with their several nearest neighbors memory.
      Make decisions about its evolution.  

      The new memory context:
      {context}
      content: {content}
      keywords: {keywords}

      The nearest neighbors memories:
      {nearest_neighbors_memories}

      Based on this information, determine:
      1. Should this memory be evolved? Consider its relationships with other memories.
      2. What specific actions should be taken (strengthen, update_neighbor)?
         2.1 If choose to strengthen the connection, which memory should it be connected to? Can you give the updated tags of this memory?
         2.2 If choose to update_neighbor, you can update the context and tags of these memories based on the understanding of these memories. If the context and the tags are not updated, the new context and tags should be the same as the original ones. Generate the new context and tags in the sequential order of the input neighbors.
      Tags should be determined by the content of these characteristic of these memories, which can be used to retrieve them later and categorize them.
      Note that the length of new_tags_neighborhood must equal the number of input neighbors, and the length of new_context_neighborhood must equal the number of input neighbors.
      The number of neighbors is {neighbor_number}.
      Return your decision in JSON format with the following structure:
      {
          "should_evolve": True or False,
          "actions": ["strengthen", "update_neighbor"],
          "suggested_connections": ["neighbor_memory_ids"],
          "tags_to_update": ["tag_1",..."tag_n"], 
          "new_context_neighborhood": ["new context",...,"new context"],
          "new_tags_neighborhood": [["tag_1",...,"tag_n"],...["tag_1",...,"tag_n"]],
      }
    `;
  }

  /**
   * Add a new memory note
   * @param content Content of the note
   * @param time Timestamp
   * @param options Additional options
   * @returns ID of the new note
   */
  async addNote(
    content: string, 
    time?: string, 
    options: Record<string, any> = {}
  ): Promise<string> {
    // Create a new memory note
    const note = new MemoryNote(
      { content, timestamp: time, ...options },
      this.llmController
    );
    
    // Process memory and update retriever
    const [evoLabel, processedNote] = await this.processMemory(note);
    this.memories[processedNote.id] = processedNote;
    
    // Add to retriever
    this.retriever.addDocuments([
      processedNote.context + " keywords: " + processedNote.keywords.join(", ")
    ]);
    
    // Check if we need to consolidate memories
    if (evoLabel) {
      this.evoCnt += 1;
      if (this.evoCnt % this.evoThreshold === 0) {
        await this.consolidateMemories();
      }
    }
    
    return processedNote.id;
  }

  /**
   * Consolidate memories by updating the retriever
   */
  private async consolidateMemories(): Promise<void> {
    // Reset the retriever with the same model
    this.retriever = new SimpleEmbeddingRetriever(this.retriever.modelName);
    
    // Re-add all memory documents with their metadata
    for (const memory of Object.values(this.memories)) {
      // Combine memory metadata into a single searchable document
      const metadataText = `${memory.context} ${memory.keywords.join(' ')} ${memory.tags.join(' ')}`;
      // Add both the content and metadata as separate documents for better retrieval
      this.retriever.addDocuments([`${memory.content} , ${metadataText}`]);
    }
  }

  /**
   * Process a memory note and return an evolution label
   * @param note Memory note to process
   * @returns Tuple of [evolution label, processed note]
   */
  private async processMemory(note: MemoryNote): Promise<[boolean, MemoryNote]> {
    const [neighborMemory, indices] = await this.findRelatedMemories(note.content, 5);
    
    const promptMemory = this.evolutionSystemPrompt
      .replace('{context}', note.context)
      .replace('{content}', note.content)
      .replace('{keywords}', JSON.stringify(note.keywords))
      .replace('{nearest_neighbors_memories}', neighborMemory)
      .replace('{neighbor_number}', indices.length.toString());
    
    console.log("prompt_memory", promptMemory);
    
    const response = await this.llmController.getCompletion(
      promptMemory,
      {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          schema: {
            type: 'object',
            properties: {
              should_evolve: {
                type: 'boolean',
              },
              actions: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              suggested_connections: {
                type: 'array',
                items: {
                  type: 'number'
                }
              },
              new_context_neighborhood: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              tags_to_update: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              new_tags_neighborhood: {
                type: 'array',
                items: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                }
              }
            },
            required: [
              'should_evolve',
              'actions',
              'suggested_connections',
              'tags_to_update',
              'new_context_neighborhood',
              'new_tags_neighborhood'
            ],
            additionalProperties: false
          },
          strict: true
        }
      }
    );
    
    let responseJson: EvolutionResponse;
    try {
      responseJson = JSON.parse(response) as EvolutionResponse;
    } catch {
      responseJson = response as unknown as EvolutionResponse;
    }
    
    console.log("response_json", responseJson);
    
    const shouldEvolve = responseJson.should_evolve;
    if (shouldEvolve) {
      const actions = responseJson.actions;
      
      for (const action of actions) {
        if (action === 'strengthen') {
          const suggestConnections = responseJson.suggested_connections;
          const newTags = responseJson.tags_to_update;
          note.links = [...note.links, ...suggestConnections];
          note.tags = newTags;
        } else if (action === 'update_neighbor') {
          const newContextNeighborhood = responseJson.new_context_neighborhood;
          const newTagsNeighborhood = responseJson.new_tags_neighborhood;
          const notesList = Object.values(this.memories);
          const notesId = Object.keys(this.memories);
          
          // Update neighbors with new context and tags
          for (let i = 0; i < Math.min(indices.length, newTagsNeighborhood.length); i++) {
            const tag = newTagsNeighborhood[i];
            const context = i < newContextNeighborhood.length
              ? newContextNeighborhood[i]
              : notesList[indices[i]].context;
            
            const memorytmpIdx = indices[i];
            const notetmp = notesList[memorytmpIdx];
            
            // Update tags and context
            notetmp.tags = tag;
            notetmp.context = context;
            this.memories[notesId[memorytmpIdx]] = notetmp;
          }
        }
      }
    }
    
    return [shouldEvolve, note];
  }

  /**
   * Find related memories
   * @param query Query text
   * @param k Number of results to return
   * @returns Tuple of [memory string, indices]
   */
  private async findRelatedMemories(
    query: string, 
    k: number = 5
  ): Promise<[string, number[]]> {
    if (Object.keys(this.memories).length === 0) {
      return ["", []];
    }
    
    // Get indices of related memories
    const indices = this.retriever.search(query, k);
    
    // Convert to list of memories
    const allMemories = Object.values(this.memories);
    let memoryStr = "";
    
    for (const i of indices) {
      memoryStr += "memory index:" + i + 
        "\t talk start time:" + allMemories[i].timestamp + 
        "\t memory content: " + allMemories[i].content + 
        "\t memory context: " + allMemories[i].context + 
        "\t memory keywords: " + JSON.stringify(allMemories[i].keywords) + 
        "\t memory tags: " + JSON.stringify(allMemories[i].tags) + "\n";
    }
    
    return [memoryStr, indices];
  }

  /**
   * Find related memories in raw format
   * @param query Query text
   * @param k Number of results to return
   * @returns Memory string
   */
  async findRelatedMemoriesRaw(query: string, k: number = 5): Promise<string> {
    if (Object.keys(this.memories).length === 0) {
      return "";
    }
    
    // Get indices of related memories
    const indices = this.retriever.search(query, k);
    
    // Convert to list of memories
    const allMemories = Object.values(this.memories);
    let memoryStr = "";
    let j = 0;
    
    for (const i of indices) {
      memoryStr += "talk start time:" + allMemories[i].timestamp + 
        "memory content: " + allMemories[i].content + 
        "memory context: " + allMemories[i].context + 
        "memory keywords: " + JSON.stringify(allMemories[i].keywords) + 
        "memory tags: " + JSON.stringify(allMemories[i].tags) + "\n";
      
      // Add neighborhood memories
      const neighborhood = allMemories[i].links;
      for (const neighbor of neighborhood) {
        memoryStr += "talk start time:" + allMemories[neighbor].timestamp + 
          "memory content: " + allMemories[neighbor].content + 
          "memory context: " + allMemories[neighbor].context + 
          "memory keywords: " + JSON.stringify(allMemories[neighbor].keywords) + 
          "memory tags: " + JSON.stringify(allMemories[neighbor].tags) + "\n";
        
        if (j >= k) {
          break;
        }
        j += 1;
      }
    }
    
    return memoryStr;
  }
}
