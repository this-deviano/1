# FIRST-LIGHT — Maintainer Ratification Kit (M1 exit)

One page, exact steps. You are verifying what the build agent cannot observe: ears, a
real microphone, and the feel of P-02. Evidence goes in `docs/evidence/` as you go.

Reference numbers from the committed battery (`docs/evidence/sb005/`) are quoted below
so you have something to compare against. Every machine number is a **PROXY** — headless
Chromium, scripted keys, a synthetic mic. **Ears remain human.**

---

## 0. Launch

```sh
bun install
bun run dev          # dev server (PORT injected by the host)
```

Open the printed URL in Chrome or Firefox, in a **fresh tab**. Open DevTools → Console.
Click the landing CTA → the Bench appears.

Cross-check (optional, one command, ~35 s): `bun run test:preview` re-runs the whole
13-check battery and rewrites `docs/evidence/sb005/`.

---

## 1. Ears — does the render sound like an instrument?

1. In the Bench press **Space** (or click ▶ in the Rail).
2. Listen: drums (TR-808 kit) + keys should be audible immediately.
3. Press **M** for the metronome, **L** for the loop, and play a few bars.
4. Rail → **Export** → renders `WAV (32-bit float)`.
   The file lands in your browser's **Downloads** folder, named after the Song
   (`<song name>.wav`). That is the ears-on-the-render artifact — listen to the file,
   not just the live bus.

**Observe:** no clicks, no dropouts, no silent-dead transport; the latency badge in the
Rail shows a non-zero value (proxy: 10 ms @ 44.1 kHz). *The live bus and the export are
now one construction (TASK-015 correction) — if they sound different, that is a bug.*

---

## 2. Real microphone — the record journey

1. Press **R** to arm. The mic panel appears with monitoring **off** by default.
2. Wait for the browser permission prompt and **grant** it.
   - Denial is handled inline as **LR-0007** with a retry — no crash, no modal. (If you
     want to see that path first, deny once and read the panel.)
3. Wait the **4-beat count-in**, play or speak, press **Space** to stop.
4. A clip lands on the armed audio track. The count-in is trimmed from the take, and
   the toast reports the honest duration and peak.

> **⚠ MONITORING WARNING.** Monitoring is **off by default**. If you turn it on
> ("Mon off" → "Mon on") you **must wear headphones** — monitoring through speakers
> will feed back. The panel says so inline when you enable it.

**Observe:** the take's duration and peak are truthful (P-07); the tab's recording
indicator goes out when you stop (P-14 — the device is always released).
Proxy reference: take 149,168 bytes, mono 32-bit float @ 44.1 kHz, 0.845 s, peak 1.0,
`sha256` matching the content-addressed pointer in OPFS `media/`.

---

## 3. P-02 stopwatch — the only number that is really yours

**Fresh-state reset (canonical, in this order):**

1. DevTools → **Application → Local Storage** → delete **every `luthier.*` key**
   (currently `luthier.song.v1`, `luthier.metronome.v1`, `luthier.coach.dismissed`).
2. DevTools → **Application → Storage → Origin Private File System** → delete
   `song.json`, `song.json.tmp`, `manifest.json`, `history/`, `media/`.
   (Equivalent shortcut: in the Bench, **New Song** — the one two-step guard in the app.
   It clears all of the above and reloads. Confirm within 3 s.)
3. **Reload.** You should see the factory Song "First Light".

**Then, with a stopwatch:**

1. Start the stopwatch **on reload**.
2. Click through to the Bench → press **R** → wait the 4-beat count-in → play the
   musical-typing row (**Z–M = C3–C4**) → press **Space** to stop.
3. Stop the stopwatch when the take clip appears on the lane.

**Target: ≤ 60 s** (P-02).

**Compare against the proxy:** the committed battery measures this journey at
**3,384 ms** in headless Chromium. Historical runs: SB-004 **3,875 ms**, SB-005
**3,892 ms**. **The number moves run to run** — it is a scripted upper bound, not a
human feel. Your stopwatch result is the real one; record it in
`docs/evidence/hv-3-stopwatch.md`.

---

## 4. Both themes

Rail → theme button. Capture Dayshift, toggle to Nightshift, capture again (landing and
Bench). **Observe:** warm paper tones in both; no purple/indigo/violet; no blur.

---

## 5. Known-and-accepted behaviour (do not file these as defects)

- **Export is not byte-identical between two renders.** This is Chromium's WebAudio
  render noise, it is platform-side, and it grows with graph size. It is ratified as
  **AMM-003** and the self-test prints the measured `max|Δ|`, its dBFS, the cap, the
  bit-identity result and **both hashes** every run. The app-controlled leg (model→event
  + PRNG) is bit-stable. Do not expect bit-exact exports in the preview layer.
- **Surfaces are tabbed — one at a time.** You cannot see Loom and Lattice update "in the
  same frame"; there is no such DOM. Ruled correct architecture (R-5, P-01). The harness
  verifies propagation timing and remount-freshness instead.
- The full meter scale (0/−3/−6/−12/−18 (0 VU)/−24/−36/−48) is **M2 scope**. M1 ships a
  dB-referenced bar with labelled −12/−6 notches, a numeric peak readout and peak-hold.

---

**Ratify by editing `MILESTONE` to `M2` and committing.**

Anything you see that contradicts the above: file it in `TASKS.md` with the rule it
breaks, and leave `MILESTONE` at `M1-EXIT-PENDING`.
