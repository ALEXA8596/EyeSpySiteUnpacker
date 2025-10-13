# EyeSpy Site Unpacker - AI Agent Instructions

## Project Overview
This is a Next.js 15 app that extracts content from websites and converts it into AI-generated podcast content. The application follows a multi-step pipeline: scrape → analyze → generate descriptions/excerpts → create podcast script → synthesize audio → merge into final podcast.

## Architecture Patterns

### API Route Processing Pipeline
All API routes follow the pattern: `src/app/api/{feature}/route.ts`
- `scrapeWebsite/route.ts` - Web scraping entry point using node-html-parser
- `generateDescriptions/route.ts` - Google Gemini AI for SEO descriptions  
- `generateWpExcerpt/route.ts` - WordPress excerpt generation
- `generateScript/route.ts` - Two-speaker podcast script generation
- `scriptToAudio/route.ts` - Google Cloud TTS with voice mapping

### Frontend State Management
Main page (`src/app/page.tsx`) uses React state for sequential processing:
```tsx
const [log, setLog] = useState<string[]>([]);  // Process tracking
const [pageBodies, setPageBodies] = useState<PageBody[]>([]);  // Scraped content
const [podcastFiles, setPodcastFiles] = useState<AudioFiles[]>([]);  // TTS output
```

### Audio Processing Architecture
- Uses FFmpeg.wasm for client-side audio merging
- Two-voice system: alternating speakers mapped to Google Cloud TTS voices
- Auto-merging pipeline converts individual segments into complete podcast
- Base64 audio data flows through component props

## Key Utilities (`src/utils/`)
- `getBodyText.ts` - HTML scraping and text extraction
- `getPriorityLinks.ts` - Smart link filtering for content extraction
- `scriptTransfer.ts` - localStorage persistence and JSON export/import for podcast segments
- `sanitizeFileName.ts` - File naming safety

## Environment Dependencies
```env
GEMINI_API_KEY=  # Google Gemini AI
GOOGLE_API_KEY=  # Google Cloud TTS
```

## Multi-Page Application Structure
- `/` - Main single-site processing
- `/batch` - Bulk website processing with status tracking
- `/podcast-editor` - Script editing and re-synthesis tools

## Critical Patterns

### Error Handling
All async operations use try-catch with user-facing log updates:
```tsx
setLog((prev) => [...prev, "✅ Success message"]);
setLog((prev) => [...prev, "❌ Error message"]);
```

### Voice Mapping Strategy
TTS uses consistent speaker assignment via `speakerMap` object:
- Speaker labels preserve voice consistency across segments
- Fallback to alternating pattern if no labels provided
- Voice pool: `en-US-Chirp3-HD-Sulafat`, `en-US-Chirp3-HD-Algenib`

### Bootstrap Integration
Uses Bootstrap 5.3.7 with careful Next.js integration:
- CSS imported globally, JS loaded dynamically to prevent SSR conflicts
- Custom styling with inline styles for branded containers

## Development Workflow

### Local Development
```bash
npm run dev --turbopack  # Uses Turbopack for faster builds
```

### Key File Dependencies
- `service-account.json` - Google Cloud credentials (gitignored)
- `next.config.ts` - Next.js 15 configuration
- `tsconfig.json` - TypeScript strict mode enabled

## Common Debugging Points
1. **FFmpeg Loading**: Check browser console for WebAssembly load errors
2. **API Rate Limits**: Both Gemini and Google Cloud TTS have usage quotas
3. **CORS Issues**: Web scraping may fail on protected sites
4. **Audio Synthesis**: Large scripts may timeout during TTS processing

## Data Flow Architecture
```
URL Input → Web Scraping → Content Analysis → AI Generation → TTS Synthesis → Audio Merging → Export
```

Each step updates the log state and can fail independently. The application gracefully continues processing even if individual steps fail, allowing partial results to be useful.

## Component Reuse Pattern
`CombinedAudioPlayer` component is reused across pages with identical FFmpeg auto-merging logic. When modifying audio handling, update this shared component to maintain consistency across the application.