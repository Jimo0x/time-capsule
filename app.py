"""Time Capsule — lettres et photos scellées jusqu'à une date choisie.

Le serveur refuse de livrer le contenu avant la date d'ouverture. Si l'auteur
choisit une phrase secrète, le contenu est en plus chiffré dans le navigateur
(AES-GCM, clé dérivée par PBKDF2) : le serveur ne peut alors jamais le lire.
"""
from __future__ import annotations

import json
import os
import secrets
import smtplib
import sqlite3
import threading
import time
from email.message import EmailMessage

from flask import Flask, jsonify, request, send_from_directory

DB = os.environ.get("CAPSULE_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "capsules.db"))
MAX_PAYLOAD = 12 * 1024 * 1024
app = Flask(__name__, static_folder="static", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_PAYLOAD + 65536
_events: list[dict] = []


def con():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("""CREATE TABLE IF NOT EXISTS capsules(id TEXT PRIMARY KEY, title TEXT, author TEXT, created REAL, open_at REAL,
                 payload TEXT, encrypted INTEGER, hint TEXT, email TEXT, color TEXT, public INTEGER, opened INTEGER DEFAULT 0,
                 notified INTEGER DEFAULT 0, views INTEGER DEFAULT 0)""")
    return c


def public_view(r, now: float) -> dict:
    is_open = now >= r["open_at"]
    d = {"id": r["id"], "title": r["title"], "author": r["author"], "created": r["created"], "open_at": r["open_at"], "open": is_open,
         "encrypted": bool(r["encrypted"]), "hint": r["hint"], "color": r["color"], "public": bool(r["public"]), "views": r["views"],
         "size": len(r["payload"] or "")}
    return d


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.post("/api/capsules")
def create():
    d = request.get_json(silent=True) or {}
    title = (d.get("title") or "").strip()[:120]
    payload = d.get("payload")
    try:
        open_at = float(d.get("open_at"))
    except (TypeError, ValueError):
        return jsonify({"error": "Date d'ouverture invalide"}), 400
    if not title or not payload:
        return jsonify({"error": "Titre et contenu obligatoires"}), 400
    if open_at < time.time() + 5:
        return jsonify({"error": "La date d'ouverture doit être dans le futur"}), 400
    if open_at > time.time() + 50 * 365 * 86400:
        return jsonify({"error": "50 ans maximum, soyons raisonnables"}), 400
    raw = json.dumps(payload)
    if len(raw) > MAX_PAYLOAD:
        return jsonify({"error": "Capsule trop lourde (12 Mo max)"}), 413
    cid = secrets.token_urlsafe(9)
    c = con()
    c.execute("INSERT INTO capsules(id,title,author,created,open_at,payload,encrypted,hint,email,color,public) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              (cid, title, (d.get("author") or "Anonyme")[:60], time.time(), open_at, raw, int(bool(d.get("encrypted"))),
               (d.get("hint") or "")[:120], (d.get("email") or "")[:200], d.get("color") or "#e5172f", int(bool(d.get("public", True)))))
    c.commit()
    return jsonify({"id": cid})


@app.get("/api/capsules")
def wall():
    now = time.time()
    rows = con().execute("SELECT * FROM capsules WHERE public=1 ORDER BY open_at").fetchall()
    return jsonify({"now": now, "capsules": [public_view(r, now) for r in rows], "events": _events[-20:]})


@app.get("/api/capsules/<cid>")
def get(cid):
    c = con()
    r = c.execute("SELECT * FROM capsules WHERE id=?", (cid,)).fetchone()
    if not r:
        return jsonify({"error": "Capsule introuvable"}), 404
    now = time.time()
    d = public_view(r, now)
    d["now"] = now
    if d["open"]:
        d["payload"] = json.loads(r["payload"])
        c.execute("UPDATE capsules SET views=views+1, opened=1 WHERE id=?", (cid,))
        c.commit()
    return jsonify(d)


def notify(r) -> None:
    """Envoie un e-mail si SMTP_HOST est configuré, sinon journalise l'ouverture."""
    msg = f"La capsule « {r['title']} » de {r['author']} vient de s'ouvrir."
    _events.append({"t": time.time(), "msg": msg, "id": r["id"]})
    host = os.environ.get("SMTP_HOST")
    if not (host and r["email"]):
        return
    try:
        m = EmailMessage()
        m["Subject"] = f"⏳ Votre capsule temporelle « {r['title']} » est ouverte"
        m["From"] = os.environ.get("SMTP_FROM", "capsule@localhost")
        m["To"] = r["email"]
        m.set_content(f"{msg}\n\nLisez-la ici : {os.environ.get('PUBLIC_URL', 'http://127.0.0.1:5007')}/#c/{r['id']}")
        with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", 587))) as s:
            s.starttls()
            if os.environ.get("SMTP_USER"):
                s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
            s.send_message(m)
    except Exception as e:  # pragma: no cover
        print("SMTP :", e)


def scheduler_tick() -> int:
    c = con()
    due = c.execute("SELECT * FROM capsules WHERE notified=0 AND open_at<=?", (time.time(),)).fetchall()
    for r in due:
        notify(r)
        c.execute("UPDATE capsules SET notified=1 WHERE id=?", (r["id"],))
    c.commit()
    return len(due)


def scheduler(period: float = 5.0) -> None:
    while True:
        try:
            scheduler_tick()
        except Exception as e:  # pragma: no cover
            print("scheduler :", e)
        time.sleep(period)


if __name__ == "__main__":
    threading.Thread(target=scheduler, daemon=True).start()
    port = int(os.environ.get("PORT", 5007))
    print(f"Time Capsule → http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, threaded=True)
