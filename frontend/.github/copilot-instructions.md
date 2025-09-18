# Copilot Instructions for Klinik Frontend

## Project Overview
This is a frontend project for an AI Studio app, built with React and TypeScript, using Vite for development and build tooling. The app integrates with external AI services via an API key.

## Key Files and Structure
- `index.tsx`: Main entry point for the React app.
- `index.html`: HTML template for the app.
- `index.css`: Global styles.
- `vite.config.ts`: Vite configuration (customizes build/dev server).
- `tsconfig.json`: TypeScript configuration.
- `.env.local`: Stores sensitive environment variables (e.g., `GEMINI_API_KEY`).
- `README.md`: Contains setup and run instructions.

## Setup and Developer Workflow
- Install dependencies: `npm install`
- Set your Gemini API key in `.env.local` as `GEMINI_API_KEY`
- Start development server: `npm run dev`
- Vite hot-reloads changes for fast feedback.

## Patterns and Conventions
- Use functional React components and hooks.
- TypeScript is enforced for all source files.
- Environment variables are accessed via `import.meta.env`.
- External AI service integration is handled via the Gemini API key.
- Keep all frontend logic within this directory; backend and API logic are handled elsewhere.

## Integration Points
- The app expects a valid Gemini API key for AI features.
- No custom test or build scripts beyond Vite defaults.
- No Redux, MobX, or other state management libraries detected; use React state/hooks.

## Example: Accessing Environment Variables
```ts
const apiKey = import.meta.env.GEMINI_API_KEY;
```

## Additional Notes
- If adding new dependencies, update `package.json` and run `npm install`.
- For deployment, use Vite's build output (`npm run build`).
- Refer to `README.md` for the latest setup instructions.

---
For questions about backend/API integration, see the backend project directory.
