const GRID = document.getElementById("grid");
const HDR = document.getElementById("hdr");
const hint = document.getElementById("hint");
const csvButtons = document.getElementById("csvButtons");
const toast = document.getElementById("toast");

const avis_preferred = "ET26.csv";

const CSV_FILES = [
    "Prime.csv", "Top 20.csv", "Allie.csv", "Prepa.csv",
    "ET20.csv", "FA20.csv", "SP21.csv", "FA21.csv",
    "HV22.csv", "SP22.csv", "ET22.csv", "FA22.csv", "21-22.csv",
    "HV23.csv", "SP23.csv", "ET23.csv", "FA23.csv",
    "HV24.csv", "SP24.csv", "ET24.csv", "FA24.csv",
    "HV25.csv", "SP25.csv", "ET25.csv", "FA25.csv",
    "HV26.csv", "SP26.csv", "ET26.csv", "FA26.csv",
    "HV27.csv", "SP27.csv", "ET27.csv", "FA27.csv",
    "HV28.csv", "SP28.csv", "ET28.csv", "FA28.csv",
    "HV29.csv", "SP29.csv", "ET29.csv", "FA29.csv",
    "HV30.csv", "SP30.csv", "ET30.csv", "FA30.csv",
    "HV31.csv", "SP31.csv", "ET31.csv", "FA31.csv",
    "HV32.csv", "SP32.csv", "ET32.csv", "FA32.csv",
    "HV33.csv", "SP33.csv", "ET33.csv", "FA33.csv",
    "HV34.csv", "SP34.csv", "ET34.csv", "FA34.csv",
    "HV35.csv", "SP35.csv", "ET35.csv", "FA35.csv",
    "Sequels.csv", "Watchlist.csv"
];

const TYPE_COLORS = new Map([
    ["allie", "#440161"], ["e-lissa", "#202020"], ["e-lissa trial ep", "#202020"],
    ["blanon", "#b8e6b8"], ["season favorite", "#ffd700"], ["marco", "#d84a4a"],
    ["shanon", "#b7ddff"], ["blythe", "#f3e9b2"], ["top 20", "#ffe44dd5"],
    ["prime", "#ffc7fbd5"], ["peliculas top", "#46b78a"], ["honorable mentions", "#49a8df"],
    ["nancy", "#ff7b00"], ["madeline", "#53d8ac"], ["joyce", "#53d8ac"],
    ["dropped", "#949595"], ["inc", "#949595"], ["t", "#06300f"],
    ["francis", "#a2c7f2"], ["zyun", "#a2c7f2"], ["dub", "#f0aeae"],
    ["manga", "#b3b3b3"], ["peli", "#c8f3b7"], ["dating", "#ffbcf7"],
    ["live action", "#7d0000"]
]);
const DARK_TYPES = new Set(["allie", "e-lissa", "e-lissa trial ep", "t", "live action"]);
const LOADED_CSVS = new Map();
const BUTTONS = new Map();
let toastTimer;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}
function normalizeFilename(filename) { return (filename || "").trim().toLowerCase(); }
function esc(value) {
    return (value ?? "").toString().replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function setTitleFromName(name) {
    const base = (name || "Renderer Live").replace(/\.csv$/i, "");
    document.title = base;
    HDR.textContent = base;
}
function parseCsvRows(text) {
    const rows = [];
    let row = [], cur = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cur += ch;
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === ",") { row.push(cur); cur = ""; }
        else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (ch !== "\r") cur += ch;
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
}
function hasHeader(rows) {
    if (!rows.length) return false;
    const first = rows[0].map(value => (value || "").trim().toLowerCase());
    return first.includes("imageurl") || first.includes("name") || first.includes("url") || first.includes("type");
}
async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}
async function loadFileList() {
    try {
        const files = await api("/api/extensions/files");
        const ordered = [...CSV_FILES.filter(name => files.some(file => normalizeFilename(file) === normalizeFilename(name)))];
        for (const file of files) if (!ordered.some(name => normalizeFilename(name) === normalizeFilename(file))) ordered.push(file);
        csvButtons.innerHTML = "";
        BUTTONS.clear();
        for (const filename of ordered) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "csv-button";
            button.textContent = filename.replace(/\.csv$/i, "");
            button.addEventListener("click", () => openCsv(filename));
            BUTTONS.set(normalizeFilename(filename), button);
            csvButtons.appendChild(button);
        }
        if (!ordered.length) { hint.textContent = 'No CSV files found in the server "data" folder.'; return; }
        const preferred = ordered.find(name => normalizeFilename(name) === normalizeFilename(avis_preferred));
        await openCsv(preferred || ordered[0]);
    } catch (error) {
        hint.textContent = `Unable to load CSV files: ${error.message}`;
    }
}
async function openCsv(filename) {
    try {
        const result = await api(`/api/extensions/file?file=${encodeURIComponent(filename)}`);
        const rows = result.rows;
        const header = hasHeader(rows);
        const start = header ? 1 : 0;
        const items = [];
        for (let i = start; i < rows.length; i++) {
            const row = rows[i];
            if (row.every(value => !String(value ?? "").trim())) continue;
            items.push({ rowIndex: i, img: row[0] || "", name: row[1] || "", url: row[2] || "", type: row[3] || "" });
        }
        LOADED_CSVS.set(normalizeFilename(filename), { filename, rows, items });
        for (const [key, button] of BUTTONS) button.classList.toggle("active", key === normalizeFilename(filename));
        setTitleFromName(filename);
        render(filename, items);
        hint.textContent = `${filename}: ${items.length} item${items.length === 1 ? "" : "s"}. Changes are saved to the server CSV.`;
    } catch (error) { showToast(`Unable to load ${filename}: ${error.message}`); }
}
const SAVE_QUEUES = new Map();
let copyTimer;

