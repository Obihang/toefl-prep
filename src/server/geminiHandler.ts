import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { MODELS } from '../constants/models.ts';
import * as CURATED from '../data/curatedQuestions.ts';

async function withRetry<T>(fn: () => Promise<T>, retries = 2, backoff = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, backoff));
    return withRetry(fn, retries - 1, backoff * 2);
  }
}

const Schemas = {
  completeWords: z.object({ title: z.string(), text: z.string(), totalBlanks: z.number() }),
  readingPassage: z.object({
    title: z.string(),
    passage: z.string(),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  }),
  listeningDialogue: z.object({
    title: z.string(),
    context: z.string(),
    speakers: z.record(z.string(), z.string()),
    script: z.string(),
    questions: z.array(z.object({ q: z.string(), options: z.array(z.string()), answer: z.number(), why: z.string() })),
  }),
  listenRepeat: z.object({ title: z.string(), sentences: z.array(z.string()) }),
  speakingInterview: z.object({
    title: z.string(),
    context: z.string(),
    questions: z.array(z.object({ question: z.string(), prepTimeSeconds: z.number(), responseTimeSeconds: z.number(), suggestedPoints: z.array(z.string()) })),
  }),
  buildSentence: z.object({
    title: z.string(),
    items: z.array(z.object({ context: z.string(), words: z.array(z.string()), answer: z.string(), explanation: z.string() })),
  }),
  writeEmail: z.object({
    title: z.string(),
    situation: z.string(),
    recipient: z.string(),
    goals: z.array(z.string()),
    suggestedWordCount: z.string(),
  }),
  academicDiscussion: z.object({
    title: z.string(),
    professorName: z.string(),
    professorPrompt: z.string(),
    s1: z.object({ name: z.string(), text: z.string() }),
    s2: z.object({ name: z.string(), text: z.string() }),
    question: z.string(),
  }),
};


