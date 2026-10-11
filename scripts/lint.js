#!/usr/bin/env node
// Lint LIGERO sin dependencias (bloque 10 · tests.6/frontend.9). Incremental:
// ataca errores REALES primero, no reformatea nada.
//   1) Sintaxis (node --check) de todo el backend, scripts y tests.
//   2) Funciones duplicadas de nivel superior en el backend (override silencioso).
//   3) Aviso de funciones duplicadas en el frontend de un fichero (la colisión de
//      prefijos que CLAUDE.md marca como peligro histórico: wiz-, crono*).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let errores = 0;
let avisos = 0;

function jsFiles(rel) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      if (name === "node_modules") continue;
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".js")) out.push(p);
    }
  })(dir);
  return out;
}

// 1) Sintaxis.
for (const f of [...jsFiles("backend"), ...jsFiles("scripts"), ...jsFiles("tests")]) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    errores++;
    console.error("✗ sintaxis:", path.relative(ROOT, f), "\n  " + (e.stderr ? e.stderr.toString().split("\n")[0] : e.message));
  }
}

// 2) Funciones duplicadas de nivel superior en el backend (anclado a inicio de línea).
for (const f of jsFiles("backend")) {
  const src = fs.readFileSync(f, "utf8");
  const vistos = {};
  const re = /^function\s+([A-Za-z0-9_$]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) vistos[m[1]] = (vistos[m[1]] || 0) + 1;
  for (const [n, c] of Object.entries(vistos)) {
    if (c > 1) { errores++; console.error(`✗ función duplicada de nivel superior '${n}' (${c}×) en ${path.relative(ROOT, f)}`); }
  }
}

// 3) Frontend (fichero único): aviso de nombres de función repetidos (posible
// colisión de prefijos). Es AVISO, no error, porque puede haber homónimos anidados.
const fe = path.join(ROOT, "frontend", "index.html");
if (fs.existsSync(fe)) {
  const src = fs.readFileSync(fe, "utf8");
  const vistos = {};
  const re = /\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) vistos[m[1]] = (vistos[m[1]] || 0) + 1;
  const dup = Object.entries(vistos).filter(([, c]) => c > 1);
  if (dup.length) { avisos += dup.length; console.warn(`⚠ ${dup.length} nombre(s) de función repetidos en frontend/index.html (revisa colisiones): ` + dup.map(([n, c]) => `${n}×${c}`).join(", ")); }
}

if (errores) { console.error(`\n✗ ${errores} error(es) de lint` + (avisos ? ` · ${avisos} aviso(s)` : "")); process.exit(1); }
console.log(`✓ lint en verde (sintaxis + sin funciones duplicadas en backend)` + (avisos ? ` · ${avisos} aviso(s) en frontend` : ""));
