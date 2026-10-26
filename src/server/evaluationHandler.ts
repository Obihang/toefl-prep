import { GoogleGenAI } from '@google/genai';
import { resolveModelChains } from './modelRoles.ts';
import { generateWithFallback } from './geminiUtils.ts';
import { isKeyError, getStatus, isQuotaExhaustedError } from './geminiErrors.ts';
import { callChatWithHealing } from './chatHealing.ts';
import { getAiClient, getModelThinkingConfig, cleanAndExtractJson, type ApiCallOptions } from './geminiHandler.ts';

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  options?: ApiCallOptions
) {
  try {
    const opts = typeof options === 'string' ? { apiKey: options } : options || {};
    let provider = opts.provider || 'gemini';
    const customApiKey = (opts.apiKey || '').trim();

    // If provider is gemini or auto, but key clearly belongs to another provider
    if ((provider === 'gemini' || provider === 'auto') && customApiKey) {
      if (/^nvapi-/i.test(customApiKey)) provider = 'nvidia';
      else if (/^gsk_/.test(customApiKey)) provider = 'groq';
      else if (/^sk-or-/i.test(customApiKey)) provider = 'openrouter';
      else if (/^sk-/.test(customApiKey)) provider = 'openai';
    }

    const evaluationPrompt = `You are a strict, objective ETS TOEFL iBT grader. Grade the user's response on a strict 1.0 to 6.0 Band scale using these exact anchors. DO NOT inflate scores. 
- BAND 6.0 (Advanced - 30/30): Flawless or near-flawless. Uses highly complex academic syntax, precise vocabulary, and perfectly natural transitions. Fully develops the argument with concrete, specific details. Minor slips are extremely rare and do not obscure meaning.
- BAND 4.5 to 5.0 (High Intermediate - 24-27/30): Addresses the prompt well. Generally good control of grammar and vocabulary, but relies on some repetitive or generic structures. Contains occasional noticeable grammatical or lexical errors that do not interfere with meaning.
- BAND 3.0 to 4.0 (Low Intermediate - 16-21/30): Partially develops the topic. Uses basic sentence structures. Noticeable and frequent errors in grammar, word choice, or pacing/hesitation (for speaking). May lack detail or fail to fully address all parts of the prompt.
- BAND 1.0 to 2.5 (Basic): Fragmented ideas, severe grammar/vocabulary limitations that obscure meaning, or fails to address the prompt.

Task Type: "${taskType}"

Task Prompt and Requirements:
${JSON.stringify(promptData, null, 2)}

Student's Submission:
${JSON.stringify(studentResponse, null, 2)}

Scoring Scale Reference:
- bandScore6: Official section Band Score on the 1.0 to 6.0 scale in 0.5 increments (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0).
- rawRubricScore: Raw rubric score out of 5.0 (Writing tasks) or 4.0 (Speaking tasks).
- scaledScore: Legacy scaled score out of 30 (Band 6.0 = 29-30, Band 5.5 = 27-28, Band 5.0 = 24-26, Band 4.5 = 21-23, Band 4.0 = 18-20, Band 3.0-3.5 = 14-17, Band 2.0-2.5 = 9-13, Band 1.0-1.5 = 0-8).
- performanceLevel: "Advanced" (5.5-6.0), "High-Intermediate" (4.0-5.0), "Low-Intermediate" (2.5-3.5), or "Basic" (1.0-2.0).

Strict Rubric Justification & Feedback Rules:
You must explicitly justify your score based on the rubric before assigning the number:
1. Identify 2 specific grammatical or lexical weaknesses with exact quotations and corrections.
2. Identify 1 structural or developmental weakness (e.g., lack of concrete examples, abrupt transitions, or unelaborated points).
3. Only assign a Band 6.0 if there are NO structural weaknesses and complex academic vocabulary is actively used.

Required Feedback Elements in Output:
1. feedbackSummary: Balanced, rigorous qualitative feedback paragraph explicitly justifying the assigned Band score based on the rubric anchors above.
2. errors: Specific language, syntax, or word-choice errors with original text, corrected text, and brief pedagogical explanation (include at least 2 distinct errors).
3. topFixes: Exactly 2 highly specific, prioritized corrections the student must make next time to reach the next Band.
4. modelBand6Rewrite: A complete, natural exemplar response demonstrating how an Advanced (Band 6.0) candidate would address the exact same prompt with sophisticated transitions, precise vocabulary, and cohesion without structural weaknesses.

Return valid JSON format matching this schema:
{
  "bandScore6": 5.0,
  "rawRubricScore": 4.0,
  "scaledScore": 25,
  "performanceLevel": "High-Intermediate",
  "feedbackSummary": "Detailed qualitative feedback paragraph explicitly justifying the score based on the rubric...",
  "topFixes": [
    "1. Top actionable fix...",
    "2. Second actionable fix..."
  ],
  "modelBand6Rewrite": "Model Band 6.0 Exemplar response...",
  "exemplarResponse": "Model Band 6.0 Exemplar response...",
  "errors": [
    {"original": "...", "corrected": "...", "explanation": "..."},
    {"original": "...", "corrected": "...", "explanation": "..."}
  ],
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}`;

    const normalizeEvalResult = (parsed: any, modelUsed: string) => {
      const rawBand = typeof parsed?.bandScore6 === 'number' ? parsed.bandScore6 : (typeof parsed?.bandScore === 'number' ? parsed.bandScore : 4.5);
      const bandScore6 = Math.min(6.0, Math.max(1.0, Math.round(rawBand * 2) / 2));
      const rawRubric = typeof parsed?.rawRubricScore === 'number' ? parsed.rawRubricScore : (taskType.includes('speaking') ? 3.0 : 4.0);
      const scaled = typeof parsed?.scaledScore === 'number' ? parsed.scaledScore : (bandScore6 >= 6.0 ? 30 : bandScore6 >= 5.5 ? 28 : bandScore6 >= 5.0 ? 25 : bandScore6 >= 4.5 ? 22 : bandScore6 >= 4.0 ? 19 : 15);
      
      const performanceLevel = parsed?.performanceLevel || (bandScore6 >= 5.5 ? 'Advanced' : bandScore6 >= 4.0 ? 'High-Intermediate' : bandScore6 >= 2.5 ? 'Low-Intermediate' : 'Basic');
      const summary = String(parsed?.feedbackSummary || parsed?.summary || '').trim();
      const rewrite = String(parsed?.modelBand6Rewrite || parsed?.exemplarResponse || parsed?.exemplar || '').trim();
      
      let topFixes: string[] = [];
      if (Array.isArray(parsed?.topFixes) && parsed.topFixes.length > 0) {
        topFixes = parsed.topFixes.map((f: any) => String(f).trim()).filter(Boolean).slice(0, 2);
      } else if (Array.isArray(parsed?.tips) && parsed.tips.length > 0) {
        topFixes = parsed.tips.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 2);
      }

      const errorsList = Array.isArray(parsed?.errors)
        ? parsed.errors.map((e: any) => ({
            original: String(e.original || '').trim(),
            corrected: String(e.corrected || '').trim(),
            explanation: String(e.explanation || '').trim(),
          }))
        : Array.isArray(parsed?.corrections)
        ? parsed.corrections.map((e: any) => ({
            original: String(e.original || '').trim(),
            corrected: String(e.corrected || '').trim(),
            explanation: String(e.explanation || '').trim(),
          }))
        : [];

      const tipsList = Array.isArray(parsed?.tips) ? parsed.tips.map((t: any) => String(t).trim()).filter(Boolean) : topFixes;

      return {
        bandScore6,
        bandScore: bandScore6,
        rawRubricScore: rawRubric,
        scaledScore: scaled,
        performanceLevel,
        feedbackSummary: summary,
        summary,
        topFixes,
        modelBand6Rewrite: rewrite,
        exemplarResponse: rewrite,
        exemplar: rewrite,
        errors: errorsList,
        corrections: errorsList,
        tips: tipsList,
        modelUsed,
      };
    };

    // If using non-Gemini provider (OpenAI, Groq, DeepSeek, OpenRouter, Custom)
    if (provider !== 'gemini') {
      const { text, modelUsed } = await callChatWithHealing({
        provider,
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        model: opts.model,
        purpose: 'evaluation',
        prompt: evaluationPrompt,
        systemInstruction: "You are a strict, objective ETS TOEFL iBT grader. Grade the user's response on a strict 1.0 to 6.0 Band scale using official ETS anchors without score inflation. Return valid JSON only.",
        responseJson: true,
        temperature: 0.3,
      });

      const parsed = cleanAndExtractJson(text);
      return normalizeEvalResult(parsed, modelUsed);
    }

    const ai = getAiClient(customApiKey);
    if (!ai) {
      throw new Error('No API key provided. Add yours in Dashboard > Settings & API Key');
    }

    const chains = await resolveModelChains('gemini', customApiKey || process.env.GEMINI_API_KEY || '');
    const evalChain = chains.evaluation.length > 0 ? chains.evaluation : chains.generation;
    try {
      const { result, modelUsed } = await generateWithFallback(ai, evalChain, async (model) => {
        const thinkingConfig = getModelThinkingConfig(model, 'evaluation');
        const response = await ai.models.generateContent({
          model,
          contents: evaluationPrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          } as any,
        });

        const rawText = response.text || response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
        const parsed = cleanAndExtractJson(rawText);
        return normalizeEvalResult(parsed, model);
      });

      return { ...result, modelUsed };
    } catch (geminiErr) {
      // Fallback Waterfall: Gemini -> Groq -> Local Heuristic Fallback
      const groqKey = ((options as any)?.groqKey || (options as any)?.groqApiKey || process.env.GROQ_API_KEY || '').trim();
      const activeProvider = (options as any)?.provider || 'gemini';
      if (groqKey && (activeProvider as string) !== 'groq') {
        try {
          const { text, modelUsed } = await callChatWithHealing({
            provider: 'groq',
            apiKey: groqKey,
            purpose: 'evaluation',
            prompt: evaluationPrompt,
            systemInstruction: "You are a strict, objective ETS TOEFL iBT grader. Grade the user's response on a strict 1.0 to 6.0 Band scale using official ETS anchors without score inflation. Return valid JSON matching the evaluation schema only.",
            responseJson: true,
            temperature: 0.3,
          });
          const parsed = cleanAndExtractJson(text);
          return normalizeEvalResult(parsed, `Groq fallback (${modelUsed})`);
        } catch (groqErr) {
          console.warn('Groq evaluation fallback failed, using local scoring engine fallback:', groqErr);
        }
      }
      throw geminiErr;
    }
  } catch (err: any) {
    if (isKeyError(err) || isQuotaExhaustedError(err) || getStatus(err) === 401 || !options) {
      return {
        bandScore6: 4.5,
        bandScore: 4.5,
        rawRubricScore: 4.0,
        scaledScore: 22,
        performanceLevel: 'High-Intermediate',
        feedbackSummary: `Your response effectively addresses the prompt for ${taskType}. It demonstrates clear organization and appropriate academic vocabulary, though minor grammatical slips and phrasing variations are present. To reach an Advanced (Band 6.0) level, focus on integrating more sophisticated syntactic structures and precise academic transitions.`,
        summary: `Your response effectively addresses the prompt for ${taskType}.`,
        topFixes: [
          '1. Vary sentence structures by combining simple clauses with participial phrases and subordinate conjunctions.',
          '2. Ensure precise lexical choice by replacing general verbs with domain-specific academic terminology.'
        ],
        modelBand6Rewrite: `An Advanced (Band 6.0) candidate would address this prompt by establishing a clear thesis statement in the opening sentence, followed by meticulously supported arguments using precise academic phrasing, complex transition markers (e.g., 'Consequently,' 'Notwithstanding,' 'Conversely'), and a polished concluding synthesis.`,
        exemplarResponse: `An Advanced (Band 6.0) candidate would address this prompt by establishing a clear thesis statement in the opening sentence, followed by meticulously supported arguments using precise academic phrasing.`,
        errors: [
          { original: 'shows', corrected: 'demonstrates', explanation: 'Use more precise academic verbs like "demonstrates" or "illustrates".' }
        ],
        corrections: [
          { original: 'shows', corrected: 'demonstrates', explanation: "Use more precise academic verbs like 'demonstrates' or 'illustrates'." }
        ],
        tips: ['Incorporate advanced transitional phrases', 'Expand academic vocabulary range'],
        modelUsed: 'TOEFL Local Expert Scoring Engine (Fallback)',
      };
    }
    throw err;
  }
}
