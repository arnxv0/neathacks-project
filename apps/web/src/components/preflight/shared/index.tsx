"use client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("mono text-[0.78rem] text-muted-foreground", className)}>{children}</span>;
}

export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function LiveDot({ on, className }: { on: boolean; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", on ? "bg-pass pulse-ring" : "bg-muted-foreground/40", className)} />;
}

const TONE: Record<string, string> = {
  pass: "bg-pass/15 text-pass border-pass/30", fail: "bg-fail/15 text-fail border-fail/30", pending: "bg-pending/15 text-pending border-pending/30",
  trace: "bg-trace/15 text-trace border-trace/30", checkpoint: "bg-checkpoint/15 text-checkpoint border-checkpoint/30", muted: "bg-muted text-muted-foreground border-border",
};
export function Tone({ tone = "muted", children, className }: { tone?: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("rounded-md font-medium", TONE[tone], className)}>{children}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: keyof typeof TONE =
    ["merged", "passed", "approved", "DONE"].includes(status) ? "pass" :
    ["failed", "rejected", "needs_human", "STOPPED"].includes(status) ? "fail" :
    ["await_approval", "replaying", "fixing", "running", "AWAIT_APPROVAL", "FIX"].includes(status) ? "pending" : "muted";
  return <Tone tone={tone}>{status.replace(/_/g, " ")}</Tone>;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  // tiny markdown: headings, bullets, code fences, inline code, bold, links
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/```([\s\S]*?)```/g, (_, c) => `<pre>${c}</pre>`)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^- (.*)$/gm, "<li>$1</li>").replace(/^(?!<h|<li|<pre|<\/)(.+)$/gm, "<p>$1</p>");
  return <div className={cn("prose-md", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
