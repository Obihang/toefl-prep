import { GoogleGenAI } from '@google/genai';
import { resolveModelChains } from './modelRoles';
import { generateWithFallback } from './geminiUtils';
import { isKeyError, getStatus, isQuotaExhaustedError } from './geminiErrors';
import { callChatWithHealing } from './chatHealing';
import { getAiClient, getModelThinkingConfig, cleanAndExtractJson, type ApiCallOptions } from './geminiHandler';
import { collectAvailableProviders, prioritizeForEvaluation } from './providerRouter';
import { evaluateResponseLocally } from '../utils/localEvaluator';

export async function handleEvaluateResponse(
  taskType: string,
  promptData: any,
  studentResponse: any,
  options?: ApiCallOptions
) {
  try {
    const evaluationPrompt = `You are a strict, objective ETS 2026 TOEFL iBT grader. Grade the user's response on a strict 1.0 to 6.0 Band scale using these exact anchors. DO NOT inflate scores.
- BAND 6.0 (Advanced - 29-30/30): Flawless or near-flawless. Uses highly complex academic syntax, precise vocabulary, and perfectly natural transitions. Fully develops the argument with concrete, specific details. Minor slips are extremely rare and do not obscure meaning.
- BAND 4.5 to 5.0 (High Intermediate - 21-26/30): Addresses the prompt well. Generally good control of grammar and vocabulary, but relies on some repetitive or generic structures. Contains occasional noticeable grammatical or lexical errors that do not interfere with meaning.
- BAND 3.0 to 4.0 (Low Intermediate - 13-20/30): Partially develops the topic. Uses basic sentence structures. Noticeable and frequent errors in grammar, word choice, or hesitation. May lack detail or fail to fully address all parts of the prompt.
- BAND 1.0 to 2.5 (Basic - 0-12/30): Fragmented ideas, severe grammar/vocabulary limitations that obscure meaning, or fails to address the prompt.

MANDATORY COMPLETENESS, RELEVANCE, FLUENCY & ANTI-PLAGIARISM CHECKS:
1. Prompt Copying / Plagiarism: If the student copied large portions (> 45%) of the prompt, passage, or classmate posts verbatim, you MUST score 1.0 to 1.5 and explicitly instruct them to use their own words.
2. Off-Topic Check: If the response does not address the specific prompt topic or required bullet points, cap the score at 1.5 to 2.0.
3. Natural Conversational Fillers (Speaking Interview): Per ETS 2026 Guidelines (PDF Pages 27-28), do NOT penalize natural conversational fillers ('um', 'uh') unless excessive (> 8% of total spoken words). Evaluate idea development, conversational rhythm, and communicative effectiveness.
4. Task-Specific Completeness Rules:
   - speaking_interview / speaking-interview: Check how many of the 4 interview questions (Q1..Q4) the student actually answered in studentResponse. If only k out of 4 questions have real answers (e.g., 1 of 4), multiply/cap the final band score by (k / 4) rounded to the nearest 0.5 (minimum 1.0).
   - speaking_listen_repeat / listen-repeat: Base the score strictly on sequential word-order accuracy across all 7 sentences (unanswered sentences count as 0%).
   - writing_email / write-email: Verify whether all 3 required bullet points (goals) in promptData were addressed, whether the tone/register matches the recipient, and evaluate against the official 7-minute target length (80-130 words for Band 5.0-6.0; do NOT penalize a 90-130 word email for length).
   - writing_discussion / academic-discussion: Verify whether the student expressed a clear opinion on the professor's question, contributed a new point beyond the 2 existing student posts, and wrote at least 100+ words with strong syntactic variety for Band 5.0-6.0.

Task Type: "${taskType}"

Task Prompt and Requirements:
${JSON.stringify(promptData, null, 2)}

Student's Submission:
${JSON.stringify(studentResponse, null, 2)}

Scoring Scale Reference:
- bandScore6: Official section Band Score on the 1.0 to 6.0 scale in 0.5 increments (1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0).
- rawRubricScore: Official ETS 2026 raw task rubric score out of 5.0 (for ALL tasks: Write an Email, Academic Discussion, Listen & Repeat, and Take an Interview).
- scaledScore: Legacy scaled score out of 30 (Band 6.0 = 29-30, Band 5.5 = 27-28, Band 5.0 = 24-26, Band 4.5 = 21-23, Band 4.0 = 17-20, Band 3.0-3.5 = 13-16, Band 2.0-2.5 = 7-12, Band 1.0-1.5 = 0-6).
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
      let rawBand = typeof parsed?.bandScore6 === 'number'
        ? parsed.bandScore6
        : typeof parsed?.overallBand === 'number'
        ? parsed.overallBand
        : typeof parsed?.bandScore === 'number'
        ? parsed.bandScore
        : 4.5;

      // Run deterministic guardrail check for speaking_interview k/4 completeness and prompt-copying
      const localGuard = evaluateResponseLocally(promptData, studentResponse, taskType);
      if (localGuard?.copiedPromptDetected) {
        rawBand = Math.min(rawBand, 1.5);
      } else if (localGuard?.offTopicDetected) {
        rawBand = Math.min(rawBand, 2.0);
      }
      if (
        (taskType === 'speaking-interview' || taskType === 'speaking_interview') &&
        typeof localGuard?.answeredQuestionsCount === 'number' &&
        localGuard.answeredQuestionsCount < 4
      ) {
        const k = Math.max(0, localGuard.answeredQuestionsCount);
        const maxPossibleForK = Math.max(1.0, Math.round((6.0 * (k / 4)) * 2) / 2);
        rawBand = Math.min(rawBand, maxPossibleForK);
      }

      const bandScore6 = Math.max(1.0, Math.min(6.0, Math.round(rawBand * 2) / 2));
      const rawRubric = typeof parsed?.rawRubricScore === 'number'
        ? Math.min(rawBand <= 2.0 ? 2.0 : 5.0, parsed.rawRubricScore)
        : Number(((bandScore6 / 6.0) * 5.0).toFixed(1));
      const scaled = bandScore6 >= 6.0
        ? 30
        : bandScore6 >= 5.5
        ? 28
        : bandScore6 >= 5.0
        ? 25
        : bandScore6 >= 4.5
        ? 22
        : bandScore6 >= 4.0
        ? 19
        : bandScore6 >= 3.5
        ? 16
        : bandScore6 >= 3.0
        ? 14
        : bandScore6 >= 2.5
        ? 11
        : bandScore6 >= 2.0
        ? 9
        : bandScore6 >= 1.5
        ? 6
        : 4;

      const performanceLevel =
        bandScore6 >= 5.5
          ? 'Advanced'
          : bandScore6 >= 4.0
          ? 'High-Intermediate'
          : bandScore6 >= 2.5
          ? 'Low-Intermediate'
          : 'Basic';
      const summary = String(parsed?.feedbackSummary || parsed?.summary || localGuard.summary || '').trim();
      const rewrite = String(parsed?.modelBand6Rewrite || parsed?.exemplarResponse || parsed?.exemplar || localGuard.exemplar || '').trim();

      let topFixes: string[] = [];
      if (Array.isArray(parsed?.topFixes) && parsed.topFixes.length > 0) {
        topFixes = parsed.topFixes.map((f: any) => String(f).trim()).filter(Boolean).slice(0, 3);
      } else if (Array.isArray(parsed?.tips) && parsed.tips.length > 0) {
        topFixes = parsed.tips.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 3);
      }
      if (localGuard?.copiedPromptDetected && !topFixes.some((f) => f.toLowerCase().includes('copy'))) {
        topFixes.unshift('Avoid copying sentences directly from the prompt; use your own words.');
      }
      if (localGuard?.offTopicDetected && !topFixes.some((f) => f.toLowerCase().includes('off-topic'))) {
        topFixes.unshift('Your response appears off-topic and does not address the prompt requirements.');
      }

      const aiErrors = Array.isArray(parsed?.errors)
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
      const errorsList = aiErrors.length > 0 ? aiErrors : localGuard.corrections || [];

      const tipsList = Array.isArray(parsed?.tips) ? parsed.tips.map((t: any) => String(t).trim()).filter(Boolean) : topFixes;

      return {
        bandScore6,
        overallBand: bandScore6,
        bandScore: bandScore6,
        rawRubricScore: rawRubric,
        scaledScore: scaled,
        performanceLevel,
        feedbackSummary: summary,
        summary,
        topFixes,
        areasForImprovement: topFixes,
        improvements: topFixes,
        modelBand6Rewrite: rewrite,
        exemplarResponse: rewrite,
        exemplar: rewrite,
        errors: errorsList,
        corrections: errorsList,
        grammarErrors: errorsList,
        tips: tipsList,
        modelUsed,
      };
    };

    // 1. Collect all available providers and prioritize for evaluation (Reasoning priority: gemini -> openai -> anthropic -> openrouter -> groq -> nvidia)
    const candidates = collectAvailableProviders(options);
    const prioritized = prioritizeForEvaluation(candidates);

    // 2. Dynamic Fallback Loop
    for (const candidate of prioritized) {
      try {
        if (candidate.provider === 'gemini') {
          const ai = getAiClient(candidate.apiKey);
          if (!ai) continue;

          const chains = await resolveModelChains('gemini', candidate.apiKey);
          const evalChain = chains.evaluation.length > 0 ? chains.evaluation : chains.generation;

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
        } else {
          const { text, modelUsed } = await callChatWithHealing({
            provider: candidate.provider,
            apiKey: candidate.apiKey,
            baseUrl: candidate.baseUrl,
            model: candidate.model,
            purpose: 'evaluation',
            prompt: evaluationPrompt,
            systemInstruction: "You are a strict, objective ETS TOEFL iBT grader. Grade the user's response on a strict 1.0 to 6.0 Band scale using official ETS anchors without score inflation. Return valid JSON only.",
            responseJson: true,
            temperature: 0.3,
          });

          const parsed = cleanAndExtractJson(text);
          return normalizeEvalResult(parsed, modelUsed);
        }
      } catch (candidateErr: any) {
        const status = getStatus(candidateErr);
        const isQuota = isQuotaExhaustedError(candidateErr) || status === 429;
        const isUnavailable = status === 503;
        console.warn(`Evaluation provider [${candidate.provider}] failed (${isQuota ? '429 Quota Exceeded' : isUnavailable ? '503 Unavailable' : candidateErr?.message || candidateErr}), continuing to next provider in chain...`);
        continue;
      }
    }
  } catch (err: any) {
    console.warn('All evaluation providers failed or error encountered, falling back to local scoring engine:', err?.message || err);
  }

  // Graceful Local Heuristic Fallback
  return evaluateResponseLocally(promptData, studentResponse, taskType);
}

