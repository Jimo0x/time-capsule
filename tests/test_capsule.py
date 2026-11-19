import os, sys, pathlib, tempfile, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
os.environ["CAPSULE_DB"] = tempfile.mktemp(suffix=".db")
import app as A

def test_sealed_until_date(monkeypatch):
    c = A.app.test_client(); t0 = time.time()
    cid = c.post("/api/capsules", json={"title": "Moi en 2030", "payload": {"letter": "secret"}, "open_at": t0 + 3600}).json["id"]
    r = c.get(f"/api/capsules/{cid}").json; assert r["open"] is False and "payload" not in r
    monkeypatch.setattr(A.time, "time", lambda: t0 + 3601)
    r = c.get(f"/api/capsules/{cid}").json; assert r["open"] and r["payload"]["letter"] == "secret"
    assert A.scheduler_tick() >= 1 and A._events[-1]["id"] == cid

def test_validation():
    c = A.app.test_client()
    assert c.post("/api/capsules", json={"title": "x", "payload": {"letter": "a"}, "open_at": time.time() - 10}).status_code == 400
    assert c.post("/api/capsules", json={"title": "", "payload": {"letter": "a"}, "open_at": time.time() + 100}).status_code == 400
    assert c.get("/api/capsules/nope").status_code == 404
