const COLORS = ["#e5172f", "#b3122a", "#f5a524", "#5aa9ff", "#2ecc71", "#c084fc", "#ececf1"];
let photos = [], color = COLORS[0], wall = { capsules: [] }, filter = "all", skew = 0, ticker = null;

/* ── navigation par hash ── */
function route() {
  clearInterval(ticker); const h = location.hash;
  $$(".view").forEach(v => v.classList.remove("on"));
  if (h.startsWith("#c/")) { $("#vCap").classList.add("on"); openCapsule(h.slice(3)); }
  else if (h === "#new") { $("#vNew").classList.add("on"); }
  else { $("#vWall").classList.add("on"); loadWall(); ticker = setInterval(tickWall, 1000); }
}
addEventListener("hashchange", route);
$("#newBtn").onclick = () => location.hash = "#new";
const now = () => Date.now() / 1000 + skew;

function parts(sec) { sec = Math.max(0, Math.floor(sec)); return { j: Math.floor(sec / 86400), h: Math.floor(sec % 86400 / 3600), m: Math.floor(sec % 3600 / 60), s: sec % 60 }; }
function short(sec) { const p = parts(sec), z = n => String(n).padStart(2, "0"); return p.j > 365 ? `${(p.j / 365).toFixed(1)} ans` : p.j ? `${p.j} j ${z(p.h)}:${z(p.m)}:${z(p.s)}` : `${z(p.h)}:${z(p.m)}:${z(p.s)}`; }

/* ── mur ── */
async function loadWall() { wall = await api("/api/capsules"); skew = wall.now - Date.now() / 1000; renderWall(); }
$$("#filter .tab").forEach(t => t.onclick = () => { $$("#filter .tab").forEach(x => x.classList.toggle("on", x === t)); filter = t.dataset.f; renderWall(); });
function renderWall() {
  const list = wall.capsules.filter(c => filter === "all" || (filter === "open") === (c.open_at <= now()));
  $("#caps").innerHTML = list.map(c => {
    const open = c.open_at <= now(), prog = Math.min(1, (now() - c.created) / (c.open_at - c.created));
    return `<div class="card cap" data-id="${c.id}"><div class="band" style="background:${c.color}"></div>
      <div class="row between"><div class="seal" style="background:radial-gradient(circle at 35% 35%,${c.color},#000 140%)">${open ? "📭" : c.encrypted ? "🔐" : "🔒"}</div>
        <span class="badge ${open ? "ok" : "red"}">${open ? "ouverte" : "scellée"}</span></div>
      <h3 style="margin:14px 0 2px">${esc(c.title)}</h3><div class="dim" style="font-size:12px">par ${esc(c.author)} · ${new Date(c.created * 1000).toLocaleDateString("fr-FR")}</div>
      <div style="margin:14px 0 6px" class="cd" data-cd="${c.open_at}">${open ? "Prête à être lue" : short(c.open_at - now())}</div>
      <div class="meter"><i style="width:${prog * 100}%;background:${c.color}"></i></div>
      <div class="dim" style="font-size:11.5px;margin-top:6px">${open ? `ouverte le ${new Date(c.open_at * 1000).toLocaleString("fr-FR")} · ${c.views} lecture(s)` : `ouverture le ${new Date(c.open_at * 1000).toLocaleString("fr-FR")}`}</div></div>`;
  }).join("") || `<div class="empty" style="grid-column:1/-1">Aucune capsule ici. <a href="#new">Écrivez la première.</a></div>`;
  $$(".cap").forEach(e => e.onclick = () => location.hash = "#c/" + e.dataset.id);
  $("#events").innerHTML = wall.events.slice().reverse().map(e => `<div>⏳ ${new Date(e.t * 1000).toLocaleTimeString()} — <a href="#c/${e.id}">${esc(e.msg)}</a></div>`).join("") || "Aucune ouverture récente.";
}
function tickWall() {
  let reload = false;
  $$("[data-cd]").forEach(e => { const left = +e.dataset.cd - now(); if (left <= 0 && e.textContent !== "Prête à être lue") reload = true; else if (left > 0) e.textContent = short(left); });
  if (reload) loadWall();
}

