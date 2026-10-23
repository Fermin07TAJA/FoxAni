from flask import Flask, jsonify, request, send_from_directory
import csv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__)


def resolve_csv(filename):
    if not isinstance(filename, str) or not filename.lower().endswith(".csv"):
        return None
    if filename != os.path.basename(filename) or filename in (".", ".."):
        return None
    path = os.path.abspath(os.path.join(DATA_DIR, filename))
    if os.path.commonpath([DATA_DIR, path]) != DATA_DIR:
        return None
    return path


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "renderer_live.html")


@app.get("/renderer_live")
def renderer_live_page():
    return send_from_directory(BASE_DIR, "renderer_live.html")


@app.get("/renderer_live.html")
def renderer_live_html():
    return send_from_directory(BASE_DIR, "renderer_live.html")


@app.get("/renderer_live.js")
def renderer_live_javascript():
    return send_from_directory(BASE_DIR, "renderer_live.js")


@app.get("/icons/Horikita.ico")
def horikita_icon():
    return send_from_directory(os.path.join(BASE_DIR, "icons"), "Horikita.ico")


@app.get("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(BASE_DIR, "icons"), "Horikita.ico")


@app.get("/api/extensions/files")
def list_csv_files():
    files = [
        name for name in os.listdir(DATA_DIR)
        if name.lower().endswith(".csv")
        and os.path.isfile(os.path.join(DATA_DIR, name))
    ]
    return jsonify(sorted(files, key=str.lower))


@app.get("/api/extensions/file")
def load_csv_file():
    filename = request.args.get("file", "")
    path = resolve_csv(filename)
    if path is None or not os.path.isfile(path):
        return jsonify({"error": "CSV file not found or invalid filename."}), 404
    try:
        with open(path, newline="", encoding="utf-8-sig") as file:
            rows = list(csv.reader(file))
        return jsonify({"file": filename, "rows": rows})
    except (OSError, csv.Error, UnicodeError) as error:
        return jsonify({"error": str(error)}), 500


@app.post("/api/extensions/file")
def save_csv_file():
    data = request.get_json(silent=True) or {}
    filename = data.get("file", "")
    rows = data.get("rows")
    path = resolve_csv(filename)
    if path is None or not os.path.isfile(path):
        return jsonify({"error": "CSV file not found or invalid filename."}), 404
    if not isinstance(rows, list) or any(
        not isinstance(row, list)
        or any(not isinstance(cell, (str, int, float)) for cell in row)
        for row in rows
    ):
        return jsonify({"error": "Invalid CSV rows."}), 400
    try:
        with open(path, "w", newline="", encoding="utf-8") as file:
            csv.writer(file).writerows(rows)
        return jsonify({"status": "ok"})
    except OSError as error:
        return jsonify({"error": str(error)}), 500


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=False)
