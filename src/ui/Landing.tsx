/* Landing — GRAIN (§6): warm paper, ink, ember. No gradients, no glass,
   no emoji, no dark-mode-only design (G-12). Typography carries the beauty. */

import { cmdLaunchBench } from "../lib/launch";

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-rail">
        <div className="logo-mark" aria-hidden />
        <div className="wordmark">
          LUTHIER <span>· the instrument for making instruments</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="grain-btn small" onClick={cmdLaunchBench}>
            Open the Bench
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-kicker">
          <div className="rule" />
          <span className="micro">Digital audio workstation · runs in your browser · offline</span>
        </div>
        <h1 className="hero-verb">Begin.</h1>
        <p className="hero-sub">
          A workshop for building songs out of sound. Pattern grid, piano roll, arrangement
          timeline, and mix console — one material object behind all of them. Edit a clip once
          and every view follows. No account, no subscription, no telemetry.
        </p>
        <div className="hero-actions">
          <button className="grain-btn primary" onClick={cmdLaunchBench}>
            Launch the Bench
          </button>
          <span className="micro">or press enter</span>
        </div>
        <div className="hero-legend micro">first record in under a minute · p-02, measured</div>

        <div className="hero-bench" aria-hidden>
          <div className="hero-bench-bar">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="micro" style={{ marginLeft: 8 }}>
              bench · first light
            </span>
          </div>
          <BenchPreview />
        </div>
      </section>

      <section className="landing-grid">
        <div className="grid-cell">
          <span className="cell-no">01</span>
          <h3>One clip, everywhere</h3>
          <p>
            Step grid, piano roll, and timeline render the same material object. Change the
            pattern and the arrangement updates in the same frame. No export step. Ever.
          </p>
        </div>
        <div className="grid-cell">
          <span className="cell-no">02</span>
          <h3>Honest numbers</h3>
          <p>
            The playhead is sample-locked to the audio clock. Meters show real signal. The
            latency badge reports what the browser actually grants — never a flattering guess.
          </p>
        </div>
        <div className="grid-cell">
          <span className="cell-no">03</span>
          <h3>Nothing is lost</h3>
          <p>
            Every edit is undoable, past saves. The Song lives on your machine and exports as
            plain JSON — diff it, version it, own it.
          </p>
        </div>
        <div className="grid-cell">
          <span className="cell-no">04</span>
          <h3>Keyboard-first</h3>
          <p>
            Space plays. R records. Ctrl+K finds every command by name. Every shortcut is
            printed where you need it — press ? on the Bench for the cheat sheet.
          </p>
        </div>
        <div className="grid-cell">
          <span className="cell-no">05</span>
          <h3>The Workshop Collection</h3>
          <p>
            L-Equal, L-Comp, L-Delay, L-Tape, L-Utility — built-in units with honest DSP and
            zero presets-with-attitude. Automatable, MIDI-mappable, yours.
          </p>
        </div>
        <div className="grid-cell">
          <span className="cell-no">06</span>
          <h3>Two themes, both warm</h3>
          <p>
            Dayshift cream or Nightshift ember — never navy, never glass. The toggle is one
            click in the Rail; the design language never changes underneath you.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <span className="micro">luthier · genesis build · gpl-3.0 spirit</span>
        <span className="micro">dayshift by default · p-09</span>
      </footer>
    </div>
  );
}

/* Static-but-honest miniature of the Bench: real colors, real structure, no video. */
function BenchPreview() {
  const rows = [
    { name: "Drums", color: "#C1551F", w: [72, 38, 55, 38, 66, 38, 55, 38], h: 64 },
    { name: "Keys", color: "#5C6B4A", w: [90, 40, 62, 44], h: 64 },
    { name: "Voice", color: "#4E6E7E", w: [30, 70, 46], h: 64 },
  ];
  return (
    <div style={{ padding: 12, display: "flex", gap: 0 }}>
      <div style={{ width: 120, flex: "none" }}>
        {rows.map((r) => (
          <div key={r.name} style={{ height: r.h, padding: "8px 8px 8px 0" }}>
            <div
              style={{
                height: "100%",
                border: "1px solid var(--grain-line)",
                background: "var(--grain-panel)",
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <span className="micro" style={{ color: "var(--grain-ink-64)" }}>
                {r.name}
              </span>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid var(--grain-ink-40)" }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {rows.map((r) => (
          <div
            key={r.name}
            style={{
              height: r.h,
              position: "relative",
              borderBottom: "1px solid var(--grain-line)",
              background: "var(--grain-paper-sunken)",
            }}
          >
            {r.w.map((w, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(i * 26 + 8) % 92}%`,
                  top: 8,
                  bottom: 8,
                  width: `${w}%`,
                  maxWidth: "42%",
                  background: r.color,
                  opacity: 0.7,
                  border: "1px solid var(--grain-ink-24)",
                }}
              />
            ))}
            <div style={{ position: "absolute", left: "38%", top: 0, bottom: 0, width: 2, background: "var(--grain-ember)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
