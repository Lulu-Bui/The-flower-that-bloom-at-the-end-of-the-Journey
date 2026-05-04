const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const session = require("express-session");

admin.initializeApp();
const db = admin.firestore();

const app = express();

// ── SETTINGS ────────────────────────────────────────────────
// Change ADMIN_SLUG to your own secret URL path
const ADMIN_SLUG = "my-secret-admin-2025";

// Change ADMIN_PASSWORD to your own password
const ADMIN_PASSWORD = "coltdamian123";
// ────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "storysitesecretkey-changeme",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    // secure: true  ← uncomment when using HTTPS in production
  }
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect(`/${ADMIN_SLUG}/login`);
}

// ── HELPERS ──────────────────────────────────────────────────
const chaptersCol = () => db.collection("chapters");

async function getAllChapters() {
  const snap = await chaptersCol().orderBy("number", "asc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getChapter(id) {
  const doc = await chaptersCol().doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

// ── PUBLIC API ────────────────────────────────────────────────

// List published chapters (no passcode sent)
app.get("/api/chapters", async (req, res) => {
  try {
    const all = await getAllChapters();
    const published = all
      .filter(c => c.published)
      .map(c => ({
        id: c.id,
        number: c.number,
        title: c.title,
        subtitle: c.subtitle,
        hasGate: !!c.passcode,
        date: c.date,
      }));
    res.json(published);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get one chapter for reading (no passcode or locked content sent)
app.get("/api/chapters/:id", async (req, res) => {
  try {
    const ch = await getChapter(req.params.id);
    if (!ch || !ch.published) return res.status(404).json({ error: "Not found" });
    res.json({
      id: ch.id,
      number: ch.number,
      title: ch.title,
      subtitle: ch.subtitle,
      wordCount: ch.wordCount,
      date: ch.date,
      authorNote: ch.authorNote,
      freeContent: ch.freeContent,
      hasGate: !!ch.passcode,
      passcodeHint: ch.passcodeHint || "",
    });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Unlock gate
app.post("/api/chapters/:id/unlock", async (req, res) => {
  try {
    const ch = await getChapter(req.params.id);
    if (!ch || !ch.published) return res.status(404).json({ error: "Not found" });
    if (!ch.passcode) return res.json({ success: true, content: ch.lockedContent });
    if (req.body.passcode === ch.passcode) {
      res.json({ success: true, content: ch.lockedContent });
    } else {
      res.json({ success: false });
    }
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── ADMIN AUTH ────────────────────────────────────────────────

app.get(`/${ADMIN_SLUG}/login`, (req, res) => {
  const error = req.query.error ? "Wrong password — try again." : "";
  res.send(loginPage(error));
});

app.post(`/${ADMIN_SLUG}/login`, (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect(`/${ADMIN_SLUG}`);
  } else {
    res.redirect(`/${ADMIN_SLUG}/login?error=1`);
  }
});

app.get(`/${ADMIN_SLUG}/logout`, (req, res) => {
  req.session.destroy();
  res.redirect(`/${ADMIN_SLUG}/login`);
});

// ── ADMIN API ─────────────────────────────────────────────────

// All chapters including drafts
app.get(`/${ADMIN_SLUG}/api/chapters`, requireAdmin, async (req, res) => {
  try {
    res.json(await getAllChapters());
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Single chapter full data
app.get(`/${ADMIN_SLUG}/api/chapters/:id`, requireAdmin, async (req, res) => {
  try {
    const ch = await getChapter(req.params.id);
    if (!ch) return res.status(404).json({ error: "Not found" });
    res.json(ch);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create chapter
app.post(`/${ADMIN_SLUG}/api/chapters`, requireAdmin, async (req, res) => {
  try {
    const all = await getAllChapters();
    const data = {
      number: Number(req.body.number) || all.length + 1,
      title: req.body.title || "Untitled",
      subtitle: req.body.subtitle || "",
      authorNote: req.body.authorNote || "",
      freeContent: req.body.freeContent || "",
      passcode: req.body.passcode || "",
      passcodeHint: req.body.passcodeHint || "",
      lockedContent: req.body.lockedContent || "",
      published: req.body.published === true || req.body.published === "true",
      wordCount: req.body.wordCount || "",
      date: req.body.date || new Date().toISOString().split("T")[0],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await chaptersCol().add(data);
    res.json({ success: true, id: ref.id });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update chapter
app.put(`/${ADMIN_SLUG}/api/chapters/:id`, requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.number) body.number = Number(body.number);
    if (body.published !== undefined) body.published = body.published === true || body.published === "true";
    body.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await chaptersCol().doc(req.params.id).update(body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete chapter
app.delete(`/${ADMIN_SLUG}/api/chapters/:id`, requireAdmin, async (req, res) => {
  try {
    await chaptersCol().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Reorder chapters
app.post(`/${ADMIN_SLUG}/api/reorder`, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    const batch = db.batch();
    ids.forEach((id, i) => {
      batch.update(chaptersCol().doc(id), { number: i + 1 });
    });
    await batch.commit();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── ADMIN HTML PAGES (served by functions) ────────────────────

app.get(`/${ADMIN_SLUG}`, requireAdmin, (req, res) => {
  res.send(adminDashboardPage(ADMIN_SLUG));
});

app.get(`/${ADMIN_SLUG}/editor`, requireAdmin, (req, res) => {
  res.send(adminEditorPage(ADMIN_SLUG, null));
});

app.get(`/${ADMIN_SLUG}/editor/:id`, requireAdmin, (req, res) => {
  res.send(adminEditorPage(ADMIN_SLUG, req.params.id));
});

// ── HTML TEMPLATES ────────────────────────────────────────────

function loginPage(error) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Admin Login</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Nunito:wght@300;400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/style.css"/>
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;}
.login-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2.5rem 2.25rem;width:100%;max-width:360px;box-shadow:0 2px 24px rgba(0,0,0,0.05);text-align:center;}
.login-card h2{font-family:'Lora',serif;font-size:1.3rem;font-weight:500;margin-bottom:.3rem;}
.login-card p{font-size:.8rem;color:var(--muted);margin-bottom:1.75rem;}
.login-input{width:100%;padding:10px 14px;font-size:.9rem;font-family:'Nunito',sans-serif;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--ink);outline:none;margin-bottom:1rem;text-align:center;letter-spacing:.1em;transition:border-color .15s,box-shadow .15s;}
.login-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim);}
.login-btn{width:100%;padding:10px;font-size:.85rem;font-family:'Nunito',sans-serif;font-weight:500;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;transition:opacity .15s;}
.login-btn:hover{opacity:.85;}
.login-error{margin-top:.75rem;font-size:.78rem;color:var(--error);font-style:italic;}
</style></head><body>
<div class="login-card">
  <h2>Author Login</h2>
  <p>Enter your admin password to continue.</p>
  <form method="POST">
    <input class="login-input" type="password" name="password" placeholder="password" autocomplete="current-password" autofocus/>
    <button class="login-btn" type="submit">Enter</button>
    ${error ? `<p class="login-error">${error}</p>` : ""}
  </form>
</div></body></html>`;
}

function adminDashboardPage(slug) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Admin Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Nunito:wght@300;400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/style.css"/>
<style>
body{background:#f0ece4;font-family:'Nunito',sans-serif;font-weight:300;min-height:100vh;}
.topbar{background:var(--ink);color:#fff;padding:0 2rem;height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
.topbar-brand{font-family:'Lora',serif;font-size:1rem;font-style:italic;}
.topbar-right{display:flex;gap:1rem;align-items:center;}
.topbar-right a{font-size:.78rem;color:rgba(255,255,255,.65);text-decoration:none;letter-spacing:.06em;text-transform:uppercase;transition:color .15s;}
.topbar-right a:hover{color:#fff;}
.page-wrap{max-width:820px;margin:0 auto;padding:2.5rem 1.5rem 5rem;}
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.75rem;}
.page-header h1{font-family:'Lora',serif;font-size:1.5rem;font-weight:500;}
.ch-cards{display:flex;flex-direction:column;gap:10px;}
.ch-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.25rem;display:flex;align-items:center;gap:1rem;cursor:grab;}
.ch-card:active{cursor:grabbing;opacity:.8;}
.ch-drag{color:var(--faint);font-size:1.1rem;flex-shrink:0;user-select:none;}
.ch-info{flex:1;min-width:0;}
.ch-card-title{font-family:'Lora',serif;font-size:.95rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ch-card-meta{font-size:.73rem;color:var(--muted);margin-top:2px;}
.ch-actions{display:flex;gap:6px;flex-shrink:0;}
.badge{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:20px;font-family:'Nunito',sans-serif;font-weight:500;letter-spacing:.04em;}
.badge-published{background:var(--success-bg);color:var(--success);}
.badge-draft{background:#f0ece4;color:var(--muted);}
.badge-locked{background:#fdf6ee;color:#8a5a20;}
.empty-state{text-align:center;padding:4rem 2rem;color:var(--muted);font-size:.9rem;}
.empty-state span{font-size:2rem;display:block;margin-bottom:.75rem;}
.toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(8px);background:var(--ink);color:#fff;padding:.65rem 1.5rem;border-radius:8px;font-size:.82rem;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:999;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
</style></head><body>
<div class="topbar">
  <span class="topbar-brand">Story Admin</span>
  <div class="topbar-right">
    <a href="/" target="_blank">View site ↗</a>
    <a href="/${slug}/logout">Log out</a>
  </div>
</div>
<div class="page-wrap">
  <div class="page-header">
    <h1>Chapters</h1>
    <a class="btn btn-primary" href="/${slug}/editor">+ New Chapter</a>
  </div>
  <div class="ch-cards" id="ch-cards"><p style="color:var(--faint);font-size:.85rem;">Loading…</p></div>
</div>
<div class="toast" id="toast"></div>
<script>
const SLUG="${slug}";
let chapters=[];
async function load(){
  const r=await fetch("/"+SLUG+"/api/chapters");
  chapters=await r.json();render();
}
function render(){
  const c=document.getElementById("ch-cards");
  if(!chapters.length){c.innerHTML='<div class="empty-state"><span>📄</span>No chapters yet. Click <strong>+ New Chapter</strong> to get started.</div>';return;}
  c.innerHTML=chapters.map(ch=>\`
    <div class="ch-card" draggable="true" data-id="\${ch.id}">
      <span class="ch-drag" title="Drag to reorder">⠿</span>
      <div class="ch-info">
        <div class="ch-card-title"><span style="color:var(--accent);margin-right:6px;">Ch.\${ch.number}</span>\${ch.title||'<em style="color:var(--faint)">Untitled</em>'}</div>
        <div class="ch-card-meta">
          <span class="badge \${ch.published?'badge-published':'badge-draft'}">\${ch.published?'Published':'Draft'}</span>
          \${ch.passcode?' &nbsp;<span class="badge badge-locked">🔒 locked</span>':''}
          \${ch.date?' &nbsp;· '+ch.date:''}
        </div>
      </div>
      <div class="ch-actions">
        <a class="btn btn-ghost" href="/\${SLUG}/editor/\${ch.id}" style="font-size:.78rem;padding:6px 12px;">Edit</a>
        <button class="btn btn-danger" onclick="del('\${ch.id}')" style="font-size:.78rem;padding:6px 12px;">Delete</button>
      </div>
    </div>
  \`).join("");
  initDrag();
}
async function del(id){
  if(!confirm("Delete this chapter? Cannot be undone."))return;
  await fetch("/"+SLUG+"/api/chapters/"+id,{method:"DELETE"});
  chapters=chapters.filter(c=>c.id!==id);render();showToast("Deleted.");
}
function showToast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
function initDrag(){
  const cards=document.querySelectorAll(".ch-card");
  let dragged=null;
  cards.forEach(card=>{
    card.addEventListener("dragstart",()=>{dragged=card;setTimeout(()=>card.style.opacity=".4",0);});
    card.addEventListener("dragend",()=>{card.style.opacity="1";dragged=null;saveOrder();});
    card.addEventListener("dragover",e=>{e.preventDefault();const r=card.getBoundingClientRect();card.parentNode.insertBefore(dragged,e.clientY<r.top+r.height/2?card:card.nextSibling);});
  });
}
async function saveOrder(){
  const ids=[...document.querySelectorAll(".ch-card")].map(c=>c.dataset.id);
  await fetch("/"+SLUG+"/api/reorder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
  await load();showToast("Order saved.");
}
load();
</script></body></html>`;
}

function adminEditorPage(slug, chapterId) {
  const isEditing = !!chapterId;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Chapter Editor</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Nunito:wght@300;400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/css/style.css"/>
<style>
body{background:#f0ece4;font-family:'Nunito',sans-serif;font-weight:300;min-height:100vh;}
.topbar{background:var(--ink);color:#fff;padding:0 2rem;height:52px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
.topbar-brand{font-family:'Lora',serif;font-size:1rem;font-style:italic;}
.topbar-actions{display:flex;gap:1rem;align-items:center;}
.topbar-actions a{font-size:.78rem;color:rgba(255,255,255,.6);text-decoration:none;letter-spacing:.05em;text-transform:uppercase;}
.topbar-actions a:hover{color:#fff;}
.page-wrap{max-width:820px;margin:0 auto;padding:2rem 1.5rem 6rem;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;}
.form-group{display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem;}
label{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);font-weight:500;}
input[type=text],input[type=password],input[type=number],input[type=date]{padding:9px 12px;font-size:.88rem;font-family:'Nunito',sans-serif;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--ink);outline:none;transition:border-color .15s,box-shadow .15s;}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-dim);}
.editor-wrap{border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;}
.editor-toolbar{background:#f7f4ef;border-bottom:1px solid var(--border);padding:6px 10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;}
.toolbar-btn{padding:5px 10px;font-size:.8rem;font-family:'Nunito',sans-serif;font-weight:500;background:transparent;border:1px solid transparent;border-radius:5px;cursor:pointer;color:var(--ink);transition:background .12s,border-color .12s;line-height:1;}
.toolbar-btn:hover{background:#ede8e0;border-color:var(--border);}
.toolbar-btn.active{background:var(--accent);color:#fff;border-color:var(--accent);}
.toolbar-sep{width:1px;height:20px;background:var(--border);margin:0 4px;}
.editor-area{min-height:220px;padding:1.25rem 1.5rem;font-family:'Lora',serif;font-size:1rem;line-height:1.9;color:var(--ink);outline:none;overflow-y:auto;}
.editor-area:empty::before{content:attr(data-placeholder);color:var(--faint);pointer-events:none;}
.editor-area p{margin-bottom:1em;}
.section-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:1.5rem;margin-bottom:1.25rem;}
.section-title{font-size:.72rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:1.1rem;display:flex;align-items:center;gap:8px;}
.toggle-row{display:flex;align-items:center;gap:12px;padding:.75rem 0;border-top:1px solid var(--border);margin-top:.5rem;}
.toggle-label{font-size:.85rem;color:var(--ink);flex:1;}
.toggle-sub{font-size:.75rem;color:var(--muted);}
.toggle{position:relative;width:40px;height:22px;flex-shrink:0;}
.toggle input{opacity:0;width:0;height:0;}
.toggle-slider{position:absolute;inset:0;background:#d0c8be;border-radius:22px;cursor:pointer;transition:background .2s;}
.toggle-slider::before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:transform .2s;}
.toggle input:checked+.toggle-slider{background:var(--accent);}
.toggle input:checked+.toggle-slider::before{transform:translateX(18px);}
.save-bar{position:fixed;bottom:0;left:0;right:0;background:var(--ink);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;z-index:20;}
.save-bar-status{font-size:.8rem;color:rgba(255,255,255,.55);}
.save-bar-actions{display:flex;gap:8px;}
.toast{position:fixed;bottom:5rem;left:50%;transform:translateX(-50%) translateY(8px);background:#2a5a3a;color:#fff;padding:.65rem 1.5rem;border-radius:8px;font-size:.82rem;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:999;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
@media(max-width:580px){.form-row{grid-template-columns:1fr;}}
</style></head><body>
<div class="topbar">
  <span class="topbar-brand">Chapter Editor</span>
  <div class="topbar-actions"><a href="/${slug}">← Dashboard</a></div>
</div>
<div class="page-wrap">
  <div class="section-card">
    <p class="section-title">📋 Chapter Info</p>
    <div class="form-row">
      <div class="form-group"><label>Chapter Number</label><input type="number" id="ch-number" min="1" value="1"/></div>
      <div class="form-group"><label>Date</label><input type="date" id="ch-date"/></div>
    </div>
    <div class="form-group"><label>Chapter Title</label><input type="text" id="ch-title" placeholder="e.g. Arrival"/></div>
    <div class="form-group"><label>Subtitle (optional)</label><input type="text" id="ch-subtitle" placeholder="e.g. in which nothing goes right"/></div>
    <div class="form-group"><label>Word Count (optional)</label><input type="text" id="ch-wordcount" placeholder="e.g. ~1,200 words"/></div>
  </div>

  <div class="section-card">
    <p class="section-title">✏️ Author's Note <span style="color:var(--faint);font-weight:300;text-transform:none;letter-spacing:0;">(optional)</span></p>
    <div class="editor-wrap">
      <div class="editor-toolbar" id="toolbar-note">
        <button class="toolbar-btn" data-cmd="bold" data-target="note"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic" data-target="note"><i>I</i></button>
        <div class="toolbar-sep"></div>
        <button class="toolbar-btn" data-cmd="insertscenebreak" data-target="note">— ✦ —</button>
      </div>
      <div class="editor-area" id="editor-note" contenteditable="true" data-placeholder="Write your author's note here. Include the passcode hint here!"></div>
    </div>
  </div>

  <div class="section-card">
    <p class="section-title">📖 Story Content <span style="color:var(--faint);font-weight:300;text-transform:none;letter-spacing:0;">(visible to everyone)</span></p>
    <div class="editor-wrap">
      <div class="editor-toolbar" id="toolbar-free">
        <button class="toolbar-btn" data-cmd="bold" data-target="free"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic" data-target="free"><i>I</i></button>
        <div class="toolbar-sep"></div>
        <button class="toolbar-btn" data-cmd="insertscenebreak" data-target="free">— ✦ —</button>
        <button class="toolbar-btn" data-cmd="insertparagraph" data-target="free">¶ New para</button>
      </div>
      <div class="editor-area" id="editor-free" contenteditable="true" data-placeholder="Write the free (public) part of your chapter here…"></div>
    </div>
  </div>

  <div class="section-card">
    <p class="section-title">🔒 Passcode Gate <span style="color:var(--faint);font-weight:300;text-transform:none;letter-spacing:0;">(optional — leave blank for free chapter)</span></p>
    <div class="form-group"><label>Passcode</label><input type="text" id="ch-passcode" placeholder="Leave empty for no gate" autocomplete="off"/></div>
    <div class="form-group"><label>Hint shown to readers</label><input type="text" id="ch-hint" placeholder="e.g. check the author's note"/></div>
    <p class="section-title" style="margin-top:1.25rem;">🔐 Locked Content</p>
    <div class="editor-wrap">
      <div class="editor-toolbar" id="toolbar-locked">
        <button class="toolbar-btn" data-cmd="bold" data-target="locked"><b>B</b></button>
        <button class="toolbar-btn" data-cmd="italic" data-target="locked"><i>I</i></button>
        <div class="toolbar-sep"></div>
        <button class="toolbar-btn" data-cmd="insertscenebreak" data-target="locked">— ✦ —</button>
        <button class="toolbar-btn" data-cmd="insertparagraph" data-target="locked">¶ New para</button>
      </div>
      <div class="editor-area" id="editor-locked" contenteditable="true" data-placeholder="Age-restricted content shown only after correct passcode…"></div>
    </div>
  </div>

  <div class="section-card">
    <p class="section-title">🚀 Publishing</p>
    <div class="toggle-row">
      <div><div class="toggle-label">Published</div><div class="toggle-sub">Draft chapters are saved but not visible on the site.</div></div>
      <label class="toggle"><input type="checkbox" id="ch-published"/><span class="toggle-slider"></span></label>
    </div>
  </div>
  <div style="height:5rem;"></div>
</div>

<div class="save-bar">
  <span class="save-bar-status" id="save-status">Unsaved</span>
  <div class="save-bar-actions">
    <a class="btn btn-ghost" href="/${slug}" style="color:rgba(255,255,255,.6);border-color:rgba(255,255,255,.2);">Cancel</a>
    <button class="btn btn-primary" id="save-btn" onclick="save()">Save Chapter</button>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const SLUG="${slug}";
const CHAPTER_ID=${isEditing ? `"${chapterId}"` : "null"};
const isEditing=${isEditing};

document.getElementById("ch-date").value=new Date().toISOString().split("T")[0];

if(isEditing){
  fetch("/"+SLUG+"/api/chapters/"+CHAPTER_ID).then(r=>r.json()).then(ch=>{
    document.getElementById("ch-number").value=ch.number||"";
    document.getElementById("ch-title").value=ch.title||"";
    document.getElementById("ch-subtitle").value=ch.subtitle||"";
    document.getElementById("ch-wordcount").value=ch.wordCount||"";
    document.getElementById("ch-date").value=ch.date||"";
    document.getElementById("ch-passcode").value=ch.passcode||"";
    document.getElementById("ch-hint").value=ch.passcodeHint||"";
    document.getElementById("ch-published").checked=!!ch.published;
    document.getElementById("editor-note").innerHTML=ch.authorNote||"";
    document.getElementById("editor-free").innerHTML=ch.freeContent||"";
    document.getElementById("editor-locked").innerHTML=ch.lockedContent||"";
    document.getElementById("save-status").textContent="Loaded";
  });
}

document.querySelectorAll(".toolbar-btn").forEach(btn=>{
  btn.addEventListener("mousedown",e=>{
    e.preventDefault();
    const cmd=btn.dataset.cmd,target=btn.dataset.target;
    const editor=document.getElementById("editor-"+target);
    editor.focus();
    if(cmd==="bold")document.execCommand("bold");
    else if(cmd==="italic")document.execCommand("italic");
    else if(cmd==="insertscenebreak")document.execCommand("insertHTML",false,'<p style="text-align:center;color:#b0a89e;letter-spacing:.2em;margin:1.5em 0;">✦ ✦ ✦</p><p></p>');
    else if(cmd==="insertparagraph")document.execCommand("insertParagraph");
    updateToolbar(target);
  });
});

document.querySelectorAll(".editor-area").forEach(editor=>{
  ["keyup","mouseup"].forEach(ev=>editor.addEventListener(ev,()=>updateToolbar(editor.id.replace("editor-",""))));
});

function updateToolbar(target){
  const toolbar=document.getElementById("toolbar-"+target);
  if(!toolbar)return;
  toolbar.querySelectorAll("[data-cmd]").forEach(btn=>{
    if(btn.dataset.cmd==="bold")btn.classList.toggle("active",document.queryCommandState("bold"));
    else if(btn.dataset.cmd==="italic")btn.classList.toggle("active",document.queryCommandState("italic"));
  });
}

async function save(){
  const btn=document.getElementById("save-btn");
  btn.textContent="Saving…";btn.disabled=true;
  const body={
    number:document.getElementById("ch-number").value,
    title:document.getElementById("ch-title").value,
    subtitle:document.getElementById("ch-subtitle").value,
    wordCount:document.getElementById("ch-wordcount").value,
    date:document.getElementById("ch-date").value,
    passcode:document.getElementById("ch-passcode").value,
    passcodeHint:document.getElementById("ch-hint").value,
    published:document.getElementById("ch-published").checked,
    authorNote:document.getElementById("editor-note").innerHTML,
    freeContent:document.getElementById("editor-free").innerHTML,
    lockedContent:document.getElementById("editor-locked").innerHTML,
  };
  try{
    let res,id=CHAPTER_ID;
    if(isEditing){
      res=await fetch("/"+SLUG+"/api/chapters/"+CHAPTER_ID,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    }else{
      res=await fetch("/"+SLUG+"/api/chapters",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await res.json();
      if(d.id){history.replaceState(null,"","/"+SLUG+"/editor/"+d.id);}
    }
    if(res.ok){showToast("✓ Saved");document.getElementById("save-status").textContent="Saved at "+new Date().toLocaleTimeString();}
    else showToast("Error saving");
  }catch(e){showToast("Network error");}
  btn.textContent="Save Chapter";btn.disabled=false;
}

function showToast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
window.addEventListener("beforeunload",e=>{e.preventDefault();e.returnValue="";});
</script></body></html>`;
}

exports.app = functions.https.onRequest(app);
