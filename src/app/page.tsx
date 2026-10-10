"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Verdict = "PASS" | "FAIL" | "UNCERTAIN";
type ApiResult = Record<string, unknown>;
type View = "front" | "back" | "label";
const viewNames: Record<View, string> = { front: "Front view", back: "Back view", label: "Label close-up" };

function verdictOf(result: ApiResult): Verdict { return String(result.decision ?? result.verdict).toUpperCase() as Verdict; }
function pretty(value: unknown) { return JSON.stringify(value, null, 2); }
function scalar(value: unknown): string { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : ""; }

function statusColor(status: string) {
  const v = status.toUpperCase();
  if (v.includes("PASS") || v.includes("RELEASE") || v === "COMPLIANT") return "text-acid border-acid/30 bg-acid/10";
  if (v.includes("FAIL") || v.includes("CORRECT") || v.includes("REWORK")) return "text-rose-300 border-rose-400/30 bg-rose-400/10";
  if (v.includes("UNCERTAIN") || v.includes("REVIEW") || v.includes("PENDING")) return "text-amber-200 border-amber-300/30 bg-amber-300/10";
  return "text-zinc-300 border-white/10 bg-white/5";
}

function UploadCard({ view, file, onFile }: { view: View; file: File | null; onFile: (file: File | null) => void }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const select = (event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] || null);
  const drop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files?.[0] || null); };
  return <label onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`dropzone relative flex min-h-[186px] cursor-pointer flex-col overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/15 p-3 ${dragging ? "dragging" : ""}`}>
    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={select} className="sr-only" aria-label={`Upload ${viewNames[view]}`} />
    {preview ? <><img src={preview} alt={`${viewNames[view]} preview`} className="absolute inset-0 h-full w-full object-cover opacity-55" /><div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/15" /></> : null}
    <div className="relative z-10 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-zinc-300">{viewNames[view]}</span><span className={`h-1.5 w-1.5 rounded-full ${file ? "bg-acid shadow-[0_0_8px_#c7f36b]" : "bg-zinc-600"}`} /></div>
    <div className="relative z-10 mt-auto flex items-end justify-between gap-2 pt-20"><div className="min-w-0"><div className="truncate text-sm font-medium">{file?.name || "Drop image or browse"}</div><div className="mt-1 text-[11px] text-zinc-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || "unknown format"}` : "JPEG, PNG or WebP · max 12 MB"}</div></div><span className="shrink-0 text-[10px] uppercase tracking-wider text-acid">{file ? "Replace" : "Choose"}</span></div>
  </label>;
}

