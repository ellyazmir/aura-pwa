<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/38b4142c-0aec-4e1e-92d0-7d3187225227

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `HF_TOKEN` to your Hugging Face token (the app uses Qwen through Hugging Face Inference Providers)
3. Run the app:
   `npm run dev`