/* ── création ── */
$("#swatches").innerHTML = COLORS.map((c, i) => `<div class="swatch ${i ? "" : "on"}" data-c="${c}" style="background:${c}"></div>`).join("");
$$(".swatch").forEach(s => s.onclick = () => { color = s.dataset.c; $$(".swatch").forEach(x => x.classList.toggle("on", x === s)); });
function setDate(d) { const off = d.getTimezoneOffset() * 60000; $("#fDate").value = new Date(d - off).toISOString().slice(0, 16); human(); }
function human() { const t = new Date($("#fDate").value).getTime() / 1000; $("#fDateHuman").textContent = t ? `S'ouvrira dans ${short(t - Date.now() / 1000)}` : ""; }
$("#fDate").oninput = human; $$(".presets button").forEach(b => b.onclick = () => setDate(new Date(Date.now() + b.dataset.d * 1000)));
setDate(new Date(Date.now() + 31536000000));
const pd = $("#pDrop"), pf = $("#pFile"); pd.onclick = () => pf.click(); pf.onchange = () => addPhotos(pf.files);
pd.addEventListener("dragover", e => { e.preventDefault(); pd.classList.add("over"); }); pd.addEventListener("dragleave", () => pd.classList.remove("over"));
pd.addEventListener("drop", e => { e.preventDefault(); pd.classList.remove("over"); addPhotos(e.dataTransfer.files); });
async function addPhotos(files) {
  for (const f of [...files].slice(0, 6 - photos.length)) {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = URL.createObjectURL(f); });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); photos.push(c.toDataURL("image/jpeg", .82));
  }
  $("#thumbs").innerHTML = photos.map((p, i) => `<img src="${p}" title="cliquer pour retirer" data-i="${i}">`).join("");
  $$("#thumbs img").forEach(i => i.onclick = () => { photos.splice(+i.dataset.i, 1); addPhotos([]); });
}

/* chiffrement de bout en bout : PBKDF2 (200 000 itérations) + AES-GCM 256 */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function keyFrom(pass, salt) { const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function encrypt(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await keyFrom(pass, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  let bin = ""; new Uint8Array(data).forEach(b => bin += String.fromCharCode(b));
  return { salt: b64(salt), iv: b64(iv), data: btoa(bin) };
}
async function decrypt(p, pass) { const key = await keyFrom(pass, unb64(p.salt)); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, key, unb64(p.data)))); }

$("#seal").onclick = async () => {
  const content = { letter: $("#fLetter").value, photos }, pass = $("#fPass").value;
  if (!$("#fTitle").value.trim() || (!content.letter.trim() && !photos.length)) return toast("Donnez un titre et écrivez quelque chose.");
  const body = { title: $("#fTitle").value, author: $("#fAuthor").value || "Anonyme", open_at: new Date($("#fDate").value).getTime() / 1000,
    payload: pass ? await encrypt(content, pass) : content, encrypted: !!pass, hint: $("#fHint").value, email: $("#fEmail").value, color, public: $("#fPublic").checked };
  try {
    const { id } = await api("/api/capsules", { method: "POST", body });
    photos = []; ["#fTitle", "#fLetter", "#fAuthor", "#fPass", "#fHint", "#fEmail"].forEach(s => $(s).value = ""); $("#thumbs").innerHTML = "";
    location.hash = "#c/" + id; toast("Capsule scellée ✉");
  } catch (e) { toast(e.message); }
};
$("#demo").onclick = async () => {
  const { id } = await api("/api/capsules", { method: "POST", body: { title: "Message au futur proche", author: "Le moi d'il y a 15 secondes", open_at: Date.now() / 1000 + 15, color: "#c084fc", public: true,
    payload: { letter: "Salut toi,\n\nSi tu lis ceci, c'est que quinze secondes se sont écoulées. Ça paraît court, mais tu as déjà changé un peu : ton café a refroidi, ton projet a avancé d'une ligne.\n\nPromets-moi une chose : écris une vraie capsule pour dans un an. Raconte ce qui te fait peur aujourd'hui, et ce qui te rend fier. Tu verras, le futur toi adorera.", photos: [] } } });
  location.hash = "#c/" + id;
};