export default function Home() {
  const [fields, setFields] = useState({ unit_id: "", org_id: "", sku: "", fnsku: "", work_order_id: "", fba_shipment_id: "", wo_handling_marks: "" });
  const [requirements, setRequirements] = useState({ wo_polybag: false, wo_suffocation_warning: false, wo_expiry_date: false });
  const [files, setFiles] = useState<Record<View, File | null>>({ front: null, back: null, label: null });
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy JSON");
  const complete = useMemo(() => Object.values(files).every(Boolean), [files]);
  const verdict = result ? verdictOf(result) : null;

  const onField = (key: keyof typeof fields, value: string) => { setFields((old) => ({ ...old, [key]: value })); setResult(null); setError(""); };
  const updateFile = (view: View, file: File | null) => { setFiles((old) => ({ ...old, [view]: file })); setError(""); setResult(null); };
  async function inspect(event: FormEvent) {
    event.preventDefault(); setResult(null); setError("");
    if (!complete) { setError("Add a front, back and label image before starting an inspection."); return; }
    setBusy(true);
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => body.set(key, value));
    Object.entries(requirements).forEach(([key, value]) => body.set(key, String(value)));
    Object.entries(files).forEach(([key, file]) => { if (file) body.set(key, file, file.name); });
    try {
      const response = await fetch("/api/inspect", { method: "POST", body, cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `Inspection failed (HTTP ${response.status}).`);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The inspection service returned an invalid result.");
      const received = data as ApiResult;
      if (!["PASS", "FAIL", "UNCERTAIN"].includes(verdictOf(received))) throw new Error("The inspection response did not include a recognized verdict.");
      setResult(received);
    } catch (err) { setError(err instanceof Error ? err.message : "Inspection failed. No result was received."); }
    finally { setBusy(false); }
  }
  async function copyJson() {
    if (!result) return;
    try { await navigator.clipboard.writeText(pretty(result)); setCopyLabel("Copied"); setTimeout(() => setCopyLabel("Copy JSON"), 1600); }
    catch { setCopyLabel("Clipboard unavailable"); setTimeout(() => setCopyLabel("Copy JSON"), 1800); }
  }
  function downloadJson() {
    if (!result) return;
    const blob = new Blob([pretty(result)], { type: "application/json" }); const href = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = href; link.download = `${String(result.unit_id || fields.unit_id || "inspection")}-evidence.json`; link.click(); URL.revokeObjectURL(href);
  }

  const rawChecks = (result?.checks ?? (result?.record as ApiResult | undefined)?.checks) as unknown;
  const checks = rawChecks && typeof rawChecks === "object" && !Array.isArray(rawChecks) ? Object.entries(rawChecks as Record<string, unknown>) : [];
  const evidence = result?.evidence ?? (result?.record as ApiResult | undefined)?.evidence;
  const explanation = scalar(result?.explanation ?? result?.issue_explanation ?? (result?.record as ApiResult | undefined)?.issue_explanation);
  const recommendation = scalar(result?.recommendation ?? result?.next_step_recommendation ?? (result?.record as ApiResult | undefined)?.handoff);

  return <main className="grid-bg min-h-screen px-4 py-5 md:px-8 md:py-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md border border-acid/30 bg-acid/10 text-acid"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v8.5M8 5.3l8 4.6"/></svg></div><div><div className="text-xs font-bold uppercase tracking-[.22em]">Prep Manager</div><div className="mt-1 text-[10px] uppercase tracking-[.14em] text-zinc-500">Inbound quality command center</div></div></div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[.14em] text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-acid shadow-[0_0_8px_#c7f36b]"/>Live API · Render</div>
      </header>

      <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section><div className="mb-5 flex items-end justify-between"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-acid">01 / New inspection</div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Package compliance</h1><p className="mt-2 text-sm text-zinc-400">Capture three views. Get a decision from the live Prep Manager engine.</p></div><div className="hidden font-mono text-[10px] text-zinc-600 sm:block">MODE / LIVE UPLOAD</div></div>
          <form onSubmit={inspect} className="panel rounded-2xl p-4 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.17em] text-zinc-400"><span className="text-acid">A</span> Unit & work order</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([["unit_id","Unit ID","UNIT-…"],["org_id","Organisation ID","org_…"],["sku","SKU","SKU…"],["fnsku","FNSKU","X00…"],["work_order_id","Work order","Optional"],["fba_shipment_id","FBA shipment","Optional"],["wo_handling_marks","Handling marks","FRAGILE, LIQUID…"]] as const).map(([key,label,placeholder]) => <label key={key} className={key === "wo_handling_marks" ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}{["unit_id","org_id","sku","fnsku"].includes(key) && <i className="ml-1 text-acid not-italic">*</i>}</span><input required={["unit_id","org_id","sku","fnsku"].includes(key)} maxLength={160} value={fields[key]} onChange={(e) => onField(key,e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 placeholder:text-zinc-600" /></label>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[.07] pt-4">{([["wo_polybag","Polybag required"],["wo_suffocation_warning","Warning required"],["wo_expiry_date","Expiry date required"]] as const).map(([key,label]) => <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={requirements[key]} onChange={(e) => {setRequirements((old) => ({...old,[key]:e.target.checked})); setResult(null); setError("");}} className="accent-[#c7f36b]" />{label}</label>)}</div>
            <div className="mb-3 mt-7 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.17em] text-zinc-400"><span className="text-acid">B</span> Camera captures</div><span className="text-[10px] text-zinc-600">{Object.values(files).filter(Boolean).length} / 3 attached</span></div>
            <div className="grid gap-3 md:grid-cols-3">{(["front","back","label"] as const).map((view) => <UploadCard key={view} view={view} file={files[view]} onFile={(file) => updateFile(view,file)} />)}</div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] text-zinc-500">Images are sent securely to the live inspection API for this request.</p><button disabled={busy} type="submit" className="inline-flex h-12 items-center justify-center gap-3 rounded-lg bg-acid px-5 text-xs font-black uppercase tracking-[.12em] text-[#11150f] transition hover:bg-[#d6ff7d] disabled:cursor-wait disabled:opacity-65"><span>{busy ? "Inspecting" : "Inspect Package"}</span>{busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black"/> : <span aria-hidden="true">↗</span>}</button></div>
            {!complete && !error && <div className="mt-3 text-right text-[10px] text-zinc-600">All three camera views are required to inspect.</div>}
          </form>
        </section>

        <aside className="panel flex flex-col rounded-2xl p-5"><div className="mb-6 text-[10px] font-bold uppercase tracking-[.2em] text-zinc-500">Process route</div><ol className="space-y-5">{[["01","Identify unit","Tenant-scoped request"],["02","Capture evidence","Front · back · label"],["03","Run inspection","Live hosted service"],["04","Handoff","Evidence JSON"]].map(([n,title,sub],i) => <li key={n} className="flex gap-3"><div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${i < 2 && complete ? "border-acid/40 bg-acid/10 text-acid" : "border-white/10 text-zinc-500"}`}>{n}</div><div><div className="text-xs font-medium">{title}</div><div className="mt-1 text-[10px] text-zinc-500">{sub}</div></div></li>)}</ol><div className="mt-auto border-t border-white/[.08] pt-5"><div className="text-[9px] uppercase tracking-[.18em] text-zinc-500">Inspection integrity</div><p className="mt-2 text-[11px] leading-relaxed text-zinc-500">No local sample results. The verdict and evidence below come from the hosted API response.</p><div className="mt-4 flex items-center gap-2 font-mono text-[9px] text-zinc-600"><span className="h-1 w-1 rounded-full bg-acid"/>FRESH INSPECTION REQUEST</div></div></aside>
      </div>

      {error && <section role="alert" className="mb-6 rounded-xl border border-rose-400/25 bg-rose-400/[.06] p-4 text-sm text-rose-200"><div className="flex gap-3"><span className="text-lg">!</span><div><div className="font-semibold">Inspection not completed</div><p className="mt-1 text-xs leading-relaxed text-rose-200/75">{error}</p></div></div></section>}

      {busy && <section aria-live="polite" className="panel relative mb-6 overflow-hidden rounded-2xl p-6"><div className="scanline"/><div className="relative flex items-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-acid"/><div><div className="text-sm font-semibold">Waiting for inspection response</div><div className="mt-1 text-xs text-zinc-500">The hosted service may take a moment to wake and process the captures.</div></div></div></section>}

      {result && verdict && <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel rounded-2xl p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[.08] pb-5"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-zinc-500">Inspection decision</div><div className="flex flex-wrap items-center gap-3"><h2 className="text-3xl font-black tracking-tight">{verdict}</h2><span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${statusColor(verdict)}`}>API verdict</span></div><p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{explanation || "No explanation was included in the API response."}</p></div><div className="flex gap-2"><button onClick={copyJson} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide hover:border-white/25">{copyLabel}</button><button onClick={downloadJson} className="rounded-lg border border-acid/30 bg-acid/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-acid hover:bg-acid/15">Download JSON</button></div></div>
          <div className="mt-5"><div className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-zinc-500">Per-check verdicts</div>{checks.length ? <div className="space-y-2">{checks.map(([name,value]) => { const check = value && typeof value === "object" ? value as Record<string, unknown> : { verdict: value }; const checkVerdict = scalar(check.status ?? check.verdict ?? check.result ?? check.decision) || "REPORTED"; return <article key={name} className="rounded-lg border border-white/[.07] bg-black/15 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs font-semibold capitalize">{name.replaceAll("_"," ")}</div><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusColor(checkVerdict)}`}>{checkVerdict}</span></div>{(scalar(check.explanation ?? check.message ?? check.reason ?? check.details)) && <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{scalar(check.explanation ?? check.message ?? check.reason ?? check.details)}</p>}</article>; })}</div> : <p className="rounded-lg border border-white/[.07] p-3 text-xs text-zinc-500">No per-check results were included in the API response.</p>}</div>
          {evidence !== undefined && <details className="mt-4 rounded-lg border border-white/[.08] bg-black/15"><summary className="cursor-pointer px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Visual evidence payload</summary><pre className="max-h-72 overflow-auto border-t border-white/[.07] p-3 text-[10px] leading-relaxed text-zinc-400">{pretty(evidence)}</pre></details>}
        </div>
        <aside className="panel rounded-2xl p-5"><div className="text-[10px] font-bold uppercase tracking-[.2em] text-zinc-500">Handoff recommendation</div><div className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${statusColor(recommendation || verdict)}`}>{recommendation || "Not provided"}</div><p className="mt-3 text-xs leading-relaxed text-zinc-400">The recommendation shown here is taken from the service response.</p><div className="mt-6 border-t border-white/[.08] pt-4"><div className="text-[9px] uppercase tracking-[.16em] text-zinc-500">Record identifiers</div><div className="mt-3 space-y-2">{[["Unit", result.unit_id ?? fields.unit_id],["Organisation",result.org_id ?? result.tenant ?? fields.org_id],["Task",result.task_id],["Workflow",result.workflow_id],["Rule version",result.rule_version]].filter(([,v]) => v !== undefined && v !== null && v !== "").map(([label,value])=><div key={String(label)} className="flex justify-between gap-3 text-[10px]"><span className="text-zinc-600">{scalar(label)}</span><span className="max-w-[190px] truncate font-mono text-zinc-300">{scalar(value)}</span></div>)}</div></div><div className="mt-5 rounded-lg border border-acid/15 bg-acid/[.04] p-3 text-[10px] leading-relaxed text-zinc-400">The JSON export contains the complete, unmodified response returned by the live API.</div></aside>
      </section>}
      <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t border-white/[.07] pt-4 text-[9px] uppercase tracking-[.14em] text-zinc-700"><span>Prep Manager · Inbound inspection</span><span>Results displayed as received · no simulated verdicts</span></footer>
    </div>
  </main>;
}
