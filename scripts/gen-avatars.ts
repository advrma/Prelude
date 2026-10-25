// npm run avatars — writes deterministic, abstract SVG "portraits" to public/avatars/.
// No faces, no real people: a silhouette against a night-sky gradient, seeded by persona id.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const PALETTES = [
  ["#1b2a5c", "#ff8a5b", "#ffd28a"],
  ["#20194a", "#c86bfa", "#ffb3d9"],
  ["#0f2f3f", "#4fd1c5", "#c7f9e9"],
  ["#2b1a3d", "#ff6b8b", "#ffc6a8"],
  ["#142447", "#6ea8ff", "#d9e7ff"],
  ["#2a2116", "#ffb547", "#fff0c9"],
  ["#1d1f3f", "#8b7bff", "#e1dcff"],
  ["#14322a", "#7bd88f", "#e6ffd9"],
];

function rng(seed: string) {
  let h = createHash("sha256").update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length) {
      h = createHash("sha256").update(h).digest();
      i = 0;
    }
    return h[i++] / 256; // [0, 1)
  };
}

function avatar(seed: string): string {
  const r = rng(seed);
  const [bg, accent, light] = PALETTES[Math.floor(r() * PALETTES.length)];
  const orbX = 60 + r() * 120;
  const orbY = 50 + r() * 50;
  const orbR = 22 + r() * 22;
  const headR = 38 + r() * 8;
  const hair = r() < 0.5;
  const hairH = 10 + r() * 26;
  const stars = Array.from({ length: 14 }, () => {
    const x = (r() * 240).toFixed(1);
    const y = (r() * 170).toFixed(1);
    const s = (0.6 + r() * 1.6).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${s}" fill="${light}" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  }).join("");
  const sil = "#0a0f1f";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="240" height="300" role="img" aria-label="Abstract avatar">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<radialGradient id="o" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="240" height="300" fill="url(#g)"/>
${stars}
<circle cx="${orbX.toFixed(1)}" cy="${orbY.toFixed(1)}" r="${(orbR * 2.2).toFixed(1)}" fill="url(#o)" opacity="0.55"/>
<circle cx="${orbX.toFixed(1)}" cy="${orbY.toFixed(1)}" r="${orbR.toFixed(1)}" fill="${light}" opacity="0.9"/>
<g fill="${sil}" opacity="0.92">
<circle cx="120" cy="${(180 - headR / 3).toFixed(1)}" r="${headR.toFixed(1)}"/>
${hair ? `<ellipse cx="120" cy="${(175 - headR).toFixed(1)}" rx="${(headR + 6).toFixed(1)}" ry="${hairH.toFixed(1)}"/>` : ""}
<rect x="104" y="188" width="32" height="44" rx="12"/>
<path d="M30 300 C 40 238, 80 222, 120 222 C 160 222, 200 238, 210 300 Z"/>
</g>
</svg>
`;
}

const outDir = path.join(process.cwd(), "public", "avatars");
fs.mkdirSync(outDir, { recursive: true });
const ids = [...Array.from({ length: 10 }, (_, i) => `s${String(i + 1).padStart(2, "0")}`), "new"];
let n = 0;
for (const id of ids) {
  for (const k of [1, 2]) {
    fs.writeFileSync(path.join(outDir, `${id}-${k}.svg`), avatar(`${id}-${k}`), "utf8");
    n++;
  }
}
// Placeholder shown before Level 1 unlocks.
fs.writeFileSync(
  path.join(outDir, "locked.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="240" height="300" role="img" aria-label="Locked photo">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2548"/><stop offset="1" stop-color="#0e1530"/></linearGradient></defs>
<rect width="240" height="300" fill="url(#g)"/>
<g fill="none" stroke="#ffb547" stroke-width="6" stroke-linecap="round" opacity="0.8">
<rect x="90" y="140" width="60" height="48" rx="8"/><path d="M102 140 v-14 a18 18 0 0 1 36 0 v14"/>
</g>
</svg>
`,
  "utf8",
);
console.log(`Wrote ${n + 1} avatars to ${outDir}`);
