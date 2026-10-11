"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Play, Plus, RotateCw, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAddTarget, useStart, useTargetActions } from "@/lib/api/hooks";
import type { Target } from "@/lib/api/types";
import { EASE, StatusBadge } from "../shared";
import { startRouteProgress } from "../shell/RouteProgress";
import { errorText, normalizeRepoUrl, URL_EXAMPLE, validateRepoUrl } from "./lib";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Status badge that cross-fades when the status changes (cloning → cloned → onboarding → …). */
export function AnimatedStatus({ status, className }: { status: string; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span key={status} className={cn("inline-flex shrink-0", className)} initial={{ opacity: 0, scale: 0.9, y: 2 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -2 }} transition={{ duration: 0.16, ease: EASE }}>
        <StatusBadge status={status} />
      </motion.span>
    </AnimatePresence>
  );
}

/** Indeterminate bar for work whose length is not known (clone, onboarding). */
export function IndeterminateBar({ label, className }: { label: string; className?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-busy="true" className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)}>
      <motion.div aria-hidden className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-trace to-primary" initial={{ x: "-100%" }} animate={{ x: "300%" }} transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }} />
    </div>
  );
}

export const SAFETY_NOTE = "Preflight clones the repository into a sandbox folder on this machine. Nothing runs until you approve the generated adapter, and the target runs in an isolated container.";

