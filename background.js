// ---------------- Utilities ----------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function escapeCsv(s) {
  const str = (s ?? "").toString();
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function sanitizeFilename(s) {
  return (s || "Bookmarks")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function collectBookmarksFlat(node, out) {
  if (node.url) {
    out.push({ title: node.title || "", url: node.url });
    return;
  }
  if (node.children) {
    for (const c of node.children) collectBookmarksFlat(c, out);
  }
}

// ---------------- Whitelist + Matching ----------------
async function loadWhitelist() {
  // whitelist.txt is packaged inside the extension root
  const url = browser.runtime.getURL("whitelist.txt");
  const txt = await (await fetch(url)).text();

  const exact = new Set();
  const prefix = []; // "HV*" -> "HV"

  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith("*")) prefix.push(line.slice(0, -1));
    else exact.add(line);
  }
  return { exact, prefix };
}

function isSeasonCodeFolder(name) {
  // Extend this list if you want IN## etc.
  // Example in your message used IN31, so include IN here.
  return /^(HV|ET|AK|FA|IN)\d{2}$/.test(name);
}

function isWhitelisted(name, wl) {
  if (wl.exact.has(name)) return true;
  for (const p of wl.prefix) {
    if (name.startsWith(p)) return true;
  }
  return false;
}

function folderMatches(name, wl) {
  return isSeasonCodeFolder(name) || isWhitelisted(name, wl);
}

// ---------------- Downloads overwrite ----------------
async function removeExistingDownloadIfAny(targetFilename) {
  // Search completed downloads for exact matching relative filename suffix.
  const hits = await browser.downloads.search({
    filename: targetFilename,
    state: "complete"
  });

  const exact = hits.find(h => h.filename && h.filename.endsWith(targetFilename));
  if (!exact) return false;

  await browser.downloads.removeFile(exact.id);
  await browser.downloads.erase({ id: exact.id });
  return true;
}

// ---------------- Jikan (MAL proxy) ----------------
// async function jikanCoverByTitle(title) {
//   const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
//   const r = await fetch(url);
//   console.log(title, r.status);
//   if (!r.ok) return "";

//   const j = await r.json();
//   const a = j?.data?.[0];
//   if (!a) return "";

//   return a?.images?.jpg?.image_url || a?.images?.webp?.image_url || "";
// }

// // ---------------- AniList ----------------
// async function aniListCoverByTitle(title) {
//   const query = `
//     query ($search: String) {
//       Media(search: $search) {
//         coverImage {
//           extraLarge
//           large
//           medium
//         }
//       }
//     }
//   `;

//   const r = await fetch("https://graphql.anilist.co", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       "Accept": "application/json"
//     },
//     body: JSON.stringify({
//       query,
//       variables: { search: title }
//     })
//   });

//   console.log(title, r.status);

//   if (!r.ok) {
//     // AniList tells you how long to wait.
//     if (r.status === 429) {
//       console.warn(
//         `Rate limited. Retry after ${r.headers.get("Retry-After")} seconds.`
//       );
//     }
//     return "";
//   }

//   const j = await r.json();

//   return (
//     j?.data?.Media?.coverImage?.extraLarge ||
//     j?.data?.Media?.coverImage?.large ||
//     j?.data?.Media?.coverImage?.medium ||
//     ""
//   );
// }

async function aniListCoverBatch(titles) {
  const variables = {};
  const parts = [];

  titles.forEach((title, i) => {
    const varName = `t${i}`;
    variables[varName] = title;

    parts.push(`
      m${i}: Media(search: $${varName}) {
        coverImage {
          extraLarge
          large
          medium
        }
      }
    `);
  });

  const query = `
    query(
      ${titles.map((_, i) => `$t${i}: String`).join(", ")}
    ) {
      ${parts.join("\n")}
    }
  `;

  const r = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  if (!r.ok)
    throw new Error(`AniList HTTP ${r.status}`);

  const j = await r.json();

  const map = new Map();

  titles.forEach((title, i) => {
    const img =
      j.data?.[`m${i}`]?.coverImage?.extraLarge ||
      j.data?.[`m${i}`]?.coverImage?.large ||
      j.data?.[`m${i}`]?.coverImage?.medium ||
      "";

    map.set(title, img);
  });

  return map;
}

// ---------------- Scan + Export ----------------
async function scanMatchedFolders() {
  const wl = await loadWhitelist();
  const tree = await browser.bookmarks.getTree();

  const found = [];
  const stack = [...tree];

  while (stack.length) {
    const node = stack.pop();
    if (!node || !node.children) continue;

    if (!node.url && node.title && folderMatches(node.title, wl)) {
      found.push({ title: node.title, id: node.id });
      // Do not descend into matched folder
      continue;
    }

    for (const c of node.children) stack.push(c);
  }

  found.sort((a, b) => a.title.localeCompare(b.title));
  return found;
}

// async function buildCsvRowsWithImages(bookmarks) {
//   const rows = [];
//   for (const b of bookmarks) {
//     // const img = await jikanCoverByTitle(b.title);
//     const img = await aniListCoverByTitle(b.title);
//     rows.push({ img, title: b.title, url: b.url });
//     await sleep(1000);; // throttle
//   }
//   return rows;
// }

