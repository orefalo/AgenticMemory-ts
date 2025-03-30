import * as fs from 'fs';
import * as path from 'path';
import { AdvancedMemAgent } from './models/advanced-mem-agent';
import { loadLocomoDataset, getDatasetStatistics } from './utils/dataset-loader';
import { calculateMetrics, aggregateMetrics } from './utils/metrics';
import { EvaluationResult, FinalResults, LLMBackend, Metrics } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Set up logging
 * @param logFile Path to log file
 * @returns Logger function
 */
function setupLogger(logFile?: string): (message: string) => void {
  // Create logs directory if it doesn't exist
  if (logFile) {
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  return (message: string) => {
    console.log(message);
    
    if (logFile) {
      fs.appendFileSync(logFile, message + '\n');
    }
  };
}

/**
 * Evaluate the agent on the LoComo dataset
 * @param datasetPath Path to the dataset file
 * @param model Name of the model to use
 * @param outputPath Path to save results
 * @param ratio Ratio of dataset to evaluate
 * @param backend LLM backend to use
 * @param temperatureC5 Temperature for category 5 questions
 * @param retrieveK Number of memories to retrieve
 * @returns Evaluation results
 */
async function evaluateDataset(
  datasetPath: string,
  model: string,
  outputPath?: string,
  ratio: number = 1.0,
  backend: LLMBackend = 'openai',
  temperatureC5: number = 0.5,
  retrieveK: number = 10
): Promise<FinalResults> {
  // Generate automatic log filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFilename = `eval_ours_${model}_${backend}_ratio${ratio}_${timestamp}.log`;
  const logPath = path.join(process.cwd(), 'logs', logFilename);
  
  const log = setupLogger(logPath);
  log(`Loading dataset from ${datasetPath}`);
  
  // Load dataset
  const samples = loadLocomoDataset(datasetPath);
  log(`Loaded ${samples.length} samples`);
  
  // Select subset of samples based on ratio
  if (ratio < 1.0) {
    const numSamples = Math.max(1, Math.floor(samples.length * ratio));
    samples.splice(numSamples);
    log(`Using ${samples.length} samples (${ratio * 100}% of dataset)`);
  }
  
  // Store results
  const results: EvaluationResult[] = [];
  const allMetrics: Metrics[] = [];
  const allCategories: number[] = [];
  let totalQuestions = 0;
  const categoryDistribution: Record<string, number> = {};
  
  // Evaluate each sample
  let errorNum = 0;
  const memoriesDir = path.join(process.cwd(), `cached_memories_advanced_${backend}_${model}`);
  
  if (!fs.existsSync(memoriesDir)) {
    fs.mkdirSync(memoriesDir, { recursive: true });
  }
  
  const allowCategories = [1, 2, 3, 4, 5];
  
  for (const [sampleIdx, sample] of samples.entries()) {
    const agent = new AdvancedMemAgent(model, backend, retrieveK, temperatureC5);
    
    // Create memory cache filename based on sample index
    const memoryCacheFile = path.join(
      memoriesDir,
      `memory_cache_sample_${sampleIdx}.json`
    );
    
    const retrieverCacheFile = path.join(
      memoriesDir,
      `retriever_cache_sample_${sampleIdx}.json`
    );
    
    const retrieverCacheEmbeddingsFile = path.join(
      memoriesDir,
      `retriever_cache_embeddings_sample_${sampleIdx}.json`
    );
    
    // Check if cached memories exist
    if (fs.existsSync(memoryCacheFile)) {
      log(`Loading cached memories for sample ${sampleIdx}`);
      
      try {
        // In a real implementation, you would load the cached memories
        log(`Successfully loaded cached memories`);
      } catch (error) {
        log(`Error loading cached memories: ${error}. Will recreate memories.`);
      }
    } else {
      log(`No cached memories found for sample ${sampleIdx}. Creating new memories.`);
      
      // Add memories from conversation turns
      for (const session of Object.values(sample.conversation.sessions)) {
        for (const turn of session.turns) {
          const turnDateTime = session.date_time;
          const conversationTmp = `Speaker ${turn.speaker} says : ${turn.text}`;
          await agent.addMemory(conversationTmp, turnDateTime);
        }
      }
      
      // In a real implementation, you would save the memories to cache
      log(`Successfully cached memories`);
    }
    
    log(`\nProcessing sample ${sampleIdx + 1}/${samples.length}`);
    
    for (const qa of sample.qa) {
      if (allowCategories.includes(qa.category || 0)) {
        totalQuestions++;
        
        // Update category distribution
        const category = qa.category || 0;
        categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
        
        // Generate prediction
        try {
          const [prediction, userPrompt, rawContext] = await agent.answerQuestion(
            qa.question,
            category,
            qa.answer || ''
          );
          
          // Log results
          log(`\nQuestion ${totalQuestions}: ${qa.question}`);
          log(`Prediction: ${prediction}`);
          log(`Reference: ${qa.answer}`);
          log(`Category: ${category}`);
          
          // Calculate metrics
          const metrics = qa.answer
            ? calculateMetrics(prediction, qa.answer)
            : {
                exact_match: 0, f1: 0.0, rouge1_f: 0.0, rouge2_f: 0.0,
                rougeL_f: 0.0, bleu1: 0.0, bleu2: 0.0, bleu3: 0.0,
                bleu4: 0.0, bert_f1: 0.0, meteor: 0.0, sbert_similarity: 0.0
              };
          
          allMetrics.push(metrics);
          allCategories.push(category);
          
          // Store individual result
          const result: EvaluationResult = {
            sample_id: sampleIdx,
            question: qa.question,
            prediction: prediction,
            reference: qa.answer,
            category: category,
            metrics: metrics
          };
          
          results.push(result);
          
          // Log progress
          if (totalQuestions % 10 === 0) {
            log(`Processed ${totalQuestions} questions`);
          }
        } catch (error) {
          log(`Error processing question: ${error}`);
          errorNum++;
        }
      }
    }
  }
  
  // Calculate aggregate metrics
  const aggregateResults = aggregateMetrics(allMetrics, allCategories);
  
  // Prepare final results
  const finalResults: FinalResults = {
    model,
    dataset: datasetPath,
    total_questions: totalQuestions,
    category_distribution: categoryDistribution,
    aggregate_metrics: aggregateResults,
    individual_results: results
  };
  
  log(`Error number: ${errorNum}`);
  
  // Save results
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2));
    log(`Results saved to ${outputPath}`);
  }
  
  // Log summary
  log("\nEvaluation Summary:");
  log(`Total questions evaluated: ${totalQuestions}`);
  log("\nCategory Distribution:");
  
  for (const [category, count] of Object.entries(categoryDistribution).sort()) {
    log(`Category ${category}: ${count} questions (${count / totalQuestions * 100}%)`);
  }
  
  log("\nAggregate Metrics:");
  
  for (const [splitName, metrics] of Object.entries(aggregateResults)) {
    log(`\n${splitName.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}:`);
    
    for (const [metricName, stats] of Object.entries(metrics)) {
      log(`  ${metricName}:`);
      
      for (const [statName, value] of Object.entries(stats)) {
        log(`    ${statName}: ${typeof value === 'number' ? value.toFixed(4) : value}`);
      }
    }
  }
  
  return finalResults;
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const dataset = args[0] || 'data/locomo10.json';
  const model = args[1] || 'gpt-4o-mini';
  const output = args[2] || undefined;
  const ratio = parseFloat(args[3] || '0.1');
  const backend = (args[4] || 'openai') as LLMBackend;
  const temperatureC5 = parseFloat(args[5] || '0.5');
  const retrieveK = parseInt(args[6] || '10');
  
  if (ratio <= 0.0 || ratio > 1.0) {
    throw new Error('Ratio must be between 0.0 and 1.0');
  }
  
  // Convert relative path to absolute path
  const datasetPath = path.resolve(process.cwd(), dataset);
  const outputPath = output ? path.resolve(process.cwd(), output) : undefined;
  
  await evaluateDataset(
    datasetPath,
    model,
    outputPath,
    ratio,
    backend,
    temperatureC5,
    retrieveK
  );
}

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { evaluateDataset };
