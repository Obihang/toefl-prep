# TOEFL Prep Studio 🎓

> **Note**: *This is a vibe coded toefl practice code solely for personal practice.*

An interactive, browser-based TOEFL practice suite designed around the latest test formats and ETS scoring standards (including the 1.0–6.0 Band Scale). Practice Reading, Listening, Speaking, and Writing tasks with authentic test timing, Web Speech audio synthesis and recognition, and AI-powered diagnostic rubric evaluations.

---

## 🌟 Key Features

- **8 Authentic TOEFL iBT Task Types**:
  1. **Reading · Complete the Words (C-Test)**: Academic paragraph with masked second halves of content words, letter length guidance, and instant scoring.
  2. **Reading · Academic Passage**: Multi-paragraph reading texts with a text highlighter tool, 3 multiple-choice comprehension questions, and official distractor rationales.
  3. **Listening · Academic Dialogue & Lecture**: Web Speech API audio synthesis with dual-speaker voices (Student & Professor), animated audio visualizer, transcript toggle, and comprehension questions.
  4. **Speaking · Listen & Repeat**: 5 progressive sentences, audio playback, live speech recognition dictation, and word-by-word accuracy matching.
  5. **Speaking · Take an Interview**: 4 academic interview questions with preparation (15–25s) and speaking response (45–60s) countdown timers, audio chimes, microphone speech recording, and AI diagnostic feedback.
  6. **Writing · Build a Sentence**: Scrambled tiles to construct grammatically valid academic syntax with instant rules feedback.
  7. **Writing · Write an Email**: Realistic campus/workplace situation with 3 mandatory criteria, word counter, and tone/task evaluation.
  8. **Writing · Academic Discussion**: Discussion forum format with a professor's prompt and 2 classmate perspectives, word counter, and peer engagement scoring.
- **Dual Mode Practice**:
  - **Instant Practice**: Curated question bank across 3 proficiency levels (`Intermediate`, `Upper-Intermediate`, `Advanced`) and 5 academic topics.
  - **AI Generation & Evaluation**: Powered by Google Gemini (`gemini-3.8-flash`) for endless custom questions and official ETS rubric feedback (band scores, 0–30 scaled scores, and grammar corrections).
- **Analytics & History**: Local browser test history tracking scores across all four sections, estimated total TOEFL score (0–120), and CEFR level (B1, B2, C1).
- **Official Rubrics Guide**: Built-in ETS scoring standards reference modal.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ installed

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your Gemini API key from [Google AI Studio](https://aistudio.google.com/):
```env
GEMINI_API_KEY="your-gemini-api-key"
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser (Google Chrome or Microsoft Edge recommended for Web Speech API speech synthesis & microphone dictation).

### 5. Production Build
```bash
npm run build
npm start
```

---

## 📤 Pushing to GitHub

To publish this project to your GitHub account:

```bash
# 1. Initialize git
git init

# 2. Stage all files
git add .

# 3. Commit the initial release
git commit -m "Initial commit: TOEFL Prep Studio"

# 4. Create a new repository on GitHub (via github.com or GitHub CLI)
# If using GitHub CLI:
gh repo create toefl-prep-studio --public --source=. --remote=origin --push

# Or if you created an empty repo on github.com:
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
