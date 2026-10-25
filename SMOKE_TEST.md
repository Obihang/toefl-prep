# 10-Minute Smoke Test Checklist
Run this checklist on your Vercel Preview URL before merging any changes to `main`.

## 1. Generation & Data
- [ ] Go to Dashboard > Settings > Data. Click **Sync & Clean Bank**. Verify it completes without freezing.
- [ ] Select "Science & Technology" + "Advanced". Click **Generate New with AI**. Verify a question appears.

## 2. Reading & Listening
- [ ] Complete a Reading Passage. Verify selecting the correct option turns green.
- [ ] Highlight a word in the passage. Verify the Dictionary pop-up appears and shows definitions without errors.

## 3. Speaking & Transcriber
- [ ] Go to Speaking -> Listen & Repeat. Click **Test Voice Synthesis**. Verify you hear the prompt audio.
- [ ] Click **Speak**. Record "This is a test." Verify the offline Web Worker Whisper (or Groq STT) transcribes it within 5 seconds without crashing the browser.
- [ ] Click **Hear My Recording**. Verify it plays back without echoing.

## 4. Writing & Grading
- [ ] Go to Academic Discussion. Type a 50-word response.
- [ ] Click **Evaluate Response**. Verify the AI Grade (Band 1.0-6.0) and vocabulary feedback appear.
- [ ] Click the **Report** button in the bottom corner, type "Smoke Test", and submit. Verify success toast.
