import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function sniffImage(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 }); }

  const views = ["front", "back", "label"] as const;
  const images: Record<(typeof views)[number], { mime: string; bytes: Buffer }> = {} as Record<(typeof views)[number], { mime: string; bytes: Buffer }>;
  for (const view of views) {
    const value = form.get(view);
    if (!(value instanceof File) || value.size === 0) return NextResponse.json({ error: `Upload the ${view} image before inspection.` }, { status: 400 });
    if (value.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `${view} image exceeds the 12 MB limit.` }, { status: 413 });
    const bytes = Buffer.from(await value.arrayBuffer());
    const detectedMime = sniffImage(bytes);
    if (!detectedMime || (value.type && imageTypes.has(value.type) && value.type !== detectedMime)) return NextResponse.json({ error: `${view} image is not a valid JPEG, PNG, or WebP file.` }, { status: 400 });
    images[view] = { mime: detectedMime, bytes };
  }

  const apiBase = (process.env.PREP_API_BASE_URL || "https://cube26-prp-0211-dhanvind360.onrender.com").replace(/\/$/, "");
  const payload = {
    images: Object.fromEntries(views.map((view) => [view, `data:${images[view].mime};base64,${images[view].bytes.toString("base64")}`])),
    force_reinspect: true,
    image_mode: "live_upload",
  };
  const headers: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
  if (process.env.PREP_API_KEY) headers["x-api-key"] = process.env.PREP_API_KEY;
  if (process.env.PREP_API_BEARER_TOKEN) headers.Authorization = `Bearer ${process.env.PREP_API_BEARER_TOKEN}`;

  let response: Response;
  try {
    response = await fetch(`${apiBase}/run`, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(240_000) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "The inspection service timed out. No result was returned; try again." : "The inspection service could not be reached. It may be waking from a cold start; try again shortly." }, { status: 504 });
  }

  const text = await response.text();
  let result: unknown;
  try { result = JSON.parse(text); } catch { return NextResponse.json({ error: `Inspection service returned an unreadable response (HTTP ${response.status}).` }, { status: 502 }); }
  if (!response.ok) {
    const detail = isObject(result) && typeof result.detail === "string" ? result.detail : isObject(result) && typeof result.error === "string" ? result.error : `Inspection service returned HTTP ${response.status}.`;
    return NextResponse.json({ error: detail }, { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
  }
  if (!isObject(result)) return NextResponse.json({ error: "Inspection service returned an invalid result." }, { status: 502 });
  if (result.status === "error" || typeof result.error === "string") return NextResponse.json({ error: typeof result.error === "string" ? result.error : "Inspection service reported an error." }, { status: 502 });
  const verdict = result.decision ?? result.verdict;
  if (typeof verdict !== "string" || !["PASS", "FAIL", "UNCERTAIN"].includes(verdict.toUpperCase())) return NextResponse.json({ error: "Inspection service response did not contain a valid PASS, FAIL, or UNCERTAIN decision." }, { status: 502 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
