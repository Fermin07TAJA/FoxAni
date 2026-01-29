import csv
import os
import sys
import time
import glob
from typing import Optional, Tuple

import requests

# -------- Settings --------
THROTTLE_S = 0.35
CONNECT_TIMEOUT_S = 5
READ_TIMEOUT_S = 10
MAX_RETRIES = 4
OVERWRITE_OUTPUT = False  # True to overwrite input CSV

JIKAN_BASE = "https://api.jikan.moe/v4/anime"


def log(msg: str) -> None:
    print(msg, flush=True)


def find_single_csv_in_cwd() -> str:
    cands = [p for p in glob.glob("*.csv") if os.path.isfile(p)]
    if not cands:
        raise FileNotFoundError("No .csv files found in current directory.")
    if len(cands) > 1:
        raise RuntimeError(
            "Multiple CSVs found. Pass one explicitly:\n  "
            + "\n  ".join(cands)
        )
    return cands[0]


def probe_jikan(session: requests.Session) -> None:
    # Quick sanity check so you fail fast if networking is the problem.
    try:
        r = session.get(
            JIKAN_BASE,
            params={"q": "Naruto", "limit": 1},
            timeout=(CONNECT_TIMEOUT_S, READ_TIMEOUT_S),
        )
        log(f"Jikan probe status: {r.status_code}")
    except Exception as e:
        raise RuntimeError(f"Cannot reach Jikan (network/proxy/DNS/TLS issue): {e}") from e


def jikan_cover_by_title(session: requests.Session, title: str) -> str:
    params = {"q": title, "limit": 1}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(
                JIKAN_BASE,
                params=params,
                timeout=(CONNECT_TIMEOUT_S, READ_TIMEOUT_S),
            )

            # Rate limit / transient errors
            if r.status_code == 429 or 500 <= r.status_code <= 599:
                backoff = min(2 ** attempt, 10)
                log(f"  HTTP {r.status_code} for '{title}'. Backoff {backoff}s (attempt {attempt}/{MAX_RETRIES})")
                time.sleep(backoff)
                continue

            if not r.ok:
                log(f"  HTTP {r.status_code} for '{title}' (no retry).")
                return ""

            j = r.json()
            data = j.get("data") or []
            if not data:
                return ""

            a0 = data[0]
            images = a0.get("images") or {}
            jpg = (images.get("jpg") or {}).get("image_url") or ""
            webp = (images.get("webp") or {}).get("image_url") or ""
            return jpg or webp or ""

        except requests.exceptions.Timeout:
            backoff = min(2 ** attempt, 10)
            log(f"  TIMEOUT for '{title}'. Backoff {backoff}s (attempt {attempt}/{MAX_RETRIES})")
            time.sleep(backoff)
            continue
        except Exception as e:
            log(f"  ERROR for '{title}': {e}")
            return ""

    return ""


def process_csv(path: str) -> Tuple[str, int, int, int]:
    with open(path, "r", newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    if not rows:
        raise ValueError("CSV is empty.")

    # Normalize to 3 columns: ImageURL, Name, URL
    header = rows[0]
    has_header = any(h.strip().lower() in ("imageurl", "name", "url") for h in header)

    data_start = 1 if has_header else 0
    out = [["ImageURL", "Name", "URL"]]

    total = 0
    filled = 0
    skipped = 0

    session = requests.Session()
    session.headers.update({"User-Agent": "covers_from_csv/1.0"})

    log("Probing Jikan...")
    probe_jikan(session)
    log("Probe OK. Processing rows...")

    for idx in range(data_start, len(rows)):
        row = rows[idx]
        row = (row + ["", "", ""])[:3]
        img, name, url = row[0].strip(), row[1].strip(), row[2].strip()

        # Only fill if Name exists and ImageURL is blank
        if not name or img:
            out.append([img, name, url])
            skipped += 1
            continue

        total += 1
        log(f"[{idx+1}/{len(rows)}] lookup: {name}")
        cover = jikan_cover_by_title(session, name)
        if cover:
            filled += 1
            log("  ok")
        else:
            log("  no match")
        out.append([cover, name, url])

        time.sleep(THROTTLE_S)

    if OVERWRITE_OUTPUT:
        out_path = path
    else:
        base, ext = os.path.splitext(path)
        out_path = f"{base}_with_covers{ext}"

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerows(out)

    return out_path, filled, skipped, total


def main(csv_path: Optional[str] = None) -> None:
    if csv_path is None:
        csv_path = find_single_csv_in_cwd()

    log(f"Input CSV: {csv_path}")
    out_path, filled, skipped, total = process_csv(csv_path)
    log(f"Output CSV: {out_path}")
    log(f"Rows needing lookup: {total}")
    log(f"Filled covers: {filled}")
    log(f"Skipped rows: {skipped}")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    main(arg)