/* ── ouverture ── */
async function openCapsule(id) {
  const v = $("#vCap"); let c;
  try { c = await api("/api/capsules/" + id); } catch (e) { v.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  skew = c.now - Date.now() / 1000;
  const share = location.origin + location.pathname + "#c/" + id;
  if (!c.open) {
    v.innerHTML = `<div style="text-align:center;padding-top:20px"><div class="env seal"><div class="wax" style="background:radial-gradient(circle at 35% 35%,${c.color},#300 140%)">${c.encrypted ? "🔐" : "⌛"}</div></div>
      <div class="kicker">Capsule scellée</div><h1 style="font-size:30px;margin-top:8px">${esc(c.title)}</h1><p class="muted">par ${esc(c.author)} · scellée le ${new Date(c.created * 1000).toLocaleString("fr-FR")}</p>
      <div class="big-cd" id="bigcd"></div><p class="muted">Ouverture le <b>${new Date(c.open_at * 1000).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}</b></p>
      <div class="row" style="justify-content:center;margin-top:16px"><input class="input mono" value="${esc(share)}" readonly style="max-width:420px"><button class="btn ghost" id="copy">Copier le lien</button></div></div>`;
    $("#copy").onclick = () => { navigator.clipboard.writeText(share); toast("Lien copié"); };
    const tick = () => { const left = c.open_at - now(); if (left <= 0) { clearInterval(ticker); return openCapsule(id); }
      const p = parts(left); $("#bigcd").innerHTML = [["j", "jours"], ["h", "heures"], ["m", "minutes"], ["s", "secondes"]].map(([k, l]) => `<div><b>${String(p[k]).padStart(2, "0")}</b><span>${l}</span></div>`).join(""); };
    tick(); ticker = setInterval(tick, 1000); return;
  }
  let content = c.payload;
  if (c.encrypted) {
    v.innerHTML = `<div class="card" style="max-width:460px;margin:60px auto;text-align:center"><div style="font-size:40px">🔐</div><h2>${esc(c.title)}</h2><p class="muted">Cette capsule est chiffrée. Le serveur lui-même ne peut pas la lire.${c.hint ? `<br>Indice : <i>${esc(c.hint)}</i>` : ""}</p>
      <input type="password" class="input" id="pass" placeholder="Phrase secrète"><button class="btn" id="unlock" style="margin-top:10px;width:100%;justify-content:center">Déverrouiller</button></div>`;
    await new Promise(res => { const go = async () => { try { content = await decrypt(c.payload, $("#pass").value); res(); } catch { toast("Phrase secrète incorrecte"); } };
      $("#unlock").onclick = go; $("#pass").onkeydown = e => e.key === "Enter" && go(); });
  }
  v.innerHTML = `<div class="env"><div class="wax" style="background:radial-gradient(circle at 35% 35%,${c.color},#300 140%)">✉</div></div>`;
  await new Promise(r => setTimeout(r, 1500));
  const waited = parts(c.open_at - c.created);
  v.innerHTML = `<div style="text-align:center;margin-bottom:24px"><div class="kicker">Ouverte après ${waited.j ? waited.j + " jours" : waited.h ? waited.h + " h " + waited.m + " min" : waited.m + " min " + waited.s + " s"} d'attente</div><h1 style="font-size:30px;margin-top:8px">${esc(c.title)}</h1></div>
    ${content.letter ? `<div class="paper">${esc(content.letter)}<div class="sig">— ${esc(c.author)}, le ${new Date(c.created * 1000).toLocaleDateString("fr-FR")}</div></div>` : ""}
    <div class="polas">${(content.photos || []).map((p, i) => `<div class="pola" style="--r:${(i % 2 ? 1 : -1) * (2 + i % 3)}deg"><img src="${p}" alt=""></div>`).join("")}</div>
    <div style="text-align:center"><a class="btn ghost" href="#">← Retour au mur</a></div>`;
}
route();
