# 10-Minute Smoke Test Checklist
Run this checklist on your Vercel Preview URL before merging any changes to `main`.

## 1. Generation & Data
- [ ] Go to Dashboard > Settings > Data. Click **🔄 Re-Sync All Shards**. Verify it completes without freezing and refreshes questions.
- [ ] In Dashboard > Settings, press **Test** on each saved API key and confirm "Connected".
- [ ] Change Level and Topic in the task header. Confirm the next question matches (or the "closest available" notice appears).
- [ ] Select "Science & Technology" + "Advanced". Click **Generate New with AI**. Verify a fresh question appears.

## 2. Reading & Listening
- [ ] Complete a Reading Passage. Verify selecting the correct option turns green.
- [ ] Highlight a word in the passage. Verify the Dictionary pop-up appears and shows definitions without errors.
- [ ] In Listening dialogue, click play audio. Verify audio plays and the two speakers have different voices (one male, one female).

## 3. Speaking & Transcriber
- [ ] Go to Speaking -> Listen & Repeat. Click **Test Voice Synthesis**. Verify you hear the prompt audio.
- [ ] Click **Speak**. Record "This is a test." Verify the offline Web Worker Whisper (or Groq STT) transcribes it within 5 seconds without crashing the browser.
- [ ] Click **Hear My Recording**. Verify it plays back without echoing.

## 4. Writing & Grading
- [ ] Go to Academic Discussion. Type a 50-word response.
- [ ] Click **Evaluate Response**. Verify the AI Grade (Band 1.0-6.0) and vocabulary feedback appear.
- [ ] Report an issue on any question (click the **Report** button, type "Smoke Test", and submit). Confirm a new document appears in the Firestore "reports" collection.

## 5. Live System Status & Error Monitoring
- [ ] Open the **Live System Status** panel (via the server activity icon in the top navigation). Confirm all rows show **OK** (Backend Server, AI Providers, Database, Speech Synthesis, Speech-to-Text).
- [ ] Press **Send test error** in the status panel and confirm the error appears in Sentry with no API keys in the breadcrumbs or event message.
