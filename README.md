<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1XcGnyZ0KyT8CtSFC9Bfga1ucBGeCPJY8

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set these values in `.env.local`:
   - `GEMINI_API_KEY`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
3. Run the app:
   `npm run dev`

## Netlify

Set the same `VITE_FIREBASE_*` and `GEMINI_API_KEY` environment variables in Netlify (Site settings -> Environment variables) before deploying.
