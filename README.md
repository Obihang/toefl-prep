# TOEFL Prep Studio

**Full-Stack 2026 TOEFL iBT® Simulation, Practice & Diagnostic Suite**

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Vite 6](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Express / Vercel Serverless](https://img.shields.io/badge/Backend-Express%20%2F%20Vercel%20Serverless-000000?logo=vercel&logoColor=white)
![Firebase Firestore](https://img.shields.io/badge/Database-Firebase%20Firestore-FFCA28?logo=firebase&logoColor=black)
![Web Speech & Neural TTS](https://img.shields.io/badge/Audio-Neural%20TTS%20%2B%20Whisper%20STT-10B981)

**TOEFL Prep Studio** is a full-stack practice, diagnostic, and full-length mock exam platform engineered specifically for the **updated 2026 ETS TOEFL iBT® format** (effective January 2026). It combines a simulated 2-stage adaptive exam engine, **120 curated questions across all 12 task types (10 per task type)**, a deterministic heuristic local grader + optional multi-provider LLM semantic grader, multi-accent neural audio synthesis, and interactive study tools.

---

## ✨ Key Highlights

- **100% Aligned with the Updated 2026 TOEFL iBT® Format:** Covers all 4 sections (**Reading**, **Listening**, **Writing**, **Speaking**) and all **12 official task types** in authentic section order (`Reading → Listening → Writing → Speaking`).
- **Simulated 2-Stage Adaptive Full Mock Exam Engine:** Implements **Simulated 2-stage adaptive routing** (Module 1 Routing Stage → Module 2 Higher or Standard Difficulty Track) for Reading and Listening with official section timers and non-repeating item pools.
- **Zero-API Offline Mode + Multi-Provider BYOK AI Support:** Works out-of-the-box with **120 curated questions across all 12 task types (10 per task type)** and a **Deterministic heuristic local grader + optional multi-provider LLM semantic grader** (supporting **Google Gemini, Groq, OpenRouter, NVIDIA NIM, OpenAI, DeepSeek, xAI, and Anthropic** keys for infinite AI question generation and deep rubric evaluation).
- **Multi-Accent Neural Audio & Speech Pipeline:** Supports North American (`en-US`), British (`en-GB`), and Australian (`en-AU`) neural voices with gender-aware speaker locking for campus conversations, acoustic exam recording cues, live microphone waveform visualization, and hybrid cloud/offline WebAssembly Whisper transcription.
- **Interactive Study Tools & Official Score Concordance:** Features an instant **double-click passage dictionary lookup popover**, a personal **Vocabulary Bank** with interactive **Flashcard quiz mode**, a **Mistake Notebook** for spaced review, **Score History** with saved essay/transcript inspection, and official **1.0–6.0 Band**, **CEFR (A1–C2)**, **0–5 Task Rubric**, **0–120 Legacy Scale**, and **MyBest®** superscore tracking.

---

## 📋 All 12 Supported 2026 TOEFL iBT® Task Types

| Section | Est. Section Time | Task Type | Format & Assessment Focus |
| :--- | :---: | :--- | :--- |
| **1. Reading** *(Simulated 2-Stage Adaptive)* | **30m** | **Complete the Words (C-Test)** | 55–70 word academic paragraph where the second half of every second word in the target segment is missing (10 inline blanks). Tests lexical, morphological, and contextual accuracy. |
| **1. Reading** *(Simulated 2-Stage Adaptive)* | **30m** | **Read in Daily Life** | Authentic campus/everyday texts (emails, syllabi, notices, schedules, Campus Wire posts) with 2–3 multiple-choice comprehension questions. |
| **1. Reading** *(Simulated 2-Stage Adaptive)* | **30m** | **Read an Academic Passage** | University-level prose (~200 words) with 5 multiple-choice questions targeting *Factual Information*, *Negative Factual*, *Inference*, *Vocabulary in Context*, *Rhetorical Purpose*, and *Sentence Simplification*. |
| **2. Listening** *(Simulated 2-Stage Adaptive)* | **29m** | **Listen and Choose a Response** | Single-turn spoken prompt followed by 4 written options; evaluates pragmatic appropriateness and conversational inference. |
| **2. Listening** *(Simulated 2-Stage Adaptive)* | **29m** | **Listen to a Conversation** | Multi-turn campus or service dialogue with distinct male/female voices and 2 comprehension questions. |
| **2. Listening** *(Simulated 2-Stage Adaptive)* | **29m** | **Listen to an Announcement** | Short spoken campus or academic announcement (~60–90 words) with 2 comprehension questions. |
| **2. Listening** *(Simulated 2-Stage Adaptive)* | **29m** | **Listen to an Academic Talk** | University lecture (~150–220 words) with 4 questions testing main idea, supporting detail, organization, and speaker attitude. |
| **3. Writing** | **23m** | **Build a Sentence** | **5 conversational exchanges per Build a Sentence practice set**, testing scrambled word/chunk syntactic ordering, embedded questions, and complex academic grammar. |
| **3. Writing** | **23m** | **Write an Email** *(7m)* | 7-minute task requiring a structured campus or professional email addressing 3 specific bulleted goals. |
| **3. Writing** | **23m** | **Write for an Academic Discussion** *(10m)* | 10-minute online seminar discussion response (100+ words) engaging with a professor's question and two student posts. |
| **4. Speaking** | **8m** | **Listen and Repeat** *(7 items)* | **7 sentences (8–12s response window) for Listen & Repeat** with progressive sentence length, automatic audio playback, and pronunciation/intelligibility scoring. |
| **4. Speaking** | **8m** | **Take an Interview** *(4 items)* | **4 questions (0s prep, 45s response) for Take an Interview** moving progressively from personal experience to abstract policy/opinion. |

---

## 🛠️ Architecture & Technical Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Web Audio API & MediaRecorder API, `@xenova/transformers` (optional client-side Whisper WebAssembly fallback).
- **Backend:** Express.js (`server.ts` for local development & Node production) and Vercel Serverless Functions (`api/[...route].ts`), sharing unified route handlers in `src/server/` with per-IP rate limiting.
- **Database & Sync:** Firebase Authentication + Cloud Firestore (`firestore.rules`) for shared community question caching, vocabulary definitions, and cross-device progress synchronization, backed by full `localStorage` persistence for offline use.
- **Grading & Failover Pipeline:** Deterministic heuristic local grader + optional multi-provider LLM semantic grader with automatic model discovery, circuit breaking, exponential backoff, and seamless offline fallback.

---

## 🚀 Quick Start & Local Development

### Prerequisites
- **Node.js 22.x** (matching `package.json` engines)
- **npm** 10.x+

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Optional AI Keys (BYOK or `.env`)
The app works immediately out-of-the-box without any `.env` file using the built-in 120-question curated bank and offline evaluator. To enable live AI generation and grading, you can either paste your personal API key directly in the app via the **API Key & AI Model** button in the top navigation bar, or create an optional local `.env` file:
```env
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
NVIDIA_API_KEY=
OPENAI_API_KEY=
```

### 3. Start the Development Server
```bash
npm run dev
```
This launches the unified Express + Vite development server at **`http://localhost:3000`**.

### 4. Type-Check & Build for Production
```bash
# Run TypeScript compiler validation
npm run lint

# Build production client bundle into dist/
npm run build
```

---

## ⚖️ Trademark Disclaimer

*TOEFL® and TOEFL iBT® are registered trademarks of ETS. This project is an independent open-source educational tool and is not affiliated with or endorsed by ETS.*
