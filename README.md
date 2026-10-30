# TOEFL Prep Studio

**Full-Stack 2026 TOEFL iBT® Simulation, Practice & Diagnostic Suite**

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Vite 6](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Express / Vercel Serverless](https://img.shields.io/badge/Backend-Express%20%2F%20Vercel%20Serverless-000000?logo=vercel&logoColor=white)
![Firebase Firestore](https://img.shields.io/badge/Database-Firebase%20Firestore-FFCA28?logo=firebase&logoColor=black)
![Web Speech & Neural TTS](https://img.shields.io/badge/Audio-Neural%20TTS%20%2B%20Whisper%20STT-10B981)

**TOEFL Prep Studio** is a full-stack practice, diagnostic, and full-length mock exam platform engineered specifically for the **updated 2026 ETS TOEFL iBT® format** (effective January 2026). It combines a multistage adaptive exam engine, a 120-item curated question bank, a deterministic offline local evaluator, multi-accent neural audio synthesis, and optional multi-provider AI generation and grading.

---

## ✨ Key Highlights

- **100% Aligned with the Updated 2026 TOEFL iBT® Format:** Covers all 4 sections (**Reading**, **Listening**, **Writing**, **Speaking**) and all **12 official task types** in authentic section order (`Reading → Listening → Writing → Speaking`).
- **Multistage Adaptive Full Mock Exam Engine:** Simulates Stage 1 (Routing Module) → Stage 2 (Higher or Standard Difficulty Track) multistage adaptive testing for Reading and Listening with official section timers and non-repeating item pools.
- **Zero-API Offline Mode + Multi-Provider BYOK AI Support:** Works out-of-the-box with **120 curated questions** (10 per task type) and an instant deterministic **Local Grader** (catching grammar, academic collocations, spelling, capitalization, word order, and speaking disfluencies), while optionally supporting **Google Gemini, Groq, OpenRouter, NVIDIA NIM, OpenAI, DeepSeek, xAI, and Anthropic** keys for infinite AI question generation and deep rubric grading.
- **Multi-Accent Neural Audio & Speech Pipeline:** Supports North American (`en-US`), British (`en-GB`), and Australian (`en-AU`) neural voices with gender-aware speaker locking for campus conversations, acoustic exam recording cues, live microphone waveform visualization, and hybrid cloud/offline WebAssembly Whisper transcription.
- **Interactive Study Tools & Official Score Concordance:** Features an instant **double-click passage dictionary lookup popover**, a personal **Vocabulary Bank** with interactive **Flashcard quiz mode**, a **Mistake Notebook** for spaced review, **Score History** with saved essay/transcript inspection, and official **1.0–6.0 Band**, **CEFR (A1–C2)**, **0–5 Task Rubric**, **0–120 Legacy Scale**, and **MyBest®** superscore tracking.

---

## 📋 All 12 Supported 2026 TOEFL iBT® Task Types

| Section | Est. Section Time | Task Type | Format & Assessment Focus |
| :--- | :---: | :--- | :--- |
| **1. Reading** *(Multistage Adaptive)* | **30m** | **Complete the Words (C-Test)** | 70–100 word academic paragraph where the second half of every second word is missing (10 inline blanks). Tests lexical, morphological, and contextual accuracy. |
| **1. Reading** *(Multistage Adaptive)* | **30m** | **Read in Daily Life** | Authentic campus/everyday texts (emails, syllabi, notices, schedules, Campus Wire posts) with 2–3 multiple-choice comprehension questions. |
| **1. Reading** *(Multistage Adaptive)* | **30m** | **Read an Academic Passage** | University-level prose (~200 words) with 5 multiple-choice questions targeting *Factual Information*, *Negative Factual*, *Inference*, *Vocabulary in Context*, *Rhetorical Purpose*, and *Sentence Simplification*. |
| **2. Listening** *(Multistage Adaptive)* | **29m** | **Listen and Choose a Response** | Single-turn spoken prompt followed by 4 written options; evaluates pragmatic appropriateness and conversational inference. |
| **2. Listening** *(Multistage Adaptive)* | **29m** | **Listen to a Conversation** | Multi-turn campus or service dialogue with distinct male/female voices and 2 comprehension questions. |
| **2. Listening** *(Multistage Adaptive)* | **29m** | **Listen to an Announcement** | Short spoken campus or academic announcement (~60–90 words) with 2 comprehension questions. |
| **2. Listening** *(Multistage Adaptive)* | **29m** | **Listen to an Academic Talk** | University lecture (~150–220 words) with 4 questions testing main idea, supporting detail, organization, and speaker attitude. |
| **3. Writing** | **23m** | **Build a Sentence** | 10-item scrambled word/chunk syntactic ordering drill testing complex academic grammar and clause structure. |
| **3. Writing** | **23m** | **Write an Email** *(7m)* | 7-minute task requiring a structured campus or professional email addressing 3 specific bulleted goals. |
| **3. Writing** | **23m** | **Write for an Academic Discussion** *(10m)* | 10-minute online seminar discussion response (100+ words) engaging with a professor's question and two student posts. |
| **4. Speaking** | **8m** | **Listen and Repeat** *(7 items)* | 7 progressive sentence repetition items (8 to 18 words) with automatic audio playback and pronunciation/intelligibility scoring. |
| **4. Speaking** | **8m** | **Take an Interview** *(4 items)* | 4 back-to-back spoken interview questions (45 seconds each, zero prep time) moving from personal experience to abstract policy/opinion. |

---

## 🛠️ Architecture & Technical Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Web Audio API & MediaRecorder API, `@xenova/transformers` (optional client-side Whisper WebAssembly fallback).
- **Backend:** Express.js (`server.ts` for local development & Node production) and Vercel Serverless Functions (`api/[...route].ts`), sharing unified route handlers in `src/server/`.
- **Database & Sync:** Firebase Authentication + Cloud Firestore (`firestore.rules`) for shared community question caching, vocabulary definitions, and cross-device progress synchronization, backed by full `localStorage` persistence for offline use.
- **Resilient AI Failover Chain:** Automatic model discovery, dead-model circuit breaking, exponential backoff, and seamless fallback from cloud AI providers to the built-in Curated Bank and Local Rule-Based Evaluator.

---

## 🚀 Quick Start & Local Development

### Prerequisites
- **Node.js** 18.x or 20.x+
- **npm** 9.x+

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
