import { GoogleGenAI } from '@google/genai';

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
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

export async function handleGenerateTask(taskType: string, level: string, topic: string) {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const levelDesc =
    level === 'advanced'
      ? 'Advanced (C1 CEFR / TOEFL 100-120)'
      : level === 'intermediate'
      ? 'Intermediate (B1-B2 CEFR / TOEFL 60-80)'
      : 'Upper-Intermediate (B2-C1 CEFR / TOEFL 80-100)';

  let prompt = '';

  switch (taskType) {
    case 'complete-words':
      prompt = `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading "Complete the Words" (C-Test) item for a student at level: ${levelDesc}.
Topic: ${topic}.
Requirements:
1. Write an academic paragraph of 75-90 words.
2. In the paragraph, select exactly 10 academic/content words (4 letters or more, starting from the second sentence, spaced out).
3. In the text, wrap the second half (or slightly more than half if odd length) of each chosen word in [[brackets]], leaving the first half visible outside.
Example format in paragraph: "The scien[[tists]] conduc[[ted]] an exper[[iment]] to anal[[yze]]..."
4. Provide the list of words as: text with [[...]] and the solution words.

Return JSON format:
{
  "title": "Short Academic Topic Title",
  "text": "The full paragraph with [[...]] wrapping the missing letters only",
  "totalBlanks": 10
}`;
      break;

    case 'reading-passage':
      prompt = `You are an official ETS TOEFL test content creator. Create an authentic TOEFL Reading Academic Passage with 3 multiple-choice questions for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
1. Academic passage between 160-200 words, formal academic tone with good sentence variety.
2. Exactly 3 multiple-choice questions:
   - Question 1: Main idea or primary purpose.
   - Question 2: Detail or factual information.
   - Question 3: Vocabulary in context or negative factual inference.
3. Each question must have 4 plausible options, exact 0-indexed answer key, and an explanation explaining why the answer is correct and others are incorrect.

Return JSON format:
{
  "title": "Passage Title",
  "passage": "Passage text...",
  "questions": [
    {
      "q": "Question prompt?",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "why": "Explanation..."
    }
  ]
}`;
      break;

    case 'listening-dialogue':
      prompt = `You are an official ETS TOEFL test content creator. Create a TOEFL Listening task for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
1. A campus conversation between two people (e.g., Student and Professor, Academic Advisor, or Campus Librarian) OR a short classroom lecture.
2. Script must be 120-150 words. If dialogue, label lines as "Speaker A: ..." and "Speaker B: ...".
3. Provide a brief context note (e.g. "A conversation between a biology undergraduate and her lab instructor regarding research assignments.").
4. Exactly 3 multiple-choice comprehension questions with 4 options each, correct answer index (0-3), and explanation.

Return JSON format:
{
  "title": "Listening Context Title",
  "context": "Brief 1-sentence situation description",
  "speakers": {"A": "Role of Speaker A", "B": "Role of Speaker B"},
  "script": "Speaker A: ...\\nSpeaker B: ...",
  "questions": [
    {
      "q": "Question prompt?",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "why": "Explanation..."
    }
  ]
}`;
      break;

    case 'listen-repeat':
      prompt = `You are an official ETS TOEFL test creator. Create a TOEFL Speaking "Listen and Repeat" practice set for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
Provide exactly 5 sentences of increasing length and syntactic complexity (sentence 1: 6-8 words, sentence 2: 9-11 words, sentence 3: 12-14 words, sentence 4: 15-17 words, sentence 5: 18-20 words).
All sentences should sound natural in an academic or university campus context.

Return JSON format:
{
  "title": "Listen & Repeat Exercise",
  "sentences": [
    "Sentence 1",
    "Sentence 2",
    "Sentence 3",
    "Sentence 4",
    "Sentence 5"
  ]
}`;
      break;

    case 'speaking-interview':
      prompt = `You are an official ETS TOEFL Speaking examiner. Create a TOEFL Speaking "Take an Interview" practice simulation for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
Create 4 progressive interview questions in a university context:
- Question 1: Familiar campus/personal preference question (simple).
- Question 2: Academic experience or campus resource situation (moderate).
- Question 3: Problem-solving or hypothetical university scenario (challenging).
- Question 4: Complex opinion / policy debate in higher education (advanced).

Return JSON format:
{
  "title": "University Interview Simulation",
  "context": "Context description",
  "questions": [
    {
      "question": "Question text...",
      "prepTimeSeconds": 20,
      "responseTimeSeconds": 45,
      "suggestedPoints": ["Point 1 to mention", "Point 2 to mention"]
    }
  ]
}`;
      break;

    case 'build-sentence':
      prompt = `You are an official ETS TOEFL test creator. Create 5 TOEFL Writing "Build a Sentence" (sentence scramble) items for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
Provide 5 items. Each has:
- context: A conversational or academic question or setup statement.
- words: 5 to 8 scrambled tiles/phrases that together form one grammatically correct response.
- answer: The exact complete target sentence.
- explanation: A short note on the grammatical rule (e.g., inversion, participle clause, relative clause).

Return JSON format:
{
  "title": "Build a Sentence Practice",
  "items": [
    {
      "context": "Context setup line...",
      "words": ["word1", "word2", "word3", "word4", "word5"],
      "answer": "The complete correct sentence.",
      "explanation": "Grammar rule explanation."
    }
  ]
}`;
      break;

    case 'write-email':
      prompt = `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Write an Email" prompt for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
1. situation: A realistic university academic or administrative scenario (100-140 words).
2. recipient: e.g. "Dr. Vance, Academic Department Chair" or "Campus Housing Office".
3. goals: Exactly 3 specific bullet goals the student must achieve in their email (e.g. explain the scheduling conflict, propose an alternative deadline, request confirmation).
4. suggestedWordCount: "80-120 words".

Return JSON format:
{
  "title": "Email Task Title",
  "situation": "Situation description...",
  "recipient": "Recipient name/office",
  "goals": ["Goal 1", "Goal 2", "Goal 3"],
  "suggestedWordCount": "80-120 words"
}`;
      break;

    case 'academic-discussion':
    default:
      prompt = `You are an official ETS TOEFL Writing test designer. Create a TOEFL Writing "Writing for an Academic Discussion" prompt for level: ${levelDesc}.
Topic: ${topic}.
Requirements:
1. professorName: Name of professor (e.g. "Professor Diaz").
2. professorPrompt: An engaging prompt discussing a current academic or societal debate, asking for students' opinions (70-90 words).
3. s1: Student 1 name and a short thoughtful response (35-45 words) taking one stance.
4. s2: Student 2 name and a short thoughtful response (35-45 words) taking an opposing or nuanced stance.
5. question: The specific instruction (e.g. "In your response, express and support your personal opinion, contribute to the discussion, and address points raised by your classmates.").

Return JSON format:
{
  "title": "Academic Discussion Board",
  "professorName": "Professor Name",
  "professorPrompt": "Prompt text...",
  "s1": {"name": "Student A", "text": "Post text..."},
  "s2": {"name": "Student B", "text": "Post text..."},
  "question": "Instruction text..."
}`;
      break;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      systemInstruction:
        'You are an expert ETS TOEFL test design specialist. You strictly generate accurate, valid JSON matching the exact schema requested without markdown delimiters or superfluous commentary.',
      temperature: 0.7,
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
    throw new Error('Failed to parse JSON from AI model response');
  }
}

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any
) {
  const ai = getAiClient();
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
    model: 'gemini-3.8-flash',
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
  voiceName: 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' | 'Charon' = 'Kore'
) {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
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
  mimeType: string = 'audio/webm'
): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const promptText =
    'Transcribe the spoken English speech in this audio accurately. Write out spoken times and numbers as standard words where appropriate to match natural speech (e.g. transcribe "10:00" as "ten o\'clock", "2" as "two", "50%" as "fifty percent"). Return only the exact transcription without introductory phrases or commentary.';

  // 1. Try low-latency dedicated transcription model gemini-3.5-transcribe
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
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
      model: 'gemini-2.5-flash',
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
    model: 'gemini-3.8-flash',
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
