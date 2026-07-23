const GRID = document.getElementById("grid");
const HDR = document.getElementById("hdr");
const fileInput = document.getElementById("file");
const folderInput = document.getElementById("folderInput");
const hint = document.getElementById("hint");
const csvButtons = document.getElementById("csvButtons");
const drop = document.getElementById("drop");
const toast = document.getElementById("toast");

const CSV_FILES = [
    "Prime.csv",
    "Top 20.csv",
    "Allie.csv", "Prepa.csv",
    "ET20.csv", "FA20.csv",
    "SP21.csv",             "FA21.csv",
    "HV22.csv", "SP22.csv", "ET22.csv", "FA22.csv",
    "21-22.csv",
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
    "Sequels.csv",

    "Watchlist.csv"
];

const TYPE_COLORS = new Map([
    ["allie", "#440161"],
    ["e-lissa", "#202020"],
    ["blanon", "#b8e6b8"],
    ["season favorite", "#ffd700"],
    ["marco", "#d84a4a"],
    ["shanon", "#b7ddff"],
    ["blythe", "#f3e9b2"],
    ["top 20", "#ffe44dd5"],
    ["prime", "#ffc7fbd5"],
    ["peliculas top", "#46b78a"],
    ["honorable mentions", "#49a8df"],
    ["nancy", "#ff7b00"],
    ["madeline", "#53d8ac"],
    ["joyce", "#53d8ac"],
    ["dropped", "#949595"],
    ["inc", "#949595"],
    ["t", "#06300f"],
    ["francis", "#a2c7f2"],
    ["zyun", "#a2c7f2"],
    ["dub", "#f0aeae"],
    ["manga", "#b3b3b3"],
    ["peli", "#c8f3b7"],
    ["live action", "#7d0000"]
]);

const DARK_TYPES = new Set([
    "allie",
    "e-lissa",
    "t",
    "live action"
]);

const LOADED_CSVS = new Map();
const BUTTONS = new Map();

document.getElementById("pickFolder").addEventListener("click", e => {
    e.preventDefault();
    folderInput.click();
});

document.getElementById("pick").addEventListener("click", e => {
    e.preventDefault();
    fileInput.click();
});

folderInput.addEventListener("change", async () => {
    const files = [...(folderInput.files || [])];

    await loadFiles(files, true);

    folderInput.value = "";
});

fileInput.addEventListener("change", async () => {
    const files = [...(fileInput.files || [])];

    await loadFiles(files, false);

    fileInput.value = "";
});

drop.addEventListener("dragover", e => {
    e.preventDefault();
    drop.style.background = "rgba(255,255,255,.9)";
});

drop.addEventListener("dragleave", () => {
    drop.style.background = "";
});

drop.addEventListener("drop", async e => {
    e.preventDefault();
    drop.style.background = "";

    const files = [...(e.dataTransfer.files || [])];

    await loadFiles(files, false);
});

document.addEventListener("keydown", e => {

    if ((e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s") {

        e.preventDefault();

        showToast("Schtop it. Schtop it Madhav.");

    }

});

let toastTimer;

function showToast(text){

    toast.textContent = text;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 400);

}

function createCsvButtons() {
    csvButtons.innerHTML = "";
    BUTTONS.clear();

    for (const filename of CSV_FILES) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "csv-button";
        button.textContent = filename.replace(/\.csv$/i, "");
        button.disabled = true;

        button.addEventListener("click", () => {
            openLoadedCsv(filename);
        });

        BUTTONS.set(normalizeFilename(filename), button);
        csvButtons.appendChild(button);
    }
}

async function loadFiles(files, replaceExisting) {
    const csvFiles = files.filter(file =>
        file.name.toLowerCase().endsWith(".csv")
    );

    if (csvFiles.length === 0) {
        hint.textContent = "No CSV files were found.";
        return;
    }

    if (replaceExisting) {
        LOADED_CSVS.clear();
    }

    let loadedCount = 0;

    for (const file of csvFiles) {
        try {
            const text = await file.text();
            const filename = file.name;
            const key = normalizeFilename(filename);

            LOADED_CSVS.set(key, {
                filename,
                items: parseCsv(text)
            });

            loadedCount++;
        }
        catch (error) {
            console.error("Unable to read file:", file.name, error);
        }
    }

    updateCsvButtons();

    hint.textContent =
        `Loaded ${loadedCount} CSV file${loadedCount === 1 ? "" : "s"}.`;

    openFirstAvailableCsv();
}