function getAiClient(customApiKey?: string) {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function handleGenerateTask(taskType: string, level: string, topic: string, customApiKey?: string) {
  const ai = getAiClient(customApiKey);
  
  const taskMap: Record<string, string> = {
    'complete-words': 'completeWords',
    'reading-passage': 'readingPassage',
    'listening-dialogue': 'listeningDialogue',
    'listen-repeat': 'listenRepeat',
    'speaking-interview': 'speakingInterview',
    'build-sentence': 'buildSentence',
    'write-email': 'writeEmail',
    'academic-discussion': 'academicDiscussion',
  };
  const curatedMap: Record<string, string> = {
    'complete-words': 'CURATED_COMPLETE_WORDS',
    'reading-passage': 'CURATED_READING_PASSAGES',
    'listening-dialogue': 'CURATED_LISTENING',
    'listen-repeat': 'CURATED_LISTEN_REPEAT',
    'speaking-interview': 'CURATED_SPEAKING_INTERVIEWS',
    'build-sentence': 'CURATED_BUILD_SENTENCES',
    'write-email': 'CURATED_WRITE_EMAILS',
    'academic-discussion': 'CURATED_ACADEMIC_DISCUSSIONS',
  };

  const schemaKey = taskMap[taskType];
  const schema = Schemas[schemaKey as keyof typeof Schemas];

  const getPrompt = (taskType: string, level: string, topic: string) => {
    const levelDesc =
      level === 'advanced'
        ? 'Advanced (C1 CEFR / TOEFL 100-120)'
        : level === 'intermediate'
        ? 'Intermediate (B1-B2 CEFR / TOEFL 60-80)'
        : 'Upper-Intermediate (B2-C1 CEFR / TOEFL 80-100)';
    switch (taskType) {
      case 'complete-words':
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading "Complete the Words" (C-Test) item for a student at level: ${levelDesc}. Topic: ${topic}. Requirements: 1. Write an academic paragraph of 75-90 words. 2. In the paragraph, select exactly 10 academic/content words (4 letters or more, starting from the second sentence, spaced out). 3. In the text, wrap the second half (or slightly more than half if odd length) of each chosen word in [[brackets]], leaving the first half visible outside. Return JSON format: {"title": "Short Academic Topic Title", "text": "The full paragraph with [[...]] wrapping the missing letters only", "totalBlanks": 10}`;
      case 'reading-passage':
        return `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading Academic Passage with 3 multiple-choice questions for level: ${levelDesc}. Topic: ${topic}. Requirements: 1. Academic passage between 160-200 words. 2. Exactly 3 multiple-choice questions: Main idea, Detail, Vocabulary/Inference. Return JSON format: {"title": "Passage Title", "passage": "Passage text...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listening-dialogue':
        return `You are an official ETS TOEFL test content creator. Create a TOEFL Listening task for level: ${levelDesc}. Topic: ${topic}. Requirements: 1. A campus conversation OR a short classroom lecture. 2. Script must be 120-150 words. 3. Exactly 3 multiple-choice comprehension questions with 4 options each. Return JSON format: {"title": "Listening Context Title", "context": "Brief 1-sentence situation description", "speakers": {"A": "Role of Speaker A", "B": "Role of Speaker B"}, "script": "Speaker A: ...\\nSpeaker B: ...", "questions": [{"q": "Question prompt?", "options": ["A", "B", "C", "D"], "answer": 0, "why": "Explanation..."}]}`;
      case 'listen-repeat':
        return `You are an official ETS TOEFL test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}. Topic: ${topic}. Return JSON format: {"title": "Listen & Repeat Exercise", "sentences": ["Sentence 1", "Sentence 2", "Sentence 3", "Sentence 4", "Sentence 5"]}`;
      case 'speaking-interview':
        return `You are an official ETS TOEFL Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}. Topic: ${topic}. Return JSON format: {"title": "University Interview Simulation", "context": "Context description", "questions": [{"question": "Question text...", "prepTimeSeconds": 20, "responseTimeSeconds": 45, "suggestedPoints": ["Point 1", "Point 2"]}]}`;
      case 'build-sentence':
        return `You are an official ETS TOEFL test creator. Create 5 TOEFL Writing "Build a Sentence" (sentence scramble) items for level: ${levelDesc}. Topic: ${topic}. Return JSON format: {"title": "Build a Sentence Practice", "items": [{"context": "Context setup line...", "words": ["w1", "w2", "w3", "w4", "w5"], "answer": "The complete correct sentence.", "explanation": "Grammar rule explanation."}]}`;
      case 'write-email':
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Write an Email" prompt for level: ${levelDesc}. Topic: ${topic}. Return JSON format: {"title": "Email Task Title", "situation": "Situation description...", "recipient": "Recipient name/office", "goals": ["Goal 1", "Goal 2", "Goal 3"], "suggestedWordCount": "80-120 words"}`;
      case 'academic-discussion':
      default:
        return `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Writing for an Academic Discussion" prompt for level: ${levelDesc}. Topic: ${topic}. Return JSON format: {"title": "Academic Discussion Board", "professorName": "Professor Name", "professorPrompt": "Prompt text...", "s1": {"name": "Student A", "text": "Post text..."}, "s2": {"name": "Student B", "text": "Post text..."}, "question": "Instruction text..."}`;
    }
  };

  try {
    return await withRetry(async () => {
      if (!ai) throw new Error('AI client not initialized');
      
      const prompt = getPrompt(taskType, level, topic);
      const response = await ai.models.generateContent({
        model: MODELS.GENERATION,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'You are an expert ETS TOEFL test design specialist. Return valid JSON matching the schema.',
          temperature: 0.7,
        },
      });

      const parsed = JSON.parse(response.text!);
      return { ...schema.parse(parsed), isFallback: false };
    });
  } catch (error) {
    console.error(`Failed to generate task ${taskType}, falling back:`, error);
    const curatedKey = curatedMap[taskType] as keyof typeof CURATED;
    const curatedTasks = CURATED[curatedKey] as any[];
    const item = curatedTasks[Math.floor(Math.random() * curatedTasks.length)];
    return { ...item, isFallback: true, fallbackReason: (error as any)?.message || 'Unknown error' };
  }
}

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  customApiKey?: string
) {
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const evaluationPrompt = `You are an official certified ETS TOEFL iBT scoring rater.
Evaluate the student's submission for the following TOEFL task type: "${taskType}".

Task Prompt and Requirements:
${JSON.stringify(promptData, null, 2)}

Student's Submission:
${JSON.stringify(studentResponse, null, 2)}

Scoring Guidelines:
- Evaluate using authentic ETS TOEFL rubrics.
- In the updated TOEFL reporting system, section scores are reported on a 1.0 to 6.0 Band Scale (with 0.5 increments: 1.0 to 6.0, mapped to CEFR A1-C2).
- The raw task rubric is 0.0 to 5.0 (for Writing tasks) or 0.0 to 4.0 (for Speaking tasks).
- Provide both:
  1. The new official TOEFL section Band Score on the 1.0 to 6.0 scale (bandScore6, e.g. 5.0 or 5.5).
  2. The raw task rubric score (rawRubricScore out of 5.0 or 4.0).
  3. The legacy scaled score out of 30 (scaledScore, e.g., 27/30).
- Identify specific grammar, punctuation, or word-choice errors with the original phrase, the corrected version, and a brief pedagogical explanation.
- Provide a high-scoring exemplar response demonstrating how a native or C1+ level candidate would address the exact same prompt.
- Suggest 3 concrete, actionable improvement tips.

Return JSON in this exact structure:
{
  "bandScore6": 5.5,
  "bandScore": 4.5,
  "rawRubricScore": 4.5,
  "rawRubricMax": 5.0,
  "scaledScore": 27,
  "performanceLevel": "C1 Advanced (High Fluency)",
  "summary": "Overall diagnostic assessment in 2-3 sentences.",
  "criteria": [
    {
      "name": "Task Completion & Relevance",
      "score": "4.5 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Coherence & Organization",
      "score": "4.0 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Grammar & Syntax",
      "score": "4.5 / 5.0",
      "comment": "Specific feedback..."
    },
    {
      "name": "Lexical Sophistication",
      "score": "4.0 / 5.0",
      "comment": "Specific feedback..."
    }
  ],
  "corrections": [
    {
      "original": "exact student phrase",
      "corrected": "improved/corrected phrase",
      "explanation": "why this correction improves the score"
    }
  ],
  "suggestions": [
    "Tip 1...",
    "Tip 2...",
    "Tip 3..."
  ],
  "exemplar": "A model high-scoring C1/C2 response demonstrating target structure and vocabulary."
}`;

  const response = await ai.models.generateContent({
    model: MODELS.EVALUATION,
    contents: evaluationPrompt,
    config: {
      responseMimeType: 'application/json',
      systemInstruction:
        'You are an experienced TOEFL iBT exam rater. Return objective, encouraging, and pedagogically sound evaluation as valid JSON only.',
      temperature: 0.3,
    },
  });

  const text = response.text || '';
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse evaluation JSON');
  }
}

