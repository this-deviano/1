/* GRAIN primitives (§6.8) — Knob, Fader, Meter.
   Interaction contracts: vertical drag (Shift = ÷10 fine), double-click =
   default, wheel = stepped, keyboard arrows. Focus visible (A-02). */

import { useEffect, useRef, useState } from "react";

export function formatVal(v: number, unit?: string, digits = 1): string {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r}${unit ? " " + unit : ""}`;
}

interface KnobProps {
  value: number;
  min: number;
  max: number;
  def?: number;
  label: string;
  unit?: string;
  size?: number;
  onChange: (v: number) => void;
}

export function GrainKnob({ value, min, max, def, label, unit, size = 28, onChange }: KnobProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);
  const dragState = useRef<{ startY: number; startVal: number } | null>(null);
  const range = max - min;
  const norm = (value - min) / range;

  const commit = (v: number) => {
    const c = Math.max(min, Math.min(max, v));
    if (c !== value) onChange(c);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startVal: value };
    setDrag(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const scale = e.shiftKey ? 0.1 : 1;
    const dy = dragState.current.startY - e.clientY;
    commit(dragState.current.startVal + (dy / 160) * range * scale);
  };

  const endDrag = () => {
    dragState.current = null;
    setDrag(false);
  };

  return (
    <div className="grain-knob" style={{ width: size, fontSize: size >= 40 ? 10 : undefined }}>
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        tabIndex={0}
        className="dial"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => def !== undefined && commit(def)}
        onWheel={(e) => {
          e.preventDefault();
          const step = ((e.shiftKey ? range * 0.01 : range * 0.05) * (e.deltaY < 0 ? 1 : -1));
          commit(value + step);
        }}
        onKeyDown={(e) => {
          const fine = e.shiftKey ? range * 0.01 : range * 0.02;
          if (e.key === "ArrowUp") { commit(value + fine); e.preventDefault(); }
          if (e.key === "ArrowDown") { commit(value - fine); e.preventDefault(); }
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            background: `conic-gradient(from 135deg, var(--grain-ember) ${norm * 270}deg, var(--grain-ink-12) ${norm * 270}deg 270deg, transparent 270deg)`,
            mask: "radial-gradient(circle, transparent 0 58%, black 59%)",
            WebkitMask: "radial-gradient(circle, transparent 0 58%, black 59%)",
            opacity: drag ? 1 : 0.55,
            transition: "opacity 80ms var(--grain-e-mech)",
          }}
        />
      </div>
      {drag && (
        <div className="readout">
          {formatVal(value, unit, unit === "Hz" ? 0 : 1)}
        </div>
      )}
      <div className="label">{label}</div>
    </div>
  );
}

interface FaderProps {
  value: number; // dB
  onChange: (v: number) => void;
  length?: number;
  label?: string;
}

export function GrainFader({ value, onChange, length = 96, label }: FaderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const pct = dbToPct(value); // 0..1

  const setFromY = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = 1 - (clientY - r.top) / r.height;
    onChange(pctToDb(Math.max(0, Math.min(1, p))));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        ref={ref}
        className="grain-fader"
        style={{ height: length, width: 32 }}
        role="slider"
        aria-label={label ?? "fader"}
        aria-valuemin={-60}
        aria-valuemax={6}
        aria-valuenow={Math.round(value * 10) / 10}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          dragging.current = true;
          setFromY(e.clientY);
        }}
        onPointerMove={(e) => dragging.current && setFromY(e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { onChange(Math.min(6, value + (e.shiftKey ? 0.1 : 0.5))); e.preventDefault(); }
          if (e.key === "ArrowDown") { onChange(Math.max(-60, value - (e.shiftKey ? 0.1 : 0.5))); e.preventDefault(); }
        }}
      >
        <div className="slot" />
        <div className="cap" style={{ top: `calc(${(1 - pct) * 100}% - ${(1 - pct) * 16}px)` }} />
        <div className="unity" style={{ bottom: `${dbToPct(0) * 100}%` }} />
      </div>
      <div className="value" style={{ fontSize: 11 }}>
        {value <= -59.9 ? "-inf" : formatVal(value, "dB", 1)}
      </div>
    </div>
  );
}

function dbToPct(db: number): number {
  const clamped = Math.max(-60, Math.min(6, db));
  return (clamped + 60) / 66;
}
function pctToDb(p: number): number {
  return p * 66 - 60;
}

export function GrainMeter({ level, height = 120 }: { level: number; height?: number }) {
  // level 0..1, painted as segments; peak region tinted signal
  const pct = Math.max(0, Math.min(1, level)) * 100;
  return (
    <div className="grain-meter" style={{ height }}>
      <div className="fill" style={{ height: `${pct}%` }} />
    </div>
  );
}

/* ---------- toasts (§6.8.8): bottom-center, 3 max, 4 s auto-dismiss ---------- */

export interface ToastMsg {
  id: number;
  text: string;
  kind?: "ember" | "signal" | "ok";
}

let toastId = 1;
let toastListeners: ((t: ToastMsg[]) => void)[] = [];
let toasts: ToastMsg[] = [];

export function toast(text: string, kind: ToastMsg["kind"] = "ember") {
  const t: ToastMsg = { id: toastId++, text, kind };
  toasts = [...toasts.slice(-2), t];
  for (const l of toastListeners) l(toasts);
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    for (const l of toastListeners) l(toasts);
  }, 4000);
}

export function ToastStack() {
  const [list, setList] = useState<ToastMsg[]>(toasts);
  useEffect(() => {
    const l = (t: ToastMsg[]) => setList([...t]);
    toastListeners.push(l);
    return () => {
      toastListeners = toastListeners.filter((x) => x !== l);
    };
  }, []);
  return (
    <div className="toast-stack">
      {list.map((t) => (
        <div key={t.id} className="toast step-shadow">
          <span className="t-kind">{t.kind === "signal" ? "warn" : t.kind === "ok" ? "ok" : "note"}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
