"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Download,
  RefreshCw,
  FileSpreadsheet,
  FileCode,
  Check,
} from "lucide-react";
import { executeBlogImportAction, type ImportRecord } from "@/app/actions/blog";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type ParsedRawRecord = Record<string, string>;

export function BlogImportClient() {
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRawRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Column mappings
  const [mapping, setMapping] = useState<{
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    category: string;
    author: string;
    tags: string;
    status: string;
    publishedAt: string;
  }>({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    category: "",
    author: "",
    tags: "",
    status: "",
    publishedAt: "",
  });

  // Validated records for preview
  const [mappedRecords, setMappedRecords] = useState<ImportRecord[]>([]);
  const [validationIssues, setValidationIssues] = useState<
    { index: number; title: string; issue: string; severity: "error" | "warning" }[]
  >([]);

  // Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    errors: { row: number; title: string; reason: string }[];
  } | null>(null);

  // Handle file reading
  function handleFileSelect(selectedFile: File) {
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setParseError(null);

    const reader = new FileReader();
    const isJson = selectedFile.name.endsWith(".json");
    const isCsv = selectedFile.name.endsWith(".csv");
    const isMd = selectedFile.name.endsWith(".md") || selectedFile.name.endsWith(".markdown");

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setParseError("The file is empty.");
          return;
        }

        if (isJson) {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          if (!list.length) throw new Error("JSON file contains no array or records");
          const keys = Object.keys(list[0]);
          setRawHeaders(keys);
          setRawRows(list.map((item) => {
            const row: ParsedRawRecord = {};
            for (const k of keys) {
              row[k] = typeof item[k] === "object" ? JSON.stringify(item[k]) : String(item[k] ?? "");
            }
            return row;
          }));
          autoDetectMapping(keys);
          setStep(2);
        } else if (isCsv) {
          const { headers, rows } = parseCsv(text);
          if (!headers.length || !rows.length) throw new Error("No data found in CSV file.");
          setRawHeaders(headers);
          setRawRows(rows);
          autoDetectMapping(headers);
          setStep(2);
        } else if (isMd) {
          const parsed = parseMarkdownFile(text, selectedFile.name);
          setRawHeaders(["title", "content", "excerpt", "category", "tags"]);
          setRawRows([parsed]);
          autoDetectMapping(["title", "content", "excerpt", "category", "tags"]);
          setStep(2);
        } else {
          // Attempt CSV fallback
          const { headers, rows } = parseCsv(text);
          if (headers.length && rows.length) {
            setRawHeaders(headers);
            setRawRows(rows);
            autoDetectMapping(headers);
            setStep(2);
          } else {
            throw new Error("Unsupported file format. Please upload .csv, .json, or .md");
          }
        }
      } catch (err: unknown) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file");
      }
    };

    reader.readAsText(selectedFile);
  }

  function autoDetectMapping(headers: string[]) {
    const find = (keywords: string[]) => {
      return (
        headers.find((h) => keywords.some((k) => h.toLowerCase().trim() === k.toLowerCase())) ||
        headers.find((h) => keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))) ||
        ""
      );
    };

    setMapping({
      title: find(["title", "headline", "post_title", "name"]),
      slug: find(["slug", "post_slug", "url", "permalink"]),
      content: find(["content", "body", "post_content", "markdown", "text", "html"]),
      excerpt: find(["excerpt", "summary", "description", "short_description"]),
      category: find(["category", "categories", "topic", "section"]),
      author: find(["author", "author_name", "writer", "creator"]),
      tags: find(["tags", "post_tags", "keywords", "labels"]),
      status: find(["status", "post_status", "state"]),
      publishedAt: find(["published_at", "publish_date", "date", "created_at"]),
    });
  }

  function preparePreview() {
    if (!mapping.title || !mapping.content) {
      alert("Please map both the Title and Content columns before proceeding.");
      return;
    }

    const records: ImportRecord[] = [];
    const issues: { index: number; title: string; issue: string; severity: "error" | "warning" }[] = [];

    rawRows.forEach((row, i) => {
      const title = row[mapping.title]?.trim() || "";
      const content = row[mapping.content]?.trim() || "";
      const slug = mapping.slug ? row[mapping.slug]?.trim() : "";
      const excerpt = mapping.excerpt ? row[mapping.excerpt]?.trim() : "";
      const category = mapping.category ? row[mapping.category]?.trim() : "";
      const author = mapping.author ? row[mapping.author]?.trim() : "";
      const status = mapping.status ? row[mapping.status]?.toLowerCase().trim() : "draft";
      const publishedAt = mapping.publishedAt ? row[mapping.publishedAt]?.trim() : "";
      
      let tags: string[] = [];
      if (mapping.tags && row[mapping.tags]) {
        tags = row[mapping.tags]
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }

      if (!title) {
        issues.push({ index: i + 1, title: "(Untitled)", issue: "Missing required post title", severity: "error" });
      }
      if (!content) {
        issues.push({ index: i + 1, title: title || "(Untitled)", issue: "Missing post content", severity: "error" });
      }
      if (content && content.length < 50) {
        issues.push({ index: i + 1, title: title, issue: "Content is very brief (<50 chars)", severity: "warning" });
      }

      records.push({
        title,
        slug,
        content,
        excerpt,
        category,
        author,
        tags,
        status: status === "publish" || status === "published" ? "published" : "draft",
        publishedAt: publishedAt || undefined,
      });
    });

    setMappedRecords(records);
    setValidationIssues(issues);
    setStep(4);
  }

  async function runImport() {
    const validRecords = mappedRecords.filter((r) => r.title.trim() && r.content.trim());
    if (!validRecords.length) {
      alert("No valid records to import. All rows have missing title or content.");
      return;
    }

    setIsImporting(true);
    setStep(5);

    try {
      const res = await executeBlogImportAction(validRecords);
      if (res.ok && res.summary) {
        setImportSummary({
          ...res.summary,
          skipped: mappedRecords.length - validRecords.length,
        });
      } else {
        alert(res.error || "Import failed");
      }
    } catch {
      alert("Import operation failed due to a server error.");
    } finally {
      setIsImporting(false);
      setStep(6);
    }
  }

  function downloadSample(type: "csv" | "json") {
    let content = "";
    let mime = "";
    let ext = "";

    if (type === "csv") {
      content = `title,slug,content,excerpt,category,author,tags,status,published_at\n"10 Content Strategies for 2026","10-content-strategies-2026","# Content Strategies\\n\\nHere are ten actionable strategies...","A complete playbook for creators","Strategy","MultiPost Studio Team","growth;social;planning",published,2026-03-01\n"Scaling Multi-Platform Publishing","scaling-multi-platform-publishing","# Scaling Multi-Platform\\n\\nCross-posting efficiently...","How to avoid burnout across 7 channels","Automation","MultiPost Studio Team","automation;tools",draft,`;
      mime = "text/csv;charset=utf-8;";
      ext = "csv";
    } else {
      content = JSON.stringify(
        [
          {
            title: "10 Content Strategies for 2026",
            slug: "10-content-strategies-2026",
            content: "# Content Strategies\n\nHere are ten actionable strategies...",
            excerpt: "A complete playbook for creators",
            category: "Strategy",
            author: "MultiPost Studio Team",
            tags: ["growth", "social", "planning"],
            status: "published",
            published_at: "2026-03-01",
          },
        ],
        null,
        2
      );
      mime = "application/json;charset=utf-8;";
      ext = "json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blog_import_template.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadErrorReport() {
    if (!importSummary?.errors.length) return;
    const lines = ["Row,Title,Error Reason"];
    importSummary.errors.forEach((e) => {
      lines.push(`"${e.row}","${e.title.replace(/"/g, '""')}","${e.reason.replace(/"/g, '""')}"`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blog_import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Wizard Progress Stepper */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {[
            { s: 1, label: "1. Upload File" },
            { s: 2, label: "2. Verify File" },
            { s: 3, label: "3. Map Columns" },
            { s: 4, label: "4. Preview & Validate" },
            { s: 5, label: "5. Processing" },
            { s: 6, label: "6. Summary" },
          ].map((item) => (
            <div
              key={item.s}
              className={`flex items-center gap-1.5 font-medium ${
                step === item.s
                  ? "text-[var(--accent)] font-semibold"
                  : step > item.s
                  ? "text-[var(--success,#10b981)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  step === item.s
                    ? "bg-[var(--accent)] text-white"
                    : step > item.s
                    ? "bg-[var(--success,#10b981)] text-white"
                    : "bg-[var(--surface-hover)] text-[var(--text-muted)]"
                }`}
              >
                {step > item.s ? <Check className="h-3.5 w-3.5" /> : item.s}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center transition hover:border-[var(--accent)]">
            <Upload className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
            <h3 className="mt-4 text-base font-semibold text-[var(--text)]">Choose a file or drag & drop</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Supported formats: CSV, JSON, Markdown (.md), or plain text export
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <label className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                <span>Browse Files</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.json,.md,.markdown,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </label>
            </div>
          </div>

          {parseError && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--destructive,#ef4444)]/30 bg-[var(--destructive,#ef4444)]/10 p-4 text-sm text-[var(--destructive,#ef4444)]">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Sample Templates Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div>
              <h4 className="text-sm font-semibold text-[var(--text)]">Need a sample format template?</h4>
              <p className="text-xs text-[var(--text-muted)]">
                Download starter templates with pre-configured headers matching MultiPost Studio Blog fields.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadSample("csv")}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>CSV Template</span>
              </button>
              <button
                type="button"
                onClick={() => downloadSample("json")}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>JSON Template</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Verify File */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-[var(--accent)]" />
                <div>
                  <h3 className="text-base font-semibold text-[var(--text)]">{fileName}</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {rawRows.length} records detected • {rawHeaders.length} columns found
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setFile(null);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Change file
              </button>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Detected Columns
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {rawHeaders.map((h) => (
                  <span
                    key={h}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text)]"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-between border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <span>Continue to Column Mapping</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Map Columns */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h3 className="text-base font-semibold text-[var(--text)]">Map File Columns to Blog Fields</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              MultiPost Studio auto-detected your fields. Confirm or adjust the mappings below.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { key: "title", label: "Post Title", required: true },
                { key: "content", label: "Content (Markdown/HTML)", required: true },
                { key: "slug", label: "URL Slug", required: false },
                { key: "excerpt", label: "Excerpt / Summary", required: false },
                { key: "category", label: "Category", required: false },
                { key: "author", label: "Author Name", required: false },
                { key: "tags", label: "Tags (semicolon or comma separated)", required: false },
                { key: "status", label: "Status (published / draft)", required: false },
                { key: "publishedAt", label: "Published Date", required: false },
              ].map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="flex items-center justify-between text-xs font-semibold text-[var(--text)]">
                    <span>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </span>
                    {field.required && <span className="text-[10px] text-red-500">Required</span>}
                  </label>
                  <select
                    value={mapping[field.key as keyof typeof mapping]}
                    onChange={(e) =>
                      setMapping({ ...mapping, [field.key]: e.target.value })
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  >
                    <option value="">-- Do not map --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-between border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={preparePreview}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <span>Preview & Validate Records</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Preview & Validate */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text)]">Preview & Pre-Flight Validation</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Review how your data will be imported into the database.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--success,#10b981)]/10 px-3 py-1 text-xs font-semibold text-[var(--success,#10b981)]">
                {mappedRecords.filter((r) => r.title && r.content).length} ready to import
              </span>
              {validationIssues.length > 0 && (
                <span className="rounded-full bg-[var(--destructive,#ef4444)]/10 px-3 py-1 text-xs font-semibold text-[var(--destructive,#ef4444)]">
                  {validationIssues.length} issues detected
                </span>
              )}
            </div>
          </div>

          {validationIssues.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--destructive,#ef4444)]/30 bg-[var(--destructive,#ef4444)]/5 p-4 text-xs">
              <h4 className="font-semibold text-[var(--destructive,#ef4444)]">Pre-flight Validation Warnings:</h4>
              <ul className="mt-2 space-y-1">
                {validationIssues.map((v, i) => (
                  <li key={i} className="flex items-center gap-2 text-[var(--text)]">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-mono text-[var(--text-muted)]">Row {v.index}:</span>
                    <span className="font-medium">{v.title}</span>
                    <span className="text-[var(--text-muted)]">— {v.issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Row</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Author</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Content Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {mappedRecords.slice(0, 10).map((r, i) => (
                  <tr key={i} className="hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {r.title || <span className="text-red-500 italic">Missing title</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.category || "—"}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{r.author || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{r.status}</span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-[var(--text-muted)]">
                      {r.content?.slice(0, 60)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mappedRecords.length > 10 && (
              <div className="border-t border-[var(--border)] p-3 text-center text-xs text-[var(--text-muted)]">
                Showing first 10 of {mappedRecords.length} records.
              </div>
            )}
          </div>

          <div className="flex justify-between border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={runImport}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              <span>Execute Import ({mappedRecords.filter((r) => r.title && r.content).length} Posts)</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Processing */}
      {step === 5 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">
          <RefreshCw className="mx-auto h-12 w-12 animate-spin text-[var(--accent)]" />
          <h3 className="mt-4 text-lg font-semibold text-[var(--text)]">Importing articles into database...</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Resolving categories, authors, slug uniqueness, and writing initial revisions. Please wait.
          </p>
        </div>
      )}

      {/* STEP 6: Summary Report */}
      {step === 6 && importSummary && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--success,#10b981)]" />
            <h3 className="mt-3 text-xl font-bold text-[var(--text)]">Import Completed</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Your bulk import job has finished executing. Here is the operational summary:
            </p>

            <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-2xl font-bold text-[var(--success,#10b981)]">{importSummary.imported}</p>
                <p className="text-xs text-[var(--text-muted)]">Successfully Imported</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-2xl font-bold text-amber-500">{importSummary.skipped}</p>
                <p className="text-xs text-[var(--text-muted)]">Skipped (Invalid)</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-2xl font-bold text-[var(--destructive,#ef4444)]">{importSummary.failed}</p>
                <p className="text-xs text-[var(--text-muted)]">Failed</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {importSummary.errors.length > 0 && (
                <button
                  type="button"
                  onClick={downloadErrorReport}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Error Report</span>
                </button>
              )}
              <Link
                href="/admin/blog"
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <span>View All Posts in Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {importSummary.errors.length > 0 && (
            <div className="rounded-xl border border-[var(--destructive,#ef4444)]/30 bg-[var(--card)] p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--destructive,#ef4444)]">
                <XCircle className="h-4 w-4" />
                <span>Import Errors Detail ({importSummary.errors.length})</span>
              </h4>
              <div className="mt-3 divide-y divide-[var(--border)] overflow-x-auto text-xs">
                {importSummary.errors.map((e, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 text-[var(--text)]">
                    <span className="font-mono text-[var(--text-muted)]">Row {e.row}</span>
                    <span className="font-medium">{e.title}</span>
                    <span className="text-[var(--destructive,#ef4444)]">{e.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Helpers for parsing CSV & Markdown */

function parseCsv(text: string): { headers: string[]; rows: ParsedRawRecord[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let insideQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (c === "," && !insideQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: ParsedRawRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: ParsedRawRecord = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseMarkdownFile(text: string, filename: string): ParsedRawRecord {
  let title = filename.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]/g, " ");
  let content = text;
  let excerpt = "";
  let category = "";
  let tags = "";

  // Check frontmatter
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) {
      const frontmatter = text.slice(3, end);
      content = text.slice(end + 3).trim();
      const lines = frontmatter.split("\n");
      for (const line of lines) {
        const [key, ...rest] = line.split(":");
        if (!key || !rest.length) continue;
        const val = rest.join(":").trim().replace(/^["']|["']$/g, "");
        const k = key.trim().toLowerCase();
        if (k === "title") title = val;
        if (k === "excerpt" || k === "description") excerpt = val;
        if (k === "category") category = val;
        if (k === "tags") tags = val;
      }
    }
  }

  return { title, content, excerpt, category, tags };
}