async function saveItem(filename, item, field, value) {
    const loaded = LOADED_CSVS.get(normalizeFilename(filename));
    if (!loaded) return;
    const row = loaded.rows[item.rowIndex];
    while (row.length < 4) row.push("");
    const column = field === "name" ? 1 : 3;
    const previous = row[column] || "";
    row[column] = value;
    item[field] = value;
    const key = normalizeFilename(filename);
    const previousQueue = SAVE_QUEUES.get(key) || Promise.resolve();
    const currentQueue = previousQueue.catch(() => {}).then(async () => {
        await api("/api/extensions/file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: filename, rows: loaded.rows })
        });
    });
    SAVE_QUEUES.set(key, currentQueue);
    try {
        await currentQueue;
        showToast("Saved automatically.");
    } catch (error) {
        row[column] = previous;
        item[field] = previous;
        showToast(`Save failed: ${error.message}`);
        throw error;
    } finally {
        if (SAVE_QUEUES.get(key) === currentQueue) SAVE_QUEUES.delete(key);
    }
}

function updateCardStyle(card, title, tag, image, item) {
    const key = (item.type || "").toLowerCase();
    card.style.backgroundColor = item.type ? (TYPE_COLORS.get(key) || "white") : "white";
    title.style.color = DARK_TYPES.has(key) ? "#e8e8e8" : "";
    title.textContent = item.name;
    tag.textContent = item.type.toUpperCase();
    tag.hidden = !item.type;
    image.alt = item.name;
}

function editInline(element, field, filename, item, card, title, tag, image) {
    if (element.dataset.editing === "true") return;
    element.dataset.editing = "true";
    const original = field === "name" ? item.name : item.type;
    const input = document.createElement("input");
    input.className = "inline-editor";
    input.value = original;
    input.setAttribute("aria-label", field === "name" ? "Name" : "Show tag");
    element.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;

    const finish = async save => {
        if (finished) return;
        finished = true;
        const value = save ? input.value.trim() : original;
        const replacement = field === "name" ? title : tag;
        input.replaceWith(replacement);
        replacement.dataset.editing = "false";
        if (!save || value === original) {
            updateCardStyle(card, title, tag, image, item);
            return;
        }
        try {
            await saveItem(filename, item, field, value);
            updateCardStyle(card, title, tag, image, item);
        } catch {
            updateCardStyle(card, title, tag, image, item);
        }
    };

    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
        } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
        }
    });
}

function render(filename, items) {
    GRID.innerHTML = "";
    if (!items.length) { GRID.innerHTML = "<div>No entries found in this CSV.</div>"; return; }
    const fragment = document.createDocumentFragment();
    for (const item of items) {
        const card = document.createElement("div");
        card.className = "card";
        const image = document.createElement(item.img ? "img" : "div");
        if (item.img) { image.src = item.img; image.loading = "lazy"; image.alt = item.name; }
        else image.className = "ph";
        const meta = document.createElement("div");
        meta.className = "meta";
        const tag = document.createElement("div");
        tag.className = "tag editable-text";
        const title = document.createElement("div");
        title.className = "t editable-text";
        title.title = "Click to copy; double-click to edit";
        const linkRow = document.createElement("div");
        linkRow.className = "ln";
        const link = document.createElement("a");
        link.textContent = "Link";
        link.href = item.url || "#";
        link.target = "_blank";
        link.rel = "noreferrer";
        link.hidden = !item.url;
        linkRow.appendChild(link);
        updateCardStyle(card, title, tag, image, item);

        title.addEventListener("click", async () => {
            clearTimeout(copyTimer);
            copyTimer = setTimeout(async () => {
                try {
                    await navigator.clipboard.writeText(item.name);
                    showToast(item.name);
                } catch {
                    showToast("Unable to copy name.");
                }
            }, 220);
        });
        title.addEventListener("dblclick", () => {
            clearTimeout(copyTimer);
            editInline(title, "name", filename, item, card, title, tag, image);
        });
        tag.title = "Double-click to edit show tag";
        tag.addEventListener("dblclick", () => {
            clearTimeout(copyTimer);
            editInline(tag, "type", filename, item, card, title, tag, image);
        });

        meta.append(tag, title, linkRow);
        card.append(image, meta);
        fragment.appendChild(card);
    }
    GRID.appendChild(fragment);
}
loadFileList();
