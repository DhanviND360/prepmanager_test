# Prep Manager Command Center

Standalone Next.js frontend for live Prep Manager package inspections. It sends the uploaded front, back, and label image contents to the hosted Render `/run` endpoint and displays the response returned by that service. It has no local inspection engine, sample records, or mock results.

## Requirements

- Node.js 20.9 or newer
- npm

## Install and run

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). For a production build, run `npm run build` and then `npm start`.

## Environment

`PREP_API_BASE_URL` defaults to `https://cube26-prp-0211-dhanvind360.onrender.com`. If the hosted service requires authentication, set `PREP_API_KEY` or `PREP_API_BEARER_TOKEN` in the server environment. Do not add either credential to a `NEXT_PUBLIC_` variable or commit `.env.local`.

## Live request behavior

The frontend requires all three image views; unit, organisation, SKU, FNSKU and work-order details are optional local fields. An optional CSV upload is parsed in the browser and can fill those fields from its first data row. CSV contents and optional fields stay in the browser and are never sent to the inspection agent. The server proxy validates image size and signatures, then sends `/run` a JSON body containing only the uploaded `images.front`, `images.back`, and `images.label` Base64 data URLs plus the fixed live-upload and cache-bypass flags. It never calls reference-based dataset inspection endpoints. Image contents are not logged or persisted by this frontend.

The response must be valid JSON with a `PASS`, `FAIL`, or `UNCERTAIN` decision/verdict. API errors, timeouts, malformed JSON, and invalid verdicts render as errors; previous results are cleared when a new inspection starts. The page only displays check details, evidence, recommendations and identifiers present in the service response. Copy and Download JSON export the unmodified backend response.

The hosted service's live `/openapi.json` (version 3.0.0, Round 3 adapter) documents `/run` as a JSON operation. `AgentRunRequest.images` is a map of view names to Base64 strings, URLs, or local paths; this frontend sends Base64 data URLs. `AgentRunResponse` documents the decision, verdict, recommendation, explanation, checks, evidence, optional full record and execution metadata.

## Security and limits

- Images are limited to 12 MB each and JPEG, PNG, or WebP.
- The browser sends images only to this site's `/api/inspect` route. The route forwards them to the configured API server and does not log request bodies.
- API credentials are added only by the server route.
- Render cold starts may take time; the proxy allows up to four minutes before returning a visible timeout error.
