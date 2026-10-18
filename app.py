import os
import sys
from flask import Flask, request, jsonify, send_from_directory
# pyrefly: ignore [missing-import]
from google import genai

app = Flask(__name__, static_folder="static")

# Load .env file automatically if GEMINI_API_KEY is not in environment
if not os.environ.get("GEMINI_API_KEY") and os.path.exists(".env"):
    try:
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
    except Exception as e:
        print(f"[WARN] Could not parse .env: {e}")

# ── API key ────────────────────────────────────────────────────
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY environment variable not set.")
    sys.exit(1)

# ── Model (using active gemini-3.8-flash) ──────────────────────
model_name = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")

# ── Gemini client (created once, cheap — no network call here) ─
client = genai.Client(api_key=api_key)

# ── Chat session (lazy — created on first request, recovered on error) ─
_chat = None

def get_chat():
    """Return the active chat session, creating/re-creating it as needed."""
    global _chat
    if _chat is None:
        _chat = client.chats.create(model=model_name)
        print(f"[OK] Chat session created ({model_name})")
    return _chat

print(f"[OK] Gemini Web UI starting — model: {model_name}")


# ── Routes ─────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/chat", methods=["POST"])
def chat_endpoint():
    global _chat
    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    try:
        response = get_chat().send_message(user_message)
        return jsonify({"reply": response.text})

    except Exception as e:
        # Reset the chat session so the next request starts fresh
        _chat = None
        print(f"[ERR] Chat error: {e} — session reset")
        return jsonify({"error": str(e)}), 500


@app.route("/reset", methods=["POST"])
def reset_endpoint():
    global _chat
    _chat = None
    print("[OK] Chat session reset requested by user")
    return jsonify({"status": "reset", "model": model_name})


@app.route("/status", methods=["GET"])
def status_endpoint():
    return jsonify({
        "status": "online",
        "model": model_name,
        "session_active": _chat is not None
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