async function buildCsvRowsWithImages(bookmarks) {
  const covers = await aniListCoverBatch(
    bookmarks.map(b => b.title)
  );

  return bookmarks.map(b => ({
    img: covers.get(b.title) || "",
    title: b.title,
    url: b.url
  }));
}

async function exportFolderToCsvWithImages(folderTitle, bookmarks) {
  const safe = sanitizeFilename(folderTitle);
  const target = `data/${safe}.csv`;

  const rows = await buildCsvRowsWithImages(bookmarks);

  const header = ["ImageURL", "Name", "URL"].map(escapeCsv).join(",") + "\n";
  const body =
    rows.map(r => [r.img, r.title, r.url].map(escapeCsv).join(",")).join("\n") + "\n";

  await removeExistingDownloadIfAny(target);

  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  await browser.downloads.download({
    url: blobUrl,
    filename: target,
    saveAs: false
  });

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  return target;
}

function rendererHtmlTemplate() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Renderer</title>
<style>
  body{font:14px sans-serif;margin:16px;background:#fff5f7}
  h1{font-size:18px;margin:0 0 12px}
  #hint{margin:8px 0;color:#333}
  #drop{border:1px dashed #888;border-radius:8px;padding:12px;margin:10px 0;background:rgba(255,255,255,0.6)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px}
  .card{display:flex;gap:10px;border:1px solid #ccc;border-radius:8px;padding:10px;background:rgba(255,255,255,0.75)}
  img,.ph{width:80px;height:112px;object-fit:cover;border-radius:6px;flex:0 0 auto;background:#eee}
  .meta{display:flex;flex-direction:column;gap:8px;min-width:0}
  .t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ln{display:flex;gap:10px}
  a{color:#0b5fff;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1 id="hdr">Renderer</h1>

<div id="hint">Drop a CSV here or pick one. If this file sits next to a CSV with the same basename, it will try <code>./&lt;basename&gt;.csv</code>.</div>

<input type="file" id="file" accept=".csv" style="display:none" />
<div id="drop">Drag a CSV here, or <a href="#" id="pick">pick a CSV</a>.</div>

<div class="grid" id="grid"></div>

<script>
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
  const lines = text.split(/\\r?\\n/).filter(l => l.trim().length);
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
  const base = (name || "Renderer").replace(/\\.csv$/i, "");
  document.title = base;
  HDR.textContent = base;
}

function render(items) {
  GRID.innerHTML = "";
  for (const it of items) {
    const img = it.img
      ? \`<img src="\${esc(it.img)}" alt="\${esc(it.name)}" loading="lazy">\`
      : \`<div class="ph"></div>\`;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = \`
      \${img}
      <div class="meta">
        <div class="t">\${esc(it.name)}</div>
        <div class="ln"><a href="\${esc(it.url)}" target="_blank" rel="noreferrer">Link</a></div>
      </div>
    \`;
    GRID.appendChild(card);
  }
}

async function tryFetchSiblingCsv() {
  // If renderer.html is renamed to HV24.html, it will try HV24.csv.
  const here = location.pathname.split("/").pop() || "renderer.html";
  const base = here.replace(/\\.html$/i, "");
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
</script>
</body>
</html>`;
}

async function provideWebpage() {
  const target = "data/renderer.html";
  await removeExistingDownloadIfAny(target);

  const blob = new Blob([rendererHtmlTemplate()], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  await browser.downloads.download({
    url: blobUrl,
    filename: target,
    saveAs: false
  });

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  return { filename: target };
}


async function exportCoversOnlyByTitles(titles) {
  const candidates = await scanMatchedFolders();
  const byTitle = new Map(candidates.map(c => [c.title, c.id]));

  let foldersExported = 0;
  let csvQueued = 0;

  for (const t of titles) {
    const id = byTitle.get(t);
    if (!id) continue;

    const nodes = await browser.bookmarks.getSubTree(id);
    const root = nodes && nodes[0];
    if (!root) continue;

    const flat = [];
    collectBookmarksFlat(root, flat);

    await exportFolderToCsvWithImages(t, flat);
    csvQueued += 1;
    foldersExported += 1;
  }

  return { foldersExported, csvQueued };
}


async function exportSelectedByTitles(titles, makeHtml) {
  const candidates = await scanMatchedFolders();
  const byTitle = new Map(candidates.map(c => [c.title, c.id]));

  let foldersExported = 0;
  let csvQueued = 0;
  let htmlQueued = 0;

  for (const t of titles) {
    const id = byTitle.get(t);
    if (!id) continue;

    const nodes = await browser.bookmarks.getSubTree(id);
    const root = nodes && nodes[0];
    if (!root) continue;

    const flat = [];
    collectBookmarksFlat(root, flat);

    await exportFolderToCsvWithImages(t, flat);
    csvQueued += 1;

    if (makeHtml) {
      await exportHtmlRenderer(t);
      htmlQueued += 1;
    }

    foldersExported += 1;
  }

  return { foldersExported, csvQueued, htmlQueued };
}

// ---------------- Message routing ----------------
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === "SCAN_FOLDERS") {
    return scanMatchedFolders().then(folders => ({ folders }));
  }

  if (msg.type === "EXPORT_COVERS_ONLY") {
    return exportCoversOnlyByTitles(msg.titles || []);
  }

  if (msg.type === "PROVIDE_WEBPAGE") {
    return provideWebpage();
  }
});