function updateCsvButtons() {
    for (const [key, button] of BUTTONS) {
        button.disabled = !LOADED_CSVS.has(key);
    }

    for (const [key, csv] of LOADED_CSVS) {
        if (BUTTONS.has(key))
            continue;

        const button = document.createElement("button");

        button.type = "button";
        button.className = "csv-button";
        button.textContent = csv.filename.replace(/\.csv$/i, "");

        button.addEventListener("click", () => {
            openLoadedCsv(csv.filename);
        });

        BUTTONS.set(key, button);
        csvButtons.appendChild(button);
    }
}

function openFirstAvailableCsv() {
    for (const filename of CSV_FILES) {
        if (LOADED_CSVS.has(normalizeFilename(filename))) {
            openLoadedCsv(filename);
            return;
        }
    }

    const first = LOADED_CSVS.values().next().value;

    if (first)
        openLoadedCsv(first.filename);
}

function openLoadedCsv(filename) {
    const key = normalizeFilename(filename);
    const csv = LOADED_CSVS.get(key);

    if (!csv)
        return;

    setActiveButton(key);
    setTitleFromName(csv.filename);
    render(csv.items);

    hint.textContent =
        `${csv.filename}: ${csv.items.length} item` +
        `${csv.items.length === 1 ? "" : "s"}.`;
}

function setActiveButton(activeKey) {
    for (const [key, button] of BUTTONS) {
        button.classList.toggle("active", key === activeKey);
    }
}

function normalizeFilename(filename) {
    return (filename || "")
        .trim()
        .toLowerCase();
}

function parseCsv(text) {
    const rows = parseCsvRows(text);

    if (rows.length === 0)
        return [];

    const firstRow = rows[0].map(value =>
        (value || "").trim().toLowerCase()
    );

    const hasHeader =
        firstRow.includes("imageurl") ||
        firstRow.includes("name") ||
        firstRow.includes("url") ||
        firstRow.includes("type");

    const startIndex = hasHeader ? 1 : 0;
    const out = [];

    for (let i = startIndex; i < rows.length; i++) {
        const cols = rows[i];

        if (cols.every(value => !String(value || "").trim()))
            continue;

        const [img, name, url, type] = cols;

        out.push({
            img: (img || "").trim(),
            name: (name || "").trim(),
            url: (url || "").trim(),
            type: (type || "").trim()
        });
    }

    return out;
}

function parseCsvRows(text) {
    const rows = [];

    let row = [];
    let cur = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else if (ch === '"') {
                quoted = false;
            }
            else {
                cur += ch;
            }

            continue;
        }

        if (ch === '"') {
            quoted = true;
        }
        else if (ch === ",") {
            row.push(cur);
            cur = "";
        }
        else if (ch === "\n") {
            row.push(cur);
            rows.push(row);

            row = [];
            cur = "";
        }
        else if (ch !== "\r") {
            cur += ch;
        }
    }

    if (cur.length > 0 || row.length > 0) {
        row.push(cur);
        rows.push(row);
    }

    return rows;
}

function esc(value) {
    return (value ?? "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function setTitleFromName(name) {
    const base = (name || "Renderer").replace(/\.csv$/i, "");

    document.title = base;
    HDR.textContent = base;
}

function render(items) {
    GRID.innerHTML = "";

    if (items.length === 0) {
        GRID.innerHTML = "<div>No entries found in this CSV.</div>";
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const item of items) {
        const card = document.createElement("div");
        card.className = "card";

        const typeKey = item.type.toLowerCase();
        const isDark = item.type && DARK_TYPES.has(typeKey);

        if (item.type) {
            const color = TYPE_COLORS.get(typeKey);

            if (color)
                card.style.backgroundColor = color;
        }

        const imageHtml = item.img
            ? `
                <img
                    src="${esc(item.img)}"
                    loading="lazy"
                    alt="${esc(item.name)}"
                >
              `
            : `<div class="ph"></div>`;

        const tagHtml = item.type
            ? `<div class="tag">${esc(item.type.toUpperCase())}</div>`
            : "";

        const linkHtml = item.url
            ? `
                <a
                    href="${esc(item.url)}"
                    target="_blank"
                    rel="noreferrer"
                >
                    Link
                </a>
              `
            : "";

        card.innerHTML = `
            ${imageHtml}

            <div class="meta">
                ${tagHtml}

                <div class="t"${isDark ? ' style="color:#e8e8e8"' : ""}>
                    ${esc(item.name)}
                </div>

                <div class="ln">
                    ${linkHtml}
                </div>
            </div>
        `;

        fragment.appendChild(card);
    }

    GRID.appendChild(fragment);
}


createCsvButtons();