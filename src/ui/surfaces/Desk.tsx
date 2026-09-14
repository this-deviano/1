/* Desk — the mix console (§8.6).
   Strips: inserts column, sends stub, pan knob, fader + meter, name.
   Master strip fixed at right. One track list — reordering here is
   reordering Loom (one source of truth). */

import { useStore, mutate, getState } from "../../lib/store";
import { DEVICES } from "../../lib/model";
import { useStatus } from "../../lib/status";
import { cmdAddDevice, cmdRemoveUnit, cmdSetParam, cmdSetTrackGain, cmdSetTrackPan, cmdToggleUnit } from "../../lib/actions";
import { GrainFader, GrainKnob, GrainMeter, toast } from "../primitives";
import { MASTER_GAIN_DB } from "../../lib/engine";
import { deviceDef } from "../../lib/model";

export function Desk() {
  const song = useStore((s) => s.song);
  const selectedTrack = useStore((s) => s.selectedTrack);
  const status = useStatus();
  const master = song.tracks.find((t) => t.kind === "master");
  void master;
  const strips = song.tracks.filter((t) => t.kind !== "master");

  return (
    <div className="desk">
      <div className="desk-row">
        {strips.map((t) => (
          <Strip key={t.id} trackId={t.id} />
        ))}
        <div className="strip master">
          <div className="strip-top" style={{ background: "var(--grain-ember)" }} />
          <span className="micro">master</span>
          {/* P-15/P-07: MASTER_GAIN is a real −0.92 dB move; printing "−0.0 dB"
              here was a hidden gain move. The number is now the number. */}
          <span
            className="value"
            style={{ fontSize: 11 }}
            title="master bus gain (MASTER_GAIN) — applied identically in the live and offline graphs (TASK-015)"
          >
            {MASTER_GAIN_DB.toFixed(1)} dB
          </span>
          <GrainKnob label="trim" value={0} min={-24} max={6} def={0} onChange={() => toast("Master trim is fixed in the web MVP.", "ember")} />
          <div className="fader-stack">
            <GrainMeter level={status.clipAvg} hold={status.clipHold} height={140} readout />
          </div>
          <span className="micro" style={{ textAlign: "center" }} title="numeric peak readout — mono master, honest to the sample (R-4b)">
            peak dbfs · mono
          </span>
          <span className="micro" style={{ textAlign: "center" }}>
            {status.latencyMs} ms rta
          </span>
        </div>
      </div>
      <div className="micro" style={{ padding: "8px 2px" }}>
        drag strips to reorder (one track list — Loom follows) · double-click fader = 0 dB · double-click insert = remove
      </div>
    </div>
  );
}

function Strip({ trackId }: { trackId: string }) {
  const t = useStore((s) => s.song.tracks.find((x) => x.id === trackId));
  const selectedTrack = useStore((s) => s.selectedTrack);
  const status = useStatus();
  if (!t) return null;
  const kindColor =
    t.kind === "audio" ? "var(--grain-slate)" : t.kind === "midi" ? "var(--grain-moss)" : t.kind === "bus" ? "var(--grain-ink-40)" : "var(--grain-amber)";

  return (
    <div
      className="strip"
      style={selectedTrack === t.id ? { boxShadow: "inset 2px 0 0 var(--grain-ember)" } : undefined}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `reorder:${t.id}`)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const data = e.dataTransfer.getData("text/plain");
        if (!data.startsWith("reorder:")) return;
        const srcId = data.slice(8);
        if (srcId === t.id) return;
        const s = getState();
        const from = s.song.tracks.findIndex((x) => x.id === srcId);
        const to = s.song.tracks.findIndex((x) => x.id === t.id);
        if (from < 0 || to < 0) return;
        mutate((song2) => {
          const [moved] = song2.tracks.splice(from, 1);
          song2.tracks.splice(to, 0, moved);
        });
      }}
    >
      <div className="strip-top" style={{ background: kindColor }} />
      <span className="strip-name" title={t.name}>
        {t.name}
      </span>

      {/* inserts (max 4 in web MVP) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
        {t.units.map((u) => {
          const def = deviceDef(u.type);
          const latency = u.type === "l-delay" ? 0 : u.type === "l-comp" ? 0 : 0;
          return (
            <div
              key={u.type}
              className={`insert-slot ${u.enabled ? "on" : ""}`}
              title={`${def?.name ?? u.type} · click to toggle · dbl-click to remove`}
              onClick={() => cmdToggleUnit(t.id, u.type)}
              onDoubleClick={() => cmdRemoveUnit(t.id, u.type)}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: u.enabled ? "var(--grain-ok)" : "var(--grain-ink-24)" }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{def?.name ?? u.type}</span>
              <span className="lat">{latency.toFixed(1)}</span>
            </div>
            );
          })}
        {t.units.length < 4 && (
          <select
            className="insert-slot"
            style={{ color: "var(--grain-ink-64)", cursor: "pointer" }}
            value=""
            aria-label={`Add insert to ${t.name}`}
            onChange={(e) => {
              if (e.target.value) cmdAddDevice(t.id, e.target.value);
            }}
          >
            <option value="">+ insert</option>
            {DEVICES.filter((d) => !t.units.some((u) => u.type === d.id)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* device params (first unit only, compact) */}
      {t.units.length > 0 && t.units[0].enabled && (
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
          {deviceDef(t.units[0].type)?.params.slice(0, 3).map((p) => (
            <GrainKnob
              key={p.id}
              size={24}
              label={p.name}
              unit={p.unit}
              min={p.min}
              max={p.max}
              def={p.def}
              value={t.units[0].params[p.id] ?? p.def}
              onChange={(v) => cmdSetParam(t.id, t.units[0].type, p.id, v)}
            />
          ))}
        </div>
      )}

      <GrainKnob label="pan" size={24} min={-1} max={1} def={0} value={t.pan} onChange={(v) => cmdSetTrackPan(t.id, v)} />
      <div className="fader-stack">
        <GrainFader value={t.gain} length={140} label={`${t.name} fader`} onChange={(v) => cmdSetTrackGain(t.id, v)} />
        <GrainMeter level={t.mute ? 0 : status.clipAvg} hold={t.mute ? 0 : status.clipHold} height={140} />
      </div>
    </div>
  );
}
