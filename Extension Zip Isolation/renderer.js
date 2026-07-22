const GRID = document.getElementById("grid");
const HDR  = document.getElementById("hdr");
const fileInput = document.getElementById("file");
const hint = document.getElementById("hint");

document.getElementById("pick").addEventListener("click", (e) => {
  e.preventDefault();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) readFile(f);
});

const drop = document.getElementById("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.style.background = "rgba(255,255,255,0.9)"; });
drop.addEventListener("dragleave", () => { drop.style.background = ""; });
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.style.background = "";
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) readFile(f);
});

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length <= 1) return [];
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = [];
    let cur = "";
    let q = false;
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (q) {
        if (ch === '"' && line[k+1] === '"') { cur += '"'; k++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { cols.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cols.push(cur);
    const [img, name, url] = cols;
    out.push({ img: (img||"").trim(), name: (name||"").trim(), url: (url||"").trim() });
  }
  return out;
}

function esc(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function setTitleFromName(name) {
  const base = (name || "Renderer").replace(/\.csv$/i, "");
  document.title = base;
  HDR.textContent = base;
}

function render(items) {
  GRID.innerHTML = "";
  for (const it of items) {
    const img = it.img
      ? `<img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy">`
      : `<div class="ph"></div>`;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      ${img}
      <div class="meta">
        <div class="t">${esc(it.name)}</div>
        <div class="ln"><a href="${esc(it.url)}" target="_blank" rel="noreferrer">Link</a></div>
      </div>
    `;
    GRID.appendChild(card);
  }
}

async function tryFetchSiblingCsv() {
  // If renderer.html is renamed to HV24.html, it will try HV24.csv.
  const here = location.pathname.split("/").pop() || "renderer.html";
  const base = here.replace(/\.html$/i, "");
  const guess = base + ".csv";

  try {
    const r = await fetch("./" + guess);
    if (!r.ok) throw new Error("fetch not ok");
    const t = await r.text();
    setTitleFromName(guess);
    render(parseCsv(t));
    hint.textContent = "Loaded via fetch: " + guess;
    return true;
  } catch {
    hint.textContent = "Fetch blocked/unavailable. Use drag-drop or file picker to load a CSV.";
    return false;
  }
}

function readFile(file) {
  const fr = new FileReader();
  fr.onload = () => {
    setTitleFromName(file.name);
    render(parseCsv(fr.result));
  };
  fr.readAsText(file);
}

tryFetchSiblingCsv();