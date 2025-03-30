import * as fs from 'fs';
import * as path from 'path';
import { 
  QA, 
  Turn, 
  Session, 
  Conversation, 
  EventSummary, 
  Observation, 
  LoCoMoSample 
} from '../types';

/**
 * Parse a single session's data
 * @param sessionData Session data
 * @param sessionId Session ID
 * @param dateTime Date and time
 * @returns Parsed session
 */
function parseSession(
  sessionData: any[], 
  sessionId: number, 
  dateTime: string
): Session {
  const turns: Turn[] = [];
  
  for (const turn of sessionData) {
    // For turns with images, combine caption and text
    let text = turn.text || '';
    
    if (turn.img_url && turn.blip_caption) {
      const captionText = `[Image: ${turn.blip_caption}]`;
      text = text ? `${captionText} ${text}` : captionText;
    }
    
    turns.push({
      speaker: turn.speaker,
      dia_id: turn.dia_id,
      text
    });
  }
  
  return {
    session_id: sessionId,
    date_time: dateTime,
    turns
  };
}

/**
 * Parse conversation data
 * @param convData Conversation data
 * @returns Parsed conversation
 */
function parseConversation(convData: any): Conversation {
  const sessions: Record<number, Session> = {};
  
  for (const [key, value] of Object.entries(convData)) {
    if (key.startsWith('session_') && Array.isArray(value)) {
      const sessionId = parseInt(key.split('_')[1]);
      const dateTime = convData[`${key}_date_time`];
      
      if (dateTime) {
        const session = parseSession(value, sessionId, dateTime);
        // Only add sessions that have turns after filtering
        if (session.turns.length > 0) {
          sessions[sessionId] = session;
        }
      }
    }
  }
  
  return {
    speaker_a: convData.speaker_a,
    speaker_b: convData.speaker_b,
    sessions
  };
}

/**
 * Load the LoComo dataset from a JSON file
 * @param filePath Path to the JSON file
 * @returns List of LoCoMoSample objects
 */
export function loadLocomoDataset(filePath: string): LoCoMoSample[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dataset file not found at ${filePath}`);
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const samples: LoCoMoSample[] = [];
  
  let totalQA = 0;
  let totalImageQA = 0;
  const qaCountsPerSample: number[] = [];
  
  for (const [sampleIdx, sample] of data.entries()) {
    try {
      // Parse QA data
      const qaList: QA[] = [];
      let sampleQaCount = 0;
      let sampleImageQaCount = 0;
      
      for (const qa of sample.qa) {
        try {
          // Check if QA has image evidence
          let hasImageEvidence = false;
          
          for (const evidenceId of qa.evidence || []) {
            if (!evidenceId.includes(':')) continue;
            
            const turnId = evidenceId.split(':')[1];
            
            for (const sessionKey in sample.conversation) {
              const session = sample.conversation[sessionKey];
              
              if (Array.isArray(session)) {
                for (const turn of session) {
                  if (turn.dia_id?.endsWith(turnId)) {
                    if (turn.img_url || turn.blip_caption) {
                      hasImageEvidence = true;
                      break;
                    }
                  }
                }
              }
              
              if (hasImageEvidence) break;
            }
            
            if (hasImageEvidence) break;
          }
          
          if (hasImageEvidence) {
            sampleImageQaCount++;
          }
          
          qaList.push({
            question: qa.question,
            answer: qa.answer || null,
            evidence: qa.evidence || [],
            category: qa.category,
            adversarial_answer: qa.adversarial_answer || null
          });
          
          sampleQaCount++;
        } catch (error) {
          console.error(`Error in sample ${sampleIdx}, QA pair:`, error);
          throw error;
        }
      }
      
      // Parse conversation
      const conversation = parseConversation(sample.conversation);
      
      // Parse event summary
      const eventSummary: EventSummary = {
        events: sample.event_summary
      };
      
      // Parse observation
      const observation: Observation = {
        observations: sample.observation
      };
      
      // Get session summary
      const sessionSummary = sample.session_summary || {};
      
      // Create sample object
      const sampleObj: LoCoMoSample = {
        sample_id: sampleIdx.toString(),
        qa: qaList,
        conversation,
        event_summary: eventSummary,
        observation,
        session_summary: sessionSummary
      };
      
      samples.push(sampleObj);
      
      totalQA += sampleQaCount;
      totalImageQA += sampleImageQaCount;
      qaCountsPerSample.push(sampleQaCount);
      
      // Print statistics for this sample
      console.log(`\nSample ${sampleIdx}:`);
      console.log(`  Total QAs: ${sampleQaCount}`);
      console.log(`  QAs with image evidence: ${sampleImageQaCount}`);
    } catch (error) {
      console.error(`Error processing sample ${sampleIdx}:`, error);
      throw error;
    }
  }
  
  // Print overall statistics
  console.log('\nOverall Statistics:');
  console.log(`Total QAs: ${totalQA}`);
  console.log(`Total QAs with image evidence: ${totalImageQA}`);
  console.log(`Average QAs per sample: ${totalQA / samples.length}`);
  console.log(`Min QAs in a sample: ${Math.min(...qaCountsPerSample)}`);
  console.log(`Max QAs in a sample: ${Math.max(...qaCountsPerSample)}`);
  
  return samples;
}

/**
 * Get basic statistics about the dataset
 * @param samples List of LoCoMoSample objects
 * @returns Statistics about the dataset
 */
export function getDatasetStatistics(samples: LoCoMoSample[]): Record<string, number> {
  return {
    num_samples: samples.length,
    total_qa_pairs: samples.reduce((sum, sample) => sum + sample.qa.length, 0),
    total_sessions: samples.reduce(
      (sum, sample) => sum + Object.keys(sample.conversation.sessions).length, 
      0
    ),
    total_turns: samples.reduce(
      (sum, sample) => sum + Object.values(sample.conversation.sessions)
        .reduce((sessionSum, session) => sessionSum + session.turns.length, 0),
      0
    ),
    qa_with_adversarial: samples.reduce(
      (sum, sample) => sum + sample.qa
        .filter(qa => qa.adversarial_answer !== null).length,
      0
    )
  };
}