/** "Add repository": validates the address while typing, registers the target, and closes; the new card then shows `cloning` and polls. */
export function AddTargetDialog({ variant = "default", size, label = "Add repository" }: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; label?: string }) {
  const add = useAddTarget();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const error = serverError ?? validateRepoUrl(url, { final: submitted });
  const valid = validateRepoUrl(url, { final: true }) === null;
  const reset = () => { setUrl(""); setSubmitted(false); setServerError(null); };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) { inputRef.current?.focus(); return; }
    add.mutate(normalizeRepoUrl(url), {
      onSuccess: (t) => { setOpen(false); reset(); toast.success(`${t.name} added`, { description: "Cloning into the sandbox. Nothing is executed." }); },
      onError: (err) => { setServerError(errorText(err)); inputRef.current?.focus(); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (add.isPending) return; setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button variant={variant} size={size} />}><Plus />{label}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a repository as a test target</DialogTitle>
            <DialogDescription>Paste the address of a public GitHub repository that contains an AI agent.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${uid}-url`}>Repository address</FieldLabel>
            <Input ref={inputRef} id={`${uid}-url`} name="url" type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus
              className="mono" placeholder={URL_EXAMPLE} value={url} disabled={add.isPending}
              onChange={(e) => { setUrl(e.target.value); setServerError(null); }}
              aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : `${uid}-hint`} />
            {error ? <FieldError id={`${uid}-err`} className="break-words">{error}</FieldError>
              : <FieldDescription id={`${uid}-hint`} className="text-xs">{valid ? <span className="inline-flex items-center gap-1 text-pass"><Check aria-hidden className="size-3" />Looks like a GitHub repository.</span> : <>Only <span className="mono">https://github.com/owner/repo</span> is accepted.</>}</FieldDescription>}
          </Field>
          <p className="flex gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-pass" /><span>{SAFETY_NOTE}</span>
          </p>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={add.isPending} />}>Cancel</DialogClose>
            <Button type="submit" disabled={add.isPending || (!!error && !serverError) || !url.trim()} aria-busy={add.isPending}>{add.isPending ? <Spinner /> : <Plus />}{add.isPending ? "Adding…" : "Add repository"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MODES = [
  { value: "dev", label: "dev", hint: "few seeds per attack, small budget" },
  { value: "full", label: "full", hint: "every seed, full budget" },
];

/** Starts an assessment against a target and opens its pipeline. A sandbox target always runs find-only from here. */
export function RunAssessmentDialog({ target, label, variant = "default", size, disabled, className }: { target: Pick<Target, "slug" | "kind" | "name">; label?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; disabled?: boolean; className?: string }) {
  const start = useStart();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("dev");
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const sandbox = target.kind === "sandbox";
  const text = label ?? (sandbox ? "Run find-only assessment" : "New assessment");

  const run = () => {
    setError(null);
    start.mutate({ target: target.slug, mode }, {
      onSuccess: (r) => {
        setOpen(false);
        if (!r.assessment_id) { toast.warning("The assessment was started, but it has not shown up in the ledger yet.", { description: "Pick it from the assessments list in a moment." }); return; }
        toast.success(`Assessment ${r.assessment_id} started`, { description: sandbox ? `Find-only against ${target.name}` : `Against ${target.name}` });
        startRouteProgress();
        router.push(`/a/${r.assessment_id}/pipeline`);
      },
      onError: (e) => { setError(errorText(e)); toast.error("The assessment did not start", { description: errorText(e) }); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (start.isPending) return; setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger render={<Button variant={variant} size={size} disabled={disabled} className={className} />}><Play />{text}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sandbox ? "Run a find-only assessment" : "Start an assessment"}</DialogTitle>
          <DialogDescription>
            {sandbox
              ? <>Preflight builds a container image for <span className="mono break-all text-foreground">{target.name}</span>, starts it, runs the attacks that apply to it, and removes the container when it ends. Nothing is fixed: the result is a list of findings.</>
              : <>Runs the full pipeline against <span className="mono break-all text-foreground">{target.name}</span>: attack, grade, cluster, then one fixer per root cause, which waits for your approval.</>}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel id={`${uid}-mode`}>Mode</FieldLabel>
          <Select items={MODES} value={mode} onValueChange={(v) => v && setMode(v as string)} disabled={start.isPending}>
            <SelectTrigger aria-labelledby={`${uid}-mode`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <FieldDescription className="text-xs">{MODES.find((m) => m.value === mode)?.hint}. Spend is capped in <span className="mono">config.yaml</span>.</FieldDescription>
        </Field>
        {error && <p role="alert" className="rounded-lg border border-fail/30 bg-fail/5 p-3 text-xs leading-relaxed break-words text-fail">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={start.isPending} />}>Cancel</DialogClose>
          <Button onClick={run} disabled={start.isPending} aria-busy={start.isPending}>{start.isPending ? <Spinner /> : <Play />}{start.isPending ? "Starting…" : "Start"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete behind a confirmation. `onDeleted` runs after the API confirmed (the detail page uses it to go back to the list). */
export function DeleteTargetButton({ target, onDeleted, variant = "destructive", size, label = "Delete target" }: { target: Pick<Target, "slug" | "name" | "busy">; onDeleted?: () => void; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; label?: string }) {
  const { remove } = useTargetActions(target.slug);
  const [open, setOpen] = useState(false);
  const confirm = () => {
    remove.mutate(undefined, {
      onSuccess: () => { setOpen(false); toast.success(`${target.name} deleted`, { description: "Clone, container, image and registry entry removed." }); onDeleted?.(); },
      onError: (e) => toast.error("Could not delete the target", { description: errorText(e) }),
    });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!remove.isPending) setOpen(o); }}>
      <DialogTrigger render={<Button variant={variant} size={size} disabled={remove.isPending} aria-busy={remove.isPending} />}>{remove.isPending ? <Spinner /> : <Trash2 />}{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this target?</DialogTitle>
          <DialogDescription>
            This removes the clone of <span className="mono break-all text-foreground">{target.name}</span>, its container and image, the generated adapter and the review patch from this machine. Past assessments stay in the ledger. The repository on GitHub is not touched.
            {target.busy ? " A background job is still working on it, so the API may ask you to try again in a moment." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={remove.isPending} />}>Keep it</DialogClose>
          <Button variant="destructive" onClick={confirm} disabled={remove.isPending} aria-busy={remove.isPending}>{remove.isPending ? <Spinner /> : <Trash2 />}Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Starts the confined onboarder session. Used for the first onboarding and for "Onboard again" after a failure. */
export function OnboardButton({ target, again = false, variant = "default" }: { target: Pick<Target, "slug" | "name">; again?: boolean; variant?: ButtonProps["variant"] }) {
  const { onboard } = useTargetActions(target.slug);
  const go = () => onboard.mutate(undefined, {
    onSuccess: () => toast.success("Onboarding started", { description: "A confined Claude Code session is writing the adapter. It usually takes one to two minutes." }),
    onError: (e) => toast.error("Onboarding did not start", { description: errorText(e) }),
  });
  return <Button variant={variant} onClick={go} disabled={onboard.isPending} aria-busy={onboard.isPending}>{onboard.isPending ? <Spinner /> : again ? <RotateCw /> : <Sparkles />}{again ? "Onboard again" : "Onboard"}</Button>;
}

/** Approve the generated files: the target becomes `ready`, bound to exactly the files on disk. */
export function ApproveButton({ target }: { target: Pick<Target, "slug" | "name"> }) {
  const { approve } = useTargetActions(target.slug);
  const go = () => approve.mutate(undefined, {
    onSuccess: () => toast.success(`${target.name} approved`, { description: "It can now run in a container." }),
    onError: (e) => toast.error("Could not approve", { description: errorText(e) }),
  });
  return <Button onClick={go} disabled={approve.isPending} aria-busy={approve.isPending} className="bg-pass text-background hover:bg-pass/90">{approve.isPending ? <Spinner /> : <Check />}Approve</Button>;
}

/** A failed clone leaves an entry that blocks the same address, so retry = delete the entry, then add the address again. */
export function RetryCloneButton({ target }: { target: Pick<Target, "slug" | "name" | "url"> }) {
  const { remove } = useTargetActions(target.slug);
  const add = useAddTarget();
  const pending = remove.isPending || add.isPending;
  const go = async () => {
    if (!target.url) return;
    try { await remove.mutateAsync(); await add.mutateAsync(target.url); toast.success(`Cloning ${target.name} again`); }
    catch (e) { toast.error("Retry failed", { description: errorText(e) }); }
  };
  return <Button variant="outline" onClick={go} disabled={pending || !target.url} aria-busy={pending}>{pending ? <Spinner /> : <RotateCw />}Retry clone</Button>;
}

/** "Trusted" switch. Turning it on asks first and says what it allows; turning it off is immediate. */
export function TrustToggle({ target }: { target: Pick<Target, "slug" | "name" | "trusted"> }) {
  const { trust } = useTargetActions(target.slug);
  const [open, setOpen] = useState(false);
  const uid = useId();
  const set = (trusted: boolean) => trust.mutate(trusted, {
    onSuccess: () => { setOpen(false); toast.success(trusted ? `${target.name} is now trusted` : `${target.name} is no longer trusted`, { description: trusted ? "Fixers and running without a container are allowed." : "Back to find-only, container only." }); },
    onError: (e) => toast.error("Could not change trust", { description: errorText(e) }),
  });
  return (
    <>
      <div className="flex items-start gap-3">
        <Switch id={uid} checked={target.trusted} disabled={trust.isPending} onCheckedChange={(v) => (v ? setOpen(true) : set(false))} aria-describedby={`${uid}-d`} className="mt-0.5" />
        <div className="min-w-0">
          <label htmlFor={uid} className="flex items-center gap-2 text-sm font-medium">Trusted{trust.isPending && <Spinner className="size-3" />}</label>
          <p id={`${uid}-d`} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Off by default. Turn it on only for code you own.</p>
        </div>
      </div>
      <Dialog open={open} onOpenChange={(o) => { if (!trust.isPending) setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trust this repository?</DialogTitle>
            <DialogDescription>Trusting <span className="mono break-all text-foreground">{target.name}</span> removes the two protections a sandbox target has:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-fail">
            <li><span className="text-foreground">It may run without a container.</span> When Docker is not available and <span className="mono text-xs">PREFLIGHT_ALLOW_UNSANDBOXED=1</span> is set, its start command runs directly on this machine.</li>
            <li><span className="text-foreground">Fixers are enabled.</span> A fixer runs the repository&apos;s tests and a shell on this machine. Fixes stay on local branches and are exported as a patch; nothing is pushed.</li>
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">Only trust code you wrote or fully control. You can turn this off again at any time.</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={trust.isPending} />}>Keep it untrusted</DialogClose>
            <Button variant="destructive" onClick={() => set(true)} disabled={trust.isPending} aria-busy={trust.isPending}>{trust.isPending && <Spinner />}Trust this repository</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
