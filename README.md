# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ba11f36d-d4ce-4efc-a02e-ca3f668e616c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in `.env` to your Gemini API key. To enable text-generation fallback, also set `OPENROUTER_API_KEY` (create one at https://openrouter.ai/keys); OpenRouter is used only when Gemini is unavailable or rate-limited. Its account credits and privacy policies apply, although requests are restricted to providers declaring no data collection. The default fallback uses `openrouter/auto` with its low-cost routing tier and a maximum output of 1,800 tokens. Voice synthesis continues to use Gemini.
3. Run the app:
   `npm run dev`

# kharisma_ai
