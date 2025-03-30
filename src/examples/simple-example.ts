import { AgenticMemorySystem, MemoryNote } from '../index';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Simple example demonstrating the basic usage of the Agentic Memory system
 */
async function runExample() {
  console.log('Starting Agentic Memory Example...');
  
  // Initialize the memory system
  // Note: This requires an OpenAI API key in the OPENAI_API_KEY environment variable
  const memorySystem = new AgenticMemorySystem(
    'all-MiniLM-L6-v2', // Embedding model name
    'openai',           // LLM backend
    'gpt-4o-mini',      // LLM model
    10                  // Evolution threshold
  );
  
  console.log('Memory system initialized');
  
  // Add some memories
  console.log('Adding memories...');
  
  const memoryId1 = await memorySystem.addNote(
    'Neural networks are composed of layers of neurons that process information.',
    '20250330120000' // Timestamp in format YYYYMMDDHHmmss
  );
  
  console.log(`Added memory with ID: ${memoryId1}`);
  
  const memoryId2 = await memorySystem.addNote(
    'Data preprocessing involves cleaning and transforming raw data for model training.',
    '20250330120100'
  );
  
  console.log(`Added memory with ID: ${memoryId2}`);
  
  const memoryId3 = await memorySystem.addNote(
    'Convolutional neural networks (CNNs) are particularly effective for image processing tasks.',
    '20250330120200'
  );
  
  console.log(`Added memory with ID: ${memoryId3}`);
  
  // Query for related memories
  console.log('\nQuerying for related memories...');
  
  const query = 'How do neural networks process images?';
  const relatedMemories = await memorySystem.findRelatedMemoriesRaw(query, 2);
  
  console.log('Query:', query);
  console.log('Related memories:');
  console.log(relatedMemories);
  
  // Create a memory note directly
  console.log('\nCreating a memory note directly...');
  
  const note = new MemoryNote(
    {
      content: 'Transformers have revolutionized natural language processing tasks.',
      keywords: ['transformers', 'NLP', 'attention mechanism'],
      context: 'Machine Learning Architecture',
      tags: ['deep learning', 'language model', 'AI']
    },
    memorySystem.llmController
  );
  
  console.log('Created memory note:');
  console.log({
    id: note.id,
    content: note.content,
    keywords: note.keywords,
    context: note.context,
    tags: note.tags
  });
  
  console.log('\nExample completed successfully!');
}

// Run the example
runExample().catch(error => {
  console.error('Error running example:', error);
});
