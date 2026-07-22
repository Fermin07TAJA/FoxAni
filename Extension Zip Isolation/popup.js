const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const scanBtn = document.getElementById("scanBtn");
const coversBtn = document.getElementById("coversBtn");
const pageBtn = document.getElementById("pageBtn");

const allBtn = document.getElementById("allBtn");
const noneBtn = document.getElementById("noneBtn");

let currentFolders = [];

const PREFIX_ORDER = {
  HV: 0,
  SP: 1,
  ET: 2,
  FA: 3
};

function sortFolders(folders) {
  return [...folders].sort((a, b) => {
    const ma = /^([A-Z]+)(\d+)$/.exec(a.title);
    const mb = /^([A-Z]+)(\d+)$/.exec(b.title);

    // Non-season folders (whitelist entries) first
    if (!ma && !mb)
      return a.title.localeCompare(b.title);

    if (!ma)
      return -1;

    if (!mb)
      return 1;

    const [, pa, ya] = ma;
    const [, pb, yb] = mb;

    // Unknown prefixes (whitelist entries like AK24, IN31, etc.) first
    const knownA = pa in PREFIX_ORDER;
    const knownB = pb in PREFIX_ORDER;

    if (!knownA && !knownB)
      return a.title.localeCompare(b.title);

    if (!knownA)
      return -1;

    if (!knownB)
      return 1;

    // Then by season number
    const na = Number(ya);
    const nb = Number(yb);

    if (na !== nb)
      return na - nb;

    // Then HV, SP, ET, FA
    return PREFIX_ORDER[pa] - PREFIX_ORDER[pb];
  });
}
function renderList(folders) {
  listEl.innerHTML = "";
  if (!folders.length) {
    listEl.textContent = "(no matching folders found)";
    coversBtn.disabled = true;
    allBtn.disabled = true;
    noneBtn.disabled = true;
    return;
  }

  for (const f of folders) {
    const row = document.createElement("div");
    row.className = "row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = false;
    cb.dataset.title = f.title;

    const label = document.createElement("label");
    label.title = f.title;
    label.textContent = f.title;

    row.appendChild(cb);
    row.appendChild(label);
    listEl.appendChild(row);
  }

  coversBtn.disabled = false;
  allBtn.disabled = false;
  noneBtn.disabled = false;
}

function selectedTitles() {
  return [...listEl.querySelectorAll('input[type="checkbox"]')]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.title);
}

scanBtn.addEventListener("click", async () => {
  statusEl.textContent = "Scanning...";
  listEl.textContent = "";
  coversBtn.disabled = true;
  allBtn.disabled = true;
  noneBtn.disabled = true;

  try {
    const res = await browser.runtime.sendMessage({ type: "SCAN_FOLDERS" });
    // currentFolders = res.folders || [];
    currentFolders = sortFolders(res.folders || []);
    renderList(currentFolders);
    statusEl.textContent = `Found ${currentFolders.length} candidate folder(s).`;
  } catch (e) {
    statusEl.textContent = `Error: ${e && e.message ? e.message : String(e)}`;
  }
});

allBtn.addEventListener("click", () => {
  for (const cb of listEl.querySelectorAll('input[type="checkbox"]')) cb.checked = true;
});

noneBtn.addEventListener("click", () => {
  for (const cb of listEl.querySelectorAll('input[type="checkbox"]')) cb.checked = false;
});

coversBtn.addEventListener("click", async () => {
  const titles = selectedTitles();
  if (!titles.length) {
    statusEl.textContent = "Nothing selected.";
    return;
  }

  statusEl.textContent = "Generating covers (CSV only)...";
  try {
    const res = await browser.runtime.sendMessage({
      type: "EXPORT_COVERS_ONLY",
      titles
    });
    statusEl.textContent = `Done.\nFolders exported: ${res.foldersExported}\nCSV files: ${res.csvQueued}`;
  } catch (e) {
    statusEl.textContent = `Error: ${e && e.message ? e.message : String(e)}`;
  }
});

pageBtn.addEventListener("click", async () => {
  statusEl.textContent = "Providing renderer.html...";
  try {
    const res = await browser.runtime.sendMessage({ type: "PROVIDE_WEBPAGE" });
    statusEl.textContent = `Done.\n${res.filename}`;
  } catch (e) {
    statusEl.textContent = `Error: ${e && e.message ? e.message : String(e)}`;
  }
});