export async function handleSynthesizeSpeech(
  text: string,
  voiceName: 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' | 'Charon' = 'Kore',
  customApiKey?: string
) {
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const response = await ai.models.generateContent({
    model: MODELS.TTS,
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Failed to generate audio from speech model');
  }

  return base64Audio;
}

export async function handleTranscribeAudio(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  customApiKey?: string
): Promise<string> {
  const ai = getAiClient(customApiKey);
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const promptText =
    'Transcribe the spoken English speech in this audio accurately. Write out spoken times and numbers as standard words where appropriate to match natural speech (e.g. transcribe "10:00" as "ten o\'clock", "2" as "two", "50%" as "fifty percent"). Return only the exact transcription without introductory phrases or commentary.';

  // 1. Try low-latency dedicated transcription model gemini-3.5-transcribe
  try {
    const response = await ai.models.generateContent({
      model: MODELS.TRANSCRIBE_PRIMARY,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: audioBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        temperature: 0.0,
        maxOutputTokens: 120,
      },
    });

    const text = (response.text || '').trim();
    if (text) return text;
  } catch (err) {
    console.warn('gemini-3.5-transcribe error, falling back to gemini-2.5-flash:', err);
  }

  // 2. High-speed multimodal fallback: gemini-2.5-flash
  try {
    const fallbackResponse = await ai.models.generateContent({
      model: MODELS.TRANSCRIBE_FALLBACK,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: audioBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      config: {
        temperature: 0.0,
        maxOutputTokens: 120,
      },
    });

    const fallbackText = (fallbackResponse.text || '').trim();
    if (fallbackText) return fallbackText;
  } catch (err) {
    console.warn('gemini-2.5-flash fallback error:', err);
  }

  // 3. Last-resort fallback: gemini-3.8-flash
  const lastResort = await ai.models.generateContent({
    model: MODELS.TRANSCRIBE_LAST_RESORT,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: audioBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
    ],
    config: {
      temperature: 0.0,
      maxOutputTokens: 120,
    },
  });

  return (lastResort.text || '').trim();
}
