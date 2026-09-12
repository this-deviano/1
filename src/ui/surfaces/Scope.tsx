/* Scope — analysis suite (§8.9): spectrum, waveform, level history, numbers.
   Honest data from the master analyser; 0 VU line labeled at −18 dBFS. */

import { useEffect, useRef } from "react";
import { engine } from "../../lib/engine";
import { useStatus } from "../../lib/status";
import { useStore } from "../../lib/store";

export function Scope() {
  const specRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const histRef = useRef<HTMLCanvasElement | null>(null);
  const status = useStatus();
  const song = useStore((s) => s.song);

  useEffect(() => {
    let raf = 0;
    const spec = new Uint8Array(256);
    const wave = new Float32Array(512);

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      engine.getSpectrum(spec);
      const sc = specRef.current;
      if (sc) {
        const ctx = sc.getContext("2d");
        if (ctx) {
          const w = sc.clientWidth * dpr;
          const h = sc.clientHeight * dpr;
          if (sc.width !== w || sc.height !== h) {
            sc.width = w;
            sc.height = h;
          }
          ctx.clearRect(0, 0, w, h);
          const bars = 96;
          const bw = w / bars;
          for (let i = 0; i < bars; i++) {
            // log-ish frequency mapping
            const idx = Math.floor(Math.pow(i / bars, 1.7) * 200) + 2;
            const v = spec[idx] / 255;
            const bh = v * h;
            ctx.fillStyle = i > bars * 0.82 ? "rgba(194,47,30,0.8)" : i > bars * 0.6 ? "rgba(201,138,30,0.8)" : "rgba(92,107,74,0.85)";
            ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1 * dpr), bh);
          }
          // 0 VU-ish reference
          ctx.fillStyle = "rgba(32,28,21,0.25)";
          ctx.fillRect(0, h * 0.25, w, 1);
        }
      }

      engine.getWave(wave);
      const wc = waveRef.current;
      if (wc) {
        const ctx = wc.getContext("2d");
        if (ctx) {
          const w = wc.clientWidth * dpr;
          const h = wc.clientHeight * dpr;
          if (wc.width !== w || wc.height !== h) {
            wc.width = w;
            wc.height = h;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = "rgba(78,110,126,0.9)";
          ctx.lineWidth = 1.2 * dpr;
          ctx.beginPath();
          for (let i = 0; i < wave.length; i++) {
            const x = (i / (wave.length - 1)) * w;
            const y = h / 2 - wave[i] * (h / 2) * 0.92;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.strokeStyle = "rgba(32,28,21,0.2)";
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          ctx.stroke();
        }
      }

      const hc = histRef.current;
      if (hc) {
        const ctx = hc.getContext("2d");
        if (ctx) {
          const w = hc.clientWidth * dpr;
          const h = hc.clientHeight * dpr;
          if (hc.width !== w || hc.height !== h) {
            hc.width = w;
            hc.height = h;
          }
          ctx.clearRect(0, 0, w, h);
          const hist = engine.meterWave();
          const n = Math.min(hist.length, 96);
          const bw2 = w / 96;
          for (let i = 0; i < n; i++) {
            const v = hist[hist.length - n + i];
            const bh = Math.min(1, v) * h;
            ctx.fillStyle = v > 0.98 ? "rgba(194,47,30,0.9)" : "rgba(62,122,78,0.75)";
            ctx.fillRect(i * bw2, h - bh, Math.max(1, bw2 - 1), bh);
          }
        }
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const db = status.clipAvg > 0 ? Math.max(-60, 20 * Math.log10(status.clipAvg)) : -60;

  return (
    <div className="scope">
      <div className="scope-cell">
        <h4>spectrum · log frequency</h4>
        <canvas ref={specRef} />
      </div>
      <div className="scope-cell">
        <h4>waveform · master</h4>
        <canvas ref={waveRef} />
      </div>
      <div className="scope-cell">
        <h4>peak history · 96 frames</h4>
        <canvas ref={histRef} />
      </div>
      <div className="scope-cell">
        <h4>readouts</h4>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, font: "var(--grain-type-value)" }}>
          <Row k="peak" v={`${db.toFixed(1)} dBFS`} />
          <Row k="sample rate" v={`${engine.ctx ? (engine.ctx.sampleRate / 1000).toFixed(1) : "—"} kHz`} />
          <Row k="rta latency" v={`${status.latencyMs} ms`} />
          <Row k="underruns" v={String(status.underruns)} />
          <Row k="tempo" v={`${song.qpm} qpm`} />
          <div className="micro" style={{ marginTop: 6 }}>
            0 vu line drawn at −18 dbfs · p-07 honest numbers
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--grain-ink-12)", paddingBottom: 4 }}>
      <span className="micro" style={{ color: "var(--grain-ink-64)" }}>
        {k}
      </span>
      <span>{v}</span>
    </div>
  );
}
