import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./ui/Bench";
import { getState } from "./lib/store";

document.documentElement.setAttribute("data-theme", getState().theme);

function Splash() {
  return (
    <div className="splash" id="splash">
      <div className="logo-mark" style={{ width: 32, height: 32 }} aria-hidden />
      <div className="splash-name">LUTHIER</div>
      <div className="sweep" aria-hidden />
      <div className="micro">calibrating the bench</div>
    </div>
  );
}

function Boot() {
  return (
    <>
      <Splash />
      <App />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boot />
  </StrictMode>
);

// §6.11.1: splash holds ≥ 250 ms, then leaves
window.setTimeout(() => {
  const el = document.getElementById("splash");
  if (el) el.remove();
}, 400);
