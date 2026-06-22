import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

// ── Utilities ─────────────────────────────────────────────────────────────────
let _seq = 0;
const uid = () => `u${++_seq}_${Math.random().toString(36).slice(2,5)}`;
const clone = x => JSON.parse(JSON.stringify(x));

const allIdsOf = phases =>
  phases.flatMap(ph => ph.items.flatMap(it => [it.id, ...(it.children||[]).map(c => c.id)]));

const makeChecks = phases =>
  Object.fromEntries(allIdsOf(phases).map(id => [id, false]));

const phaseProg = (ph, checks) => {
  const ids = ph.items.flatMap(it => [it.id, ...(it.children||[]).map(c => c.id)]);
  const done = ids.filter(id => checks[id]).length;
  return { done, total: ids.length, pct: ids.length ? Math.round(done / ids.length * 100) : 0 };
};

const deriveStatus = (checks, phases) => {
  if (!phases || !phases.length) return { label: "Development", color: "#2e7d32", bg: "#e8f4ea" };
  const ids = allIdsOf(phases);
  if (ids.length && ids.every(id => checks?.[id]))
    return { label: "Completed", color: "#6a1b9a", bg: "#f3e5f5" };
  for (const ph of [...phases].reverse()) {
    const pids = ph.items.flatMap(it => [it.id, ...(it.children||[]).map(c => c.id)]);
    if (pids.some(id => checks?.[id])) return { label: ph.label, color: ph.color, bg: ph.bg };
  }
  return { label: phases[0].label, color: phases[0].color, bg: phases[0].bg };
};

const clPct = proj => {
  const ids = allIdsOf(proj.clPhases || []);
  return ids.length ? Math.round(ids.filter(id => proj.checks?.[id]).length / ids.length * 100) : 0;
};

const initials = name => (name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
const avatarBg = str => {
  const colors = ["#2e7d32","#e65100","#ad1457","#3949ab","#00695c","#6a1b9a","#0277bd","#b05c2f"];
  let h = 0;
  for (const c of (str || "")) h = h * 31 + c.charCodeAt(0);
  return colors[Math.abs(h) % colors.length];
};
const normalizeUser = u => ({
  id: u.id,
  email: u.email,
  name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "User",
});

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) : "";
const fmtSize = b => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`;
const FILE_ICON = t => {
  if (!t) return "📎";
  if (t.startsWith("image/")) return "🖼️";
  if (t === "application/pdf") return "📄";
  if (t.includes("spreadsheet") || t.includes("excel")) return "📊";
  if (t.includes("word") || t.includes("document")) return "📝";
  if (t.startsWith("video/")) return "🎬";
  if (t.startsWith("audio/")) return "🎵";
  return "📎";
};

// ── Palette & Template ────────────────────────────────────────────────────────
const PALETTE = [
  {color:"#2e7d32",bg:"#e8f4ea"},{color:"#e65100",bg:"#fff3e0"},
  {color:"#ad1457",bg:"#fce4ec"},{color:"#3949ab",bg:"#e8eaf6"},
  {color:"#00695c",bg:"#e0f2f1"},{color:"#6a1b9a",bg:"#f3e5f5"},
  {color:"#0277bd",bg:"#e1f5fe"},{color:"#b05c2f",bg:"#fdf0e8"},
];

const DEFAULT_TEMPLATE = [
  { id:"ph_dev", label:"Development", color:"#2e7d32", bg:"#e8f4ea", items:[
    {id:"d1",label:"Create Project Folder",children:[]},
    {id:"d2",label:"Proposal (w/ Quote)",children:[{id:"d2a",label:"Sent"},{id:"d2b",label:"Approved"},{id:"d2c",label:"Stored"}]},
    {id:"d3",label:"Clarify Contract Signer (and Approver if necessary)",children:[]},
    {id:"d4",label:"Solidify Payment Method & Schedule",children:[]},
    {id:"d5",label:"Contract",children:[{id:"d5a",label:"Sent"},{id:"d5b",label:"Signed"},{id:"d5c",label:"Stored"}]},
    {id:"d6",label:"Clarify invoice recipients and cc's",children:[]},
    {id:"d7",label:"Send W9 and Direct Deposit info (if client doesn't have it)",children:[]},
    {id:"d8",label:"First Invoice",children:[{id:"d8a",label:"Sent"},{id:"d8b",label:"Paid"},{id:"d8c",label:"Receipt Sent"}]},
  ]},
  { id:"ph_pre", label:"Pre-Production", color:"#e65100", bg:"#fff3e0", items:[
    {id:"pp1",label:"Research",children:[]},{id:"pp2",label:"Shadow",children:[]},
    {id:"pp3",label:"Location Scout",children:[]},{id:"pp4",label:"Scriptwriting",children:[]},
    {id:"pp5",label:"Storyboarding",children:[]},{id:"pp6",label:"Mood Boarding",children:[]},
    {id:"pp7",label:"Final Concept Meeting (if necessary)",children:[]},
    {id:"pp8",label:"Lock Locations",children:[]},{id:"pp9",label:"Lock Talent",children:[]},
    {id:"pp10",label:"Lock Shoot Dates & Times",children:[]},
    {id:"pp11",label:"Call Sheet",children:[]},{id:"pp12",label:"Shot List",children:[]},
    {id:"pp13",label:"Audio List",children:[]},{id:"pp14",label:"Lock any permits",children:[]},
    {id:"pp15",label:"Lock insurance",children:[]},
  ]},
  { id:"ph_prod", label:"Production", color:"#ad1457", bg:"#fce4ec", items:[
    {id:"pr1",label:"Gear Prep",children:[{id:"pr1a",label:"Clean camera and lens"},{id:"pr1b",label:"Charge batteries"},{id:"pr1c",label:"Pack"}]},
    {id:"pr2",label:"Get Rental Gear (if need be)",children:[{id:"pr2a",label:"Pack"}]},
    {id:"pr3",label:"Gear",children:[]},{id:"pr4",label:"Food and drink",children:[]},
    {id:"pr5",label:"Sanitation",children:[]},{id:"pr6",label:"Medical",children:[]},
    {id:"pr7",label:"Shoot",children:[]},{id:"pr8",label:"Wrap",children:[]},
    {id:"pr9",label:"Notify All of Wrap",children:[]},
  ]},
  { id:"ph_post", label:"Post-Production", color:"#3949ab", bg:"#e8eaf6", items:[
    {id:"po1",label:"Media Management",children:[
      {id:"po1a",label:"Dump Media Files"},{id:"po1b",label:"Organize Media Files"},
      {id:"po1c",label:"Create 1–3 Backups"},{id:"po1d",label:"Format Media Cards"}]},
    {id:"po2",label:"Edit",children:[{id:"po2a",label:"Create proxies (if need be)"},{id:"po2b",label:"Disable proxies before coloring phase"}]},
    {id:"po3",label:"Color",children:[{id:"po3a",label:"Correct"},{id:"po3b",label:"Grade"}]},
    {id:"po4",label:"Sound",children:[{id:"po4a",label:"Previewed"},{id:"po4b",label:"Approved"},{id:"po4c",label:"LUFs"}]},
    {id:"po5",label:"Other Deliverables",children:[{id:"po5a",label:"Approved"}]},
    {id:"po6",label:"Render",children:[]},{id:"po7",label:"Export",children:[]},
  ]},
  { id:"ph_del", label:"Delivery", color:"#00695c", bg:"#e0f2f1", items:[
    {id:"dl1",label:"Final Invoice",children:[{id:"dl1a",label:"Sent"},{id:"dl1b",label:"Paid"},{id:"dl1c",label:"Receipt Sent"}]},
    {id:"dl2",label:"Deliverables Package (with Thank You)",children:[{id:"dl2a",label:"Sent"},{id:"dl2b",label:"Downloaded (Client side)"}]},
  ]},
  { id:"ph_ref", label:"Reflection & Closing", color:"#6a1b9a", bg:"#f3e5f5", items:[
    {id:"rc1",label:"Meeting or Lunch (if lunch, treat the client)",children:[]},
    {id:"rc2",label:"Thank you gift",children:[]},
    {id:"rc3",label:"Notify all participants of project completion (include where they can watch / stay up to date)",children:[]},
  ]},
];

const RESOLUTIONS   = ["4K (3840×2160)","2K (2048×1556)","1080p (1920×1080)","2160p HDR","6K","8K","Custom"];
const FRAME_RATES   = ["23.976fps","24fps","25fps","29.97fps","30fps","48fps","60fps","120fps","Custom"];
const ASPECT_RATIOS = ["16:9","2.39:1","1.85:1","2.35:1","4:3","1.33:1","1:1","Custom"];
const COLOR_SPACES  = ["Rec.709","Rec.2020","P3 D65","ACES","S-Log3","Log-C","Custom"];

const PROPOSAL_SECTIONS = [
  {key:"overview",label:"Project Overview"},{key:"timeline",label:"Timeline"},
  {key:"budget",label:"Budget & Financials"},{key:"deliverables",label:"Deliverables"},
  {key:"team",label:"Creative Team"},{key:"notes",label:"Additional Notes"},
];

const emptyDeliverable = () => ({
  id: uid(), name:"", format:"", resolution:"4K (3840×2160)", frameRate:"24fps",
  aspectRatio:"16:9", colorSpace:"Rec.709", runtime:"", deliveryFormats:[], notes:"", expanded:true,
});

const emptyProject = (tpl, user) => ({
  id: uid(),
  ownerId: user ? user.id : "",
  ownerName: user ? user.name : "",
  ownerEmail: user ? user.email : "",
  collaborators: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  title:"", client:"", preparedBy: user ? user.name : "", logline:"",
  projectType:"animation", genre:"",
  startDate:"", deliveryDate:"", timelinePhases:"",
  budgetTotal:"", currency:"USD", paymentSchedule:"", notes_budget:"",
  deliverables:[],
  director:"", producer:"", writer:"", dop:"", editor:"", vfxLead:"", customTeam:"",
  notes_general:"",
  clPhases: clone(tpl),
  checks: makeChecks(tpl),
  files: [],
  links: [],
});

// ── Proposal HTML builder (no nested template literals) ────────────────────────
function buildProposalHtml(project, selected, status) {
  const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const row = (label, value, preWrap) =>
    value ? '<div class="row"><span class="lbl">' + esc(label) + '</span><span class="val"' +
      (preWrap ? ' style="white-space:pre-line"' : '') + '>' + esc(value) + '</span></div>' : '';

  const css = [
    "@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500&display=swap');",
    "body{font-family:'DM Sans',sans-serif;color:#1a1a1a;background:#faf9f7;margin:0}",
    ".cover{background:#0d0d0d;color:#f5f2ec;padding:60px 60px 50px}",
    ".cover .ey{color:#c8b89a;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:14px}",
    ".cover h1{font-family:'DM Serif Display',serif;font-size:40px;font-weight:400;margin-bottom:8px}",
    ".cover .meta{margin-top:24px;font-size:12px;color:#888}",
    ".body{padding:50px 60px;max-width:800px;margin:0 auto}",
    ".sec{margin-bottom:44px}",
    ".sec h2{font-family:'DM Serif Display',serif;font-size:20px;color:#b05c2f;font-weight:400;border-bottom:1px solid #e0d9cf;padding-bottom:8px;margin-bottom:20px}",
    ".row{display:flex;margin-bottom:10px}",
    ".lbl{width:180px;flex-shrink:0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#7a6e61;padding-top:2px}",
    ".val{font-size:14px;line-height:1.7}",
    ".logline{font-size:15px;line-height:1.8;color:#333;font-style:italic;padding:16px 0}",
    ".di{border:1px solid #e0d9cf;border-radius:8px;padding:20px 24px;margin-bottom:14px}",
    ".dn{font-family:'DM Serif Display',serif;font-size:17px;font-weight:400;margin-bottom:14px}",
    ".ds{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 20px}",
    ".sp .sl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#7a6e61;margin-bottom:3px}",
    ".sp .sv{font-size:13px}",
    ".footer{margin-top:60px;padding-top:20px;border-top:1px solid #e0d9cf;font-size:11px;color:#aaa;letter-spacing:.05em;text-transform:uppercase}",
    "@media print{body{background:white}}",
  ].join("");

  const dateStr = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
  const typeLabel = project.projectType
    ? project.projectType.charAt(0).toUpperCase() + project.projectType.slice(1).replace("_"," ")
    : "";

  let body = "";

  if (selected.overview) {
    body += '<div class="sec"><h2>Project Overview</h2>';
    body += row("Client", project.client);
    body += row("Type", typeLabel);
    body += row("Genre / Style", project.genre);
    body += row("Status", status ? status.label : "");
    if (project.logline) body += '<p class="logline">' + esc(project.logline) + '</p>';
    body += '</div>';
  }
  if (selected.timeline) {
    body += '<div class="sec"><h2>Timeline</h2>';
    body += row("Start Date", project.startDate);
    body += row("Delivery Date", project.deliveryDate);
    body += row("Phases", project.timelinePhases, true);
    body += '</div>';
  }
  if (selected.budget) {
    body += '<div class="sec"><h2>Budget &amp; Financials</h2>';
    body += row("Total Budget", project.budgetTotal ? (project.currency + " " + project.budgetTotal) : "");
    body += row("Payment Schedule", project.paymentSchedule, true);
    body += row("Notes", project.notes_budget);
    body += '</div>';
  }
  if (selected.deliverables && project.deliverables && project.deliverables.length > 0) {
    body += '<div class="sec"><h2>Deliverables &amp; Technical Specs</h2>';
    project.deliverables.forEach((d, i) => {
      body += '<div class="di"><div class="dn">' + (i+1) + ". " + esc(d.name || "Untitled") + '</div><div class="ds">';
      if (d.runtime) body += '<div class="sp"><div class="sl">Runtime</div><div class="sv">' + esc(d.runtime) + '</div></div>';
      if (d.format) body += '<div class="sp"><div class="sl">Format</div><div class="sv">' + esc(d.format) + '</div></div>';
      if (d.resolution) body += '<div class="sp"><div class="sl">Resolution</div><div class="sv">' + esc(d.resolution) + '</div></div>';
      if (d.frameRate) body += '<div class="sp"><div class="sl">Frame Rate</div><div class="sv">' + esc(d.frameRate) + '</div></div>';
      if (d.aspectRatio) body += '<div class="sp"><div class="sl">Aspect Ratio</div><div class="sv">' + esc(d.aspectRatio) + '</div></div>';
      if (d.colorSpace) body += '<div class="sp"><div class="sl">Color Space</div><div class="sv">' + esc(d.colorSpace) + '</div></div>';
      body += '</div>';
      if (d.deliveryFormats && d.deliveryFormats.length > 0)
        body += '<p style="margin-top:12px;font-size:12px;color:#7a6e61">Additional formats: ' + d.deliveryFormats.map(esc).join(" · ") + '</p>';
      if (d.notes) body += '<p style="margin-top:8px;font-size:13px;color:#555;font-style:italic">' + esc(d.notes) + '</p>';
      body += '</div>';
    });
    body += '</div>';
  }
  if (selected.team) {
    const roles = [["Director",project.director],["Producer",project.producer],["Writer",project.writer],
                   ["DOP",project.dop],["Editor",project.editor],["VFX Lead",project.vfxLead]].filter(([,v])=>v);
    if (roles.length || project.customTeam) {
      body += '<div class="sec"><h2>Creative Team</h2>';
      roles.forEach(([k,v]) => { body += row(k, v); });
      body += row("Additional", project.customTeam, true);
      body += '</div>';
    }
  }
  if (selected.notes && project.notes_general) {
    body += '<div class="sec"><h2>Additional Notes</h2><p style="font-size:14px;line-height:1.8;white-space:pre-line">' + esc(project.notes_general) + '</p></div>';
  }
  body += '<div class="footer">Confidential · For Discussion Purposes Only</div>';

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(project.title || "Proposal") + '</title>' +
    '<style>' + css + '</style></head><body>' +
    '<div class="cover">' +
    '<div class="ey">' + esc(project.client || "Studio") + ' · Project Proposal</div>' +
    '<h1>' + esc(project.title || "Untitled Project") + '</h1>' +
    '<div class="meta">Prepared by ' + esc(project.preparedBy || "Studio") + ' &nbsp;·&nbsp; ' + dateStr + '</div>' +
    '</div>' +
    '<div class="body">' + body + '</div>' +
    '</body></html>'
  );
}

// ── Confirm Dialog (replaces window.confirm) ──────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position:"fixed",inset:0,background:"rgba(13,13,13,.5)",backdropFilter:"blur(4px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,
    }}>
      <div style={{
        background:"var(--white)",borderRadius:14,padding:32,width:"min(400px,90vw)",
        boxShadow:"0 24px 60px rgba(0,0,0,.2)",
      }}>
        <p style={{fontSize:14,color:"var(--ink)",lineHeight:1.6,marginBottom:24}}>{message}</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const FontStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --ink:#0d0d0d;--paper:#f5f2ec;--cream:#ede9e0;--warm:#c8b89a;
      --accent:#b05c2f;--soft:#7a6e61;--white:#faf9f7;--border:rgba(0,0,0,0.12);
      --serif:'DM Serif Display',Georgia,serif;--sans:'DM Sans',system-ui,sans-serif;
    }
    body{background:var(--paper);color:var(--ink);font-family:var(--sans)}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-track{background:var(--cream)}
    ::-webkit-scrollbar-thumb{background:var(--warm);border-radius:3px}
    input,textarea,select{
      font-family:var(--sans);font-size:13px;background:var(--white);
      border:1px solid var(--border);border-radius:6px;padding:9px 12px;
      color:var(--ink);width:100%;outline:none;
      transition:border-color .2s,box-shadow .2s;resize:vertical;
    }
    input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(176,92,47,.1)}
    input::placeholder,textarea::placeholder{color:#bbb}
    .pill{display:inline-flex;align-items:center;gap:5px;background:var(--cream);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 12px;font-size:12px;color:var(--soft)}
    .pill button{background:none;border:none;cursor:pointer;color:var(--soft);font-size:14px;line-height:1;padding:0}
    .pill button:hover{color:var(--accent)}
    .overlay{position:fixed;inset:0;background:rgba(13,13,13,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .2s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:var(--white);border-radius:16px;width:min(700px,95vw);max-height:90vh;overflow-y:auto;padding:40px;box-shadow:0 32px 80px rgba(0,0,0,.22);animation:slideUp .25s ease}
    .modal-wide{width:min(820px,95vw)}
    @keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
    .btn{font-family:var(--sans);font-size:13px;font-weight:500;padding:10px 22px;border-radius:8px;cursor:pointer;border:none;transition:all .15s;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
    .btn:disabled{opacity:.5;cursor:default}
    .btn-primary{background:var(--accent);color:#fff}.btn-primary:not(:disabled):hover{background:#943e16}
    .btn-ghost{background:var(--cream);color:var(--ink);border:1px solid var(--border)}.btn-ghost:hover{background:var(--warm)}
    .btn-outline{background:transparent;color:var(--accent);border:1.5px solid var(--accent)}.btn-outline:hover{background:var(--accent);color:#fff}
    .btn-danger{background:#fdecea;color:#c62828;border:1px solid #f5c6c2}.btn-danger:hover{background:#f5c6c2}
    .card{background:var(--white);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:20px}
    pre.pdf-preview{background:#1a1a1a;color:#d4c4a8;font-family:'Courier New',monospace;font-size:11px;padding:20px;border-radius:8px;overflow:auto;max-height:280px;white-space:pre-wrap;word-break:break-word;margin-top:16px}
    .del-card{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px}
    .del-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--cream);cursor:pointer;user-select:none}
    .del-body{padding:20px;background:var(--white);border-top:1px solid var(--border)}
    .ph-block{margin-bottom:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden}
    .ph-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;cursor:pointer;user-select:none}
    .cl-parent{display:flex;align-items:center;gap:10px;padding:10px 20px;transition:background .12s;cursor:pointer}
    .cl-parent:hover{background:var(--cream)}
    .cl-parent input[type=checkbox]{width:16px;height:16px;flex-shrink:0;accent-color:var(--accent);cursor:pointer}
    .cl-child{display:flex;align-items:center;gap:10px;padding:8px 20px 8px 50px;transition:background .12s;cursor:pointer}
    .cl-child:hover{background:var(--cream)}
    .cl-child input[type=checkbox]{width:14px;height:14px;flex-shrink:0;accent-color:var(--warm);cursor:pointer}
    .prog-track{height:4px;background:rgba(0,0,0,.1);border-radius:2px;overflow:hidden;width:72px}
    .prog-fill{height:100%;border-radius:2px;transition:width .4s ease}
    .edit-item-row{display:flex;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid var(--cream)}
    .edit-child-row{display:flex;align-items:center;gap:6px;padding:5px 14px 5px 38px;border-bottom:1px solid var(--cream)}
    .ph-label-input{font-weight:600;font-size:14px;background:transparent;border:none;border-bottom:2px solid rgba(0,0,0,.15);border-radius:0;padding:2px 4px;outline:none;box-shadow:none !important;flex:1;min-width:100px}
    .drop-zone{border:2px dashed var(--border);border-radius:12px;padding:36px 20px;text-align:center;cursor:pointer;transition:all .2s;background:var(--white)}
    .drop-zone:hover,.drop-zone.over{border-color:var(--accent);background:rgba(176,92,47,.04)}
    .file-row,.link-row{display:flex;align-items:center;gap:12px;padding:13px 16px;transition:background .12s}
    .file-row:hover,.link-row:hover{background:var(--cream)}
    .pcheck-row{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:8px;cursor:pointer;transition:background .15s}
    .pcheck-row:hover{background:var(--cream)}
    .pcheck-row input[type=checkbox]{width:16px;height:16px;flex-shrink:0;accent-color:var(--accent);cursor:pointer;margin-top:2px}
    /* Auth */
    .auth-bg{min-height:100vh;background:#0e0c0a;display:flex;align-items:center;justify-content:center;padding:24px}
    .auth-card{background:var(--white);border-radius:20px;padding:44px;width:min(440px,100%);box-shadow:0 40px 100px rgba(0,0,0,.5)}
    .social-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;border:1.5px solid var(--border);background:var(--white);font-family:var(--sans);transition:all .15s;margin-bottom:10px}
    .social-btn:hover{border-color:var(--accent);background:var(--cream)}
    .divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--soft);font-size:12px}
    .divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border)}
    /* Home */
    .proj-card{background:var(--white);border:1px solid var(--border);border-radius:14px;padding:24px;transition:box-shadow .2s,transform .15s;position:relative}
    .proj-card:hover{box-shadow:0 8px 28px rgba(0,0,0,.1);transform:translateY(-2px)}
    .proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
  `}</style>
);

// ── Shared components ─────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block",fontSize:11,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:"var(--soft)",marginBottom:6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display:"flex",gap:8,marginBottom:8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); add(); }}}
          placeholder={placeholder || "Type and press Enter"} />
        <button className="btn btn-ghost" onClick={add} style={{ padding:"9px 14px",fontSize:12 }}>+ Add</button>
      </div>
      <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
        {value.map((v,i) => (
          <span key={i} className="pill">{v}
            <button onClick={() => onChange(value.filter((_,j) => j!==i))}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, email, size=32 }) {
  const bg = avatarBg(email || name || "");
  return (
    <div style={{ width:size,height:size,borderRadius:"50%",background:bg,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:700,flexShrink:0,fontFamily:"var(--sans)" }}>
      {initials(name || email || "?")}
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [provider, setProvider] = useState(null);
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ name:"", email:"", password:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const sf = (k, v) => setForm(f => ({ ...f, [k]:v }));

  const handleOAuth = async p => {
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: p,
      options: { redirectTo: window.location.origin },
    });
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleEmailSubmit = async isSignUp => {
    const email = form.email.trim().toLowerCase();
    const password = form.password.trim();
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    if (!password) { setError("Please enter a password."); return; }
    if (isSignUp && !form.name.trim()) { setError("Please enter your name."); return; }
    setLoading(true); setError("");
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: form.name.trim() } },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data.user) onLogin(data.user);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data.user) onLogin(data.user);
      }
    } catch(e) {
      setError("Something went wrong. Please try again."); setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div style={{ textAlign:"center",marginBottom:32 }}>
          <div style={{ fontFamily:"var(--serif)",fontSize:28,marginBottom:8 }}>✦ Studio Pipeline</div>
          <p style={{ fontSize:13,color:"var(--soft)" }}>Your complete film & animation production hub.</p>
        </div>

        {!provider ? (
          <>
            <p style={{ fontSize:12,fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)",marginBottom:16,textAlign:"center" }}>Sign in to continue</p>
            {["google","apple"].map(p => (
              <button key={p} className="social-btn" onClick={() => handleOAuth(p)} disabled={loading}>
                <span style={{ width:22,height:22,borderRadius:"50%",background:p==="google"?"#ea4335":"#000",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0 }}>
                  {p==="google" ? "G" : ""}
                </span>
                Continue with {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
            <div className="divider">or</div>
            <button className="social-btn" onClick={() => setProvider("email")} style={{ borderColor:"var(--accent)",color:"var(--accent)" }}>
              ✉ Continue with Email
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setProvider(null); setError(""); setMode("signin"); }}
              style={{ background:"none",border:"none",cursor:"pointer",color:"var(--soft)",fontSize:13,marginBottom:20,display:"flex",alignItems:"center",gap:6 }}>
              ← Back
            </button>
            {mode === "signup" && (
              <Field label="Full Name">
                <input value={form.name} onChange={e => sf("name",e.target.value)} placeholder="Jane Doe" autoFocus />
              </Field>
            )}
            <Field label="Email Address">
              <input type="email" value={form.email} onChange={e => sf("email",e.target.value)}
                placeholder="you@example.com" autoFocus={mode === "signin"} />
            </Field>
            <Field label="Password">
              <input type="password" value={form.password} onChange={e => sf("password",e.target.value)}
                placeholder="••••••••" onKeyDown={e => { if(e.key==="Enter") handleEmailSubmit(mode==="signup"); }} />
            </Field>
            {error && (
              <div style={{ padding:"10px 14px",background:"#fdecea",border:"1px solid #f5c6c2",borderRadius:8,fontSize:12,color:"#c62828",marginBottom:14 }}>
                {error}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => handleEmailSubmit(mode==="signup")} disabled={loading}
              style={{ width:"100%",justifyContent:"center",padding:"13px",marginBottom:12 }}>
              {loading ? "Signing in…" : mode==="signup" ? "Create Account →" : "Sign In →"}
            </button>
            <p style={{ fontSize:12,color:"var(--soft)",textAlign:"center" }}>
              {mode === "signin" ? (
                <>No account?{" "}
                  <button onClick={() => { setMode("signup"); setError(""); }} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:12,fontWeight:600,padding:0 }}>Create one</button>
                </>
              ) : (
                <>Already have an account?{" "}
                  <button onClick={() => { setMode("signin"); setError(""); }} style={{ background:"none",border:"none",cursor:"pointer",color:"var(--accent)",fontSize:12,fontWeight:600,padding:0 }}>Sign in</button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Loading Screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0e0c0a" }}>
      <div style={{ textAlign:"center",color:"#f5f2ec" }}>
        <div style={{ fontFamily:"var(--serif)",fontSize:30,marginBottom:8 }}>✦ Studio Pipeline</div>
        <div style={{ fontSize:13,color:"#7a6e61" }}>Loading…</div>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onCreate, onClose }) {
  const [form, setForm] = useState({ title:"", client:"", type:"animation" });
  const sf = (k,v) => setForm(f => ({ ...f, [k]:v }));
  return (
    <div className="overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:"min(480px,95vw)" }}>
        <div style={{ marginBottom:24 }}>
          <p style={{ fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"var(--soft)",marginBottom:4 }}>New Project</p>
          <h2 style={{ fontFamily:"var(--serif)",fontSize:26,fontWeight:400 }}>Create a Project</h2>
        </div>
        <Field label="Project Title *">
          <input value={form.title} onChange={e => sf("title",e.target.value)} placeholder="e.g. Neon Requiem"
            autoFocus onKeyDown={e => { if(e.key==="Enter" && form.title.trim()) onCreate(form); }} />
        </Field>
        <Field label="Client / Studio">
          <input value={form.client} onChange={e => sf("client",e.target.value)} placeholder="e.g. Apex Films" />
        </Field>
        <Field label="Project Type">
          <select value={form.type} onChange={e => sf("type",e.target.value)}>
            {[["animation","Animation"],["live_action","Live Action"],["vfx","VFX"],
              ["documentary","Documentary"],["short_film","Short Film"],["series","Series"],
              ["commercial","Commercial"],["music_video","Music Video"],["mixed","Mixed Media"]]
              .map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onCreate(form)} disabled={!form.title.trim()}>
            Create Project →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, currentUser, onOpen, onDelete, onDuplicate, onShare }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const status = deriveStatus(project.checks, project.clPhases);
  const pct = clPct(project);
  const isOwner = project.ownerId === currentUser.id;
  const collabs = project.collaborators || [];

  useEffect(() => {
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="proj-card">
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
        <span style={{ display:"inline-block",fontSize:10,fontWeight:700,letterSpacing:".05em",padding:"3px 9px",borderRadius:20,textTransform:"uppercase",background:status.bg,color:status.color }}>
          {status.label}
        </span>
        <div ref={menuRef} style={{ position:"relative" }}>
          <button onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
            style={{ background:"none",border:"none",cursor:"pointer",color:"var(--soft)",fontSize:18,padding:"0 4px",lineHeight:1 }}>⋯</button>
          {menuOpen && (
            <div style={{ position:"absolute",right:0,top:"100%",background:"var(--white)",border:"1px solid var(--border)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:50,minWidth:160,padding:"6px 0" }}>
              {[["↗ Open Project", onOpen],["👥 Share", onShare],["⎘ Duplicate", onDuplicate]].map(([label, fn]) => (
                <button key={label} onClick={() => { fn(); setMenuOpen(false); }}
                  style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 16px",background:"none",border:"none",cursor:"pointer",fontSize:13,color:"var(--ink)",fontFamily:"var(--sans)" }}
                  onMouseEnter={e => e.currentTarget.style.background="var(--cream)"}
                  onMouseLeave={e => e.currentTarget.style.background="none"}>
                  {label}
                </button>
              ))}
              {isOwner && (
                <>
                  <div style={{ height:1,background:"var(--border)",margin:"4px 0" }} />
                  <button onClick={() => { onDelete(); setMenuOpen(false); }}
                    style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 16px",background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#c62828",fontFamily:"var(--sans)" }}
                    onMouseEnter={e => e.currentTarget.style.background="#fdecea"}
                    onMouseLeave={e => e.currentTarget.style.background="none"}>
                    🗑 Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div onClick={onOpen} style={{ cursor:"pointer" }}>
        <h3 style={{ fontFamily:"var(--serif)",fontSize:20,fontWeight:400,marginBottom:4,lineHeight:1.2 }}>
          {project.title || "Untitled Project"}
        </h3>
        <p style={{ fontSize:12,color:"var(--soft)",marginBottom:14 }}>
          {[project.client, project.projectType?.replace("_"," ")].filter(Boolean).join(" · ") || "No client set"}
        </p>
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
            <span style={{ fontSize:10,fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",color:"var(--soft)" }}>Checklist</span>
            <span style={{ fontSize:10,color:"var(--soft)",fontWeight:600 }}>{pct}%</span>
          </div>
          <div style={{ height:4,background:"var(--cream)",borderRadius:2,overflow:"hidden" }}>
            <div style={{ height:"100%",width:`${pct}%`,background:pct===100?"#6a1b9a":"var(--accent)",borderRadius:2,transition:"width .4s" }} />
          </div>
        </div>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ display:"flex",alignItems:"center" }}>
              {[{name:project.ownerName||"Owner",email:project.ownerEmail||""},...collabs.slice(0,2)].map((c,i) => (
                <div key={i} style={{ marginLeft:i>0?-8:0,border:"2px solid var(--white)",borderRadius:"50%" }}>
                  <Avatar name={c.name||c.email} email={c.email} size={24} />
                </div>
              ))}
              {collabs.length > 2 && <span style={{ fontSize:10,color:"var(--soft)",marginLeft:4 }}>+{collabs.length-2}</span>}
            </div>
            {project.deliveryDate && <span style={{ fontSize:11,color:"var(--soft)" }}>🗓 {fmtDate(project.deliveryDate)}</span>}
          </div>
          <span style={{ fontSize:11,color:"var(--accent)",fontWeight:600 }}>Open →</span>
        </div>
      </div>
    </div>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
function HomeScreen({ user, projects, onOpenProject, onNewProject, onDeleteProject, onDuplicateProject, onUpdateProject, onLogout }) {
  const [showNew, setShowNew] = useState(false);
  const [shareProject, setShareProject] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState("");

  const mine = projects.filter(p =>
    p.ownerId === user.id || (p.collaborators||[]).some(c => c.email.toLowerCase() === user.email.toLowerCase())
  );
  const filtered = mine.filter(p =>
    (p.title||"").toLowerCase().includes(search.toLowerCase()) ||
    (p.client||"").toLowerCase().includes(search.toLowerCase())
  );
  const open = filtered.filter(p => deriveStatus(p.checks, p.clPhases).label !== "Completed");
  const completed = filtered.filter(p => deriveStatus(p.checks, p.clPhases).label === "Completed");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <FontStyle />
      {showNew && <NewProjectModal onCreate={meta => { onNewProject(meta); setShowNew(false); }} onClose={() => setShowNew(false)} />}
      {shareProject && <ShareModal project={shareProject} onUpdate={p => { onUpdateProject(p); setShareProject(p); }} onClose={() => setShareProject(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          message="Delete this project? This cannot be undone."
          onConfirm={() => { onDeleteProject(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div style={{ minHeight:"100vh",background:"var(--paper)" }}>
        <header style={{ position:"sticky",top:0,zIndex:50,background:"rgba(245,242,236,.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",height:64 }}>
          <span style={{ fontFamily:"var(--serif)",fontSize:22 }}>✦ Studio Pipeline</span>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <Avatar name={user.name} email={user.email} size={34} />
            <div>
              <p style={{ fontSize:13,fontWeight:600,lineHeight:1.2 }}>{user.name}</p>
              <p style={{ fontSize:11,color:"var(--soft)" }}>{user.email}</p>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:12,padding:"7px 14px" }} onClick={onLogout}>Sign Out</button>
          </div>
        </header>

        <div style={{ maxWidth:1100,margin:"0 auto",padding:"40px 24px" }}>
          <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:32,flexWrap:"wrap",gap:16 }}>
            <div>
              <h1 style={{ fontFamily:"var(--serif)",fontSize:36,fontWeight:400,marginBottom:4 }}>{greeting}, {user.name.split(" ")[0]}.</h1>
              <p style={{ color:"var(--soft)",fontSize:14 }}>
                {mine.length === 0 ? "No projects yet — create your first one." : `${open.length} in progress · ${completed.length} completed`}
              </p>
            </div>
            <button className="btn btn-primary" style={{ fontSize:14,padding:"12px 24px" }} onClick={() => setShowNew(true)}>+ New Project</button>
          </div>

          {mine.length > 3 && (
            <div style={{ marginBottom:28 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…" style={{ maxWidth:320 }} />
            </div>
          )}

          {open.length > 0 && (
            <div style={{ marginBottom:40 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
                <h2 style={{ fontSize:13,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)" }}>In Progress</h2>
                <span style={{ fontSize:12,color:"var(--soft)",opacity:.6 }}>({open.length})</span>
              </div>
              <div className="proj-grid">
                {open.map(p => (
                  <ProjectCard key={p.id} project={p} currentUser={user}
                    onOpen={() => onOpenProject(p.id)}
                    onDelete={() => setConfirmDelete(p.id)}
                    onDuplicate={() => onDuplicateProject(p.id)}
                    onShare={() => setShareProject(p)}
                  />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div style={{ marginBottom:40 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
                <h2 style={{ fontSize:13,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)" }}>Completed</h2>
                <span style={{ fontSize:12,color:"var(--soft)",opacity:.6 }}>({completed.length})</span>
              </div>
              <div className="proj-grid">
                {completed.map(p => (
                  <ProjectCard key={p.id} project={p} currentUser={user}
                    onOpen={() => onOpenProject(p.id)}
                    onDelete={() => setConfirmDelete(p.id)}
                    onDuplicate={() => onDuplicateProject(p.id)}
                    onShare={() => setShareProject(p)}
                  />
                ))}
              </div>
            </div>
          )}

          {mine.length === 0 && (
            <div style={{ textAlign:"center",padding:"80px 20px",color:"var(--soft)" }}>
              <div style={{ fontSize:48,marginBottom:16 }}>🎬</div>
              <h3 style={{ fontFamily:"var(--serif)",fontSize:24,fontWeight:400,marginBottom:8 }}>No projects yet</h3>
              <p style={{ fontSize:14,marginBottom:24 }}>Create your first project to get started.</p>
              <button className="btn btn-primary" style={{ fontSize:14,padding:"12px 28px" }} onClick={() => setShowNew(true)}>
                + Create First Project
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareModal({ project, onUpdate, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [copied, setCopied] = useState(false);
  const collabs = project.collaborators || [];

  const addCollab = () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@") || collabs.some(c => c.email === e)) return;
    onUpdate({ ...project, collaborators: [...collabs, { id:uid(), email:e, name:e.split("@")[0], role, addedAt:new Date().toISOString() }] });
    setEmail("");
  };

  const removeCollab = id => onUpdate({ ...project, collaborators: collabs.filter(c => c.id !== id) });
  const changeRole = (id, r) => onUpdate({ ...project, collaborators: collabs.map(c => c.id===id ? { ...c, role:r } : c) });

  const copyLink = () => {
    const url = "https://studiopipeline.app/project/" + project.id;
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24 }}>
          <div>
            <p style={{ fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"var(--soft)",marginBottom:4 }}>Share Project</p>
            <h2 style={{ fontFamily:"var(--serif)",fontSize:22,fontWeight:400 }}>{project.title || "Untitled Project"}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding:"7px 14px" }}>✕</button>
        </div>

        <div style={{ background:"var(--cream)",borderRadius:10,padding:"14px 16px",marginBottom:20 }}>
          <p style={{ fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--soft)",marginBottom:10 }}>Owner</p>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <Avatar name={project.ownerName||"Owner"} email={project.ownerEmail||""} size={32} />
            <div>
              <p style={{ fontSize:13,fontWeight:500 }}>{project.ownerName || "You"}</p>
              <p style={{ fontSize:11,color:"var(--soft)" }}>{project.ownerEmail}</p>
            </div>
            <span style={{ marginLeft:"auto",fontSize:11,color:"var(--soft)",background:"var(--white)",border:"1px solid var(--border)",borderRadius:20,padding:"2px 10px" }}>Owner</span>
          </div>
        </div>

        {collabs.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <p style={{ fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--soft)",marginBottom:10 }}>Collaborators</p>
            <div style={{ border:"1px solid var(--border)",borderRadius:10,overflow:"hidden" }}>
              {collabs.map((c, i) => (
                <div key={c.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:i<collabs.length-1?"1px solid var(--cream)":"none" }}>
                  <Avatar name={c.name||c.email} email={c.email} size={32} />
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13,fontWeight:500 }}>{c.name || c.email}</p>
                    <p style={{ fontSize:11,color:"var(--soft)" }}>{c.email}</p>
                  </div>
                  <select value={c.role} onChange={e => changeRole(c.id, e.target.value)}
                    style={{ width:"auto",fontSize:11,padding:"4px 8px",border:"1px solid var(--border)",borderRadius:6 }}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="btn btn-danger" style={{ padding:"4px 10px",fontSize:11 }} onClick={() => removeCollab(c.id)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom:24 }}>
          <p style={{ fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--soft)",marginBottom:10 }}>Invite by Email</p>
          <div style={{ display:"flex",gap:8 }}>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@studio.com"
              onKeyDown={e => { if(e.key==="Enter") addCollab(); }} style={{ flex:1 }} />
            <select value={role} onChange={e => setRole(e.target.value)} style={{ width:"auto",fontSize:12,padding:"9px 10px" }}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn btn-primary" onClick={addCollab} disabled={!email.trim().includes("@")} style={{ padding:"9px 16px" }}>Invite</button>
          </div>
          <p style={{ fontSize:11,color:"var(--soft)",marginTop:8 }}>They'll be able to access this project when they sign in with this email.</p>
        </div>

        <div style={{ display:"flex",justifyContent:"space-between",paddingTop:16,borderTop:"1px solid var(--border)" }}>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={copyLink}>
            {copied ? "✓ Link Copied!" : "🔗 Copy Project Link"}
          </button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Deliverable Card ──────────────────────────────────────────────────────────
function DeliverableCard({ del, index, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...del, [k]:v });
  return (
    <div className="del-card">
      <div className="del-hdr" onClick={() => set("expanded", !del.expanded)}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ fontSize:12,fontWeight:700,color:"var(--soft)",background:"var(--warm)",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center" }}>{index+1}</span>
          <span style={{ fontSize:14,fontWeight:500,color:del.name?"var(--ink)":"var(--soft)" }}>{del.name || "Untitled Deliverable"}</span>
          {del.runtime && <span style={{ fontSize:11,color:"var(--soft)",background:"var(--cream)",border:"1px solid var(--border)",borderRadius:20,padding:"2px 8px" }}>{del.runtime}</span>}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <button className="btn btn-danger" style={{ padding:"4px 10px",fontSize:11 }} onClick={e => { e.stopPropagation(); onRemove(); }}>Remove</button>
          <span style={{ color:"var(--soft)",fontSize:16,transition:"transform .2s",transform:del.expanded?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
        </div>
      </div>
      {del.expanded && (
        <div className="del-body">
          <Field label="Deliverable Name">
            <input value={del.name} onChange={e => set("name",e.target.value)} placeholder="e.g. Final Feature Film – Theatrical, Trailer Cut, EPK" />
          </Field>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:16 }}>
            <Field label="Format"><input value={del.format} onChange={e => set("format",e.target.value)} placeholder="e.g. ProRes 4444, DCP" /></Field>
            <Field label="Resolution"><select value={del.resolution} onChange={e => set("resolution",e.target.value)}>{RESOLUTIONS.map(r=><option key={r}>{r}</option>)}</select></Field>
            <Field label="Frame Rate"><select value={del.frameRate} onChange={e => set("frameRate",e.target.value)}>{FRAME_RATES.map(r=><option key={r}>{r}</option>)}</select></Field>
            <Field label="Aspect Ratio"><select value={del.aspectRatio} onChange={e => set("aspectRatio",e.target.value)}>{ASPECT_RATIOS.map(r=><option key={r}>{r}</option>)}</select></Field>
            <Field label="Color Space"><select value={del.colorSpace} onChange={e => set("colorSpace",e.target.value)}>{COLOR_SPACES.map(r=><option key={r}>{r}</option>)}</select></Field>
            <Field label="Runtime"><input value={del.runtime} onChange={e => set("runtime",e.target.value)} placeholder="e.g. 1h 32m, 90 sec" /></Field>
          </div>
          <Field label="Additional File Formats / Versions">
            <TagInput value={del.deliveryFormats} onChange={v => set("deliveryFormats",v)} placeholder="e.g. H.264 web screener, Dolby Vision HDR…" />
          </Field>
          <Field label="Notes for this Deliverable">
            <textarea rows={2} value={del.notes} onChange={e => set("notes",e.target.value)} placeholder="Specific requirements, naming conventions, client notes…" />
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Phases Panel (Checklist View + Edit) ──────────────────────────────────────
function PhasesPanel({ phases, checks, onPhasesChange, onChecksChange, alwaysEdit=false }) {
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const isEdit = alwaysEdit || editing;

  const toggleItem = id => onChecksChange?.({ ...checks, [id]:!checks[id] });
  const toggleCol = id => setCollapsed(c => ({ ...c, [id]:!c[id] }));
  const checkAll = (ph, e) => {
    e.stopPropagation();
    const ids = allIdsOf([ph]);
    const allDone = ids.every(id => checks?.[id]);
    const nc = { ...checks };
    ids.forEach(id => { nc[id] = !allDone; });
    onChecksChange?.(nc);
  };

  const updPhLabel = (pid, v) => onPhasesChange(phases.map(ph => ph.id===pid ? { ...ph,label:v } : ph));
  const updPhColor = (pid, col) => onPhasesChange(phases.map(ph => ph.id===pid ? { ...ph,...col } : ph));
  const delPhase = pid => {
    const removed = allIdsOf([phases.find(p => p.id===pid)]);
    onPhasesChange(phases.filter(p => p.id!==pid));
    if (checks && onChecksChange) { const nc={...checks}; removed.forEach(id=>delete nc[id]); onChecksChange(nc); }
  };
  const addPhase = () => onPhasesChange([...phases, { id:uid(), label:"New Phase", ...PALETTE[phases.length%PALETTE.length], items:[] }]);

  const updItem = (pid, iid, v) => onPhasesChange(phases.map(ph => ph.id!==pid ? ph :
    { ...ph, items:ph.items.map(it => it.id!==iid ? it : { ...it,label:v }) }));
  const delItem = (pid, iid) => {
    const ph = phases.find(p=>p.id===pid);
    const it = ph.items.find(i=>i.id===iid);
    const removed = [iid,...(it.children||[]).map(c=>c.id)];
    onPhasesChange(phases.map(ph => ph.id!==pid ? ph : { ...ph,items:ph.items.filter(i=>i.id!==iid) }));
    if (checks && onChecksChange) { const nc={...checks}; removed.forEach(id=>delete nc[id]); onChecksChange(nc); }
  };
  const addItem = pid => {
    const ni = { id:uid(), label:"New Item", children:[] };
    onPhasesChange(phases.map(ph => ph.id!==pid ? ph : { ...ph,items:[...ph.items,ni] }));
    onChecksChange?.({ ...checks, [ni.id]:false });
  };
  const updChild = (pid, iid, cid, v) => onPhasesChange(phases.map(ph => ph.id!==pid ? ph :
    { ...ph, items:ph.items.map(it => it.id!==iid ? it :
      { ...it, children:(it.children||[]).map(c => c.id!==cid ? c : { ...c,label:v }) }) }));
  const delChild = (pid, iid, cid) => {
    onPhasesChange(phases.map(ph => ph.id!==pid ? ph :
      { ...ph, items:ph.items.map(it => it.id!==iid ? it :
        { ...it, children:(it.children||[]).filter(c => c.id!==cid) }) }));
    if (checks && onChecksChange) { const nc={...checks}; delete nc[cid]; onChecksChange(nc); }
  };
  const addChild = (pid, iid) => {
    const nc = { id:uid(), label:"New Sub-item" };
    onPhasesChange(phases.map(ph => ph.id!==pid ? ph :
      { ...ph, items:ph.items.map(it => it.id!==iid ? it :
        { ...it, children:[...(it.children||[]),nc] }) }));
    onChecksChange?.({ ...checks, [nc.id]:false });
  };

  const totalDone = checks ? allIdsOf(phases).filter(id=>checks[id]).length : 0;
  const totalCount = allIdsOf(phases).length;
  const pct = totalCount ? Math.round(totalDone/totalCount*100) : 0;

  return (
    <div>
      {!alwaysEdit && (
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8 }}>
            <div>
              <h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Project Checklist</h1>
              <p style={{ color:"var(--soft)",fontSize:13 }}>Track every stage from development to delivery.</p>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <span style={{ fontFamily:"var(--serif)",fontSize:22,color:"var(--accent)" }}>
                {totalDone}<span style={{ fontSize:14,color:"var(--soft)" }}>/{totalCount}</span>
              </span>
              <button className={`btn ${editing?"btn-primary":"btn-ghost"}`} style={{ fontSize:12 }} onClick={() => setEditing(e=>!e)}>
                {editing ? "✓ Done Editing" : "✏ Edit Checklist"}
              </button>
            </div>
          </div>
          {!editing && (
            <div style={{ height:6,background:"var(--cream)",borderRadius:3,overflow:"hidden",border:"1px solid var(--border)" }}>
              <div style={{ height:"100%",width:`${pct}%`,background:pct===100?"#6a1b9a":"var(--accent)",borderRadius:3,transition:"width .5s" }} />
            </div>
          )}
        </div>
      )}

      {phases.map(ph => {
        const prog = phaseProg(ph, checks || {});
        const isCol = !isEdit && collapsed[ph.id];
        return (
          <div key={ph.id} className="ph-block">
            {isEdit ? (
              <div style={{ display:"flex",alignItems:"center",gap:8,padding:"12px 16px",background:ph.bg,flexWrap:"wrap" }}>
                <div style={{ display:"flex",gap:4,flexShrink:0 }}>
                  {PALETTE.map((c,i) => (
                    <button key={i} onClick={() => updPhColor(ph.id,c)} style={{ width:16,height:16,borderRadius:"50%",background:c.color,padding:0,border:c.color===ph.color?"3px solid #fff":"2px solid transparent",cursor:"pointer",boxShadow:c.color===ph.color?`0 0 0 2px ${c.color}`:"none" }} />
                  ))}
                </div>
                <input className="ph-label-input" value={ph.label} onChange={e => updPhLabel(ph.id,e.target.value)} style={{ color:ph.color,borderBottomColor:`${ph.color}50` }} />
                <button className="btn btn-danger" style={{ padding:"4px 10px",fontSize:11,marginLeft:"auto" }} onClick={() => delPhase(ph.id)}>Delete Phase</button>
              </div>
            ) : (
              <div className="ph-hdr" style={{ background:ph.bg }} onClick={() => toggleCol(ph.id)}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <span style={{ fontSize:15,fontWeight:600,color:ph.color }}>{ph.label}</span>
                  <span style={{ fontSize:11,color:ph.color,opacity:.65,fontWeight:600 }}>{prog.done}/{prog.total}</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div className="prog-track"><div className="prog-fill" style={{ width:`${prog.pct}%`,background:ph.color,opacity:.65 }} /></div>
                  <button onClick={e => checkAll(ph,e)} style={{ fontSize:11,padding:"3px 10px",borderRadius:20,border:`1px solid ${ph.color}`,background:"transparent",color:ph.color,cursor:"pointer",fontFamily:"var(--sans)",fontWeight:500 }}>
                    {allIdsOf([ph]).every(id=>checks?.[id]) ? "Uncheck all" : "Check all"}
                  </button>
                  <span style={{ color:ph.color,fontSize:13,opacity:.7,transition:"transform .2s",display:"inline-block",transform:isCol?"rotate(-90deg)":"rotate(0deg)" }}>▾</span>
                </div>
              </div>
            )}

            {!isCol && (
              <div style={{ background:"var(--white)" }}>
                {ph.items.map(it => (
                  <div key={it.id}>
                    {isEdit ? (
                      <div className="edit-item-row">
                        <span style={{ color:"var(--warm)",fontSize:15,flexShrink:0 }}>◦</span>
                        <input value={it.label} onChange={e => updItem(ph.id,it.id,e.target.value)} style={{ flex:1 }} />
                        <button className="btn btn-ghost" style={{ padding:"3px 8px",fontSize:11,flexShrink:0 }} onClick={() => addChild(ph.id,it.id)}>+ Sub</button>
                        <button className="btn btn-danger" style={{ padding:"3px 8px",fontSize:11,flexShrink:0 }} onClick={() => delItem(ph.id,it.id)}>🗑</button>
                      </div>
                    ) : (
                      <label className="cl-parent">
                        <input type="checkbox" checked={!!checks?.[it.id]} onChange={() => toggleItem(it.id)} />
                        <span style={{ fontSize:13.5,fontWeight:500,flex:1,color:checks?.[it.id]?"var(--soft)":"var(--ink)",textDecoration:checks?.[it.id]?"line-through":"none" }}>
                          {it.label}
                        </span>
                      </label>
                    )}
                    {(it.children||[]).map(ch => isEdit ? (
                      <div key={ch.id} className="edit-child-row">
                        <span style={{ color:"#bbb",fontSize:13,flexShrink:0 }}>└</span>
                        <input value={ch.label} onChange={e => updChild(ph.id,it.id,ch.id,e.target.value)} style={{ flex:1,fontSize:12 }} />
                        <button className="btn btn-danger" style={{ padding:"3px 8px",fontSize:11,flexShrink:0 }} onClick={() => delChild(ph.id,it.id,ch.id)}>🗑</button>
                      </div>
                    ) : (
                      <label key={ch.id} className="cl-child">
                        <input type="checkbox" checked={!!checks?.[ch.id]} onChange={() => toggleItem(ch.id)} />
                        <span style={{ fontSize:12.5,flex:1,color:checks?.[ch.id]?"#bbb":"var(--soft)",textDecoration:checks?.[ch.id]?"line-through":"none" }}>
                          {ch.label}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
                {isEdit && (
                  <button className="btn btn-ghost" style={{ margin:"8px 14px 12px",fontSize:12,padding:"6px 14px" }} onClick={() => addItem(ph.id)}>
                    + Add Item
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {isEdit && (
        <button className="btn btn-outline" style={{ width:"100%",justifyContent:"center",marginTop:8 }} onClick={addPhase}>
          + Add Phase
        </button>
      )}
    </div>
  );
}

// ── Template Editor Modal ─────────────────────────────────────────────────────
function TemplateEditorModal({ template, onSave, onClose, isAdmin }) {
  const [local, setLocal] = useState(clone(template));
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal modal-wide">
        {confirmReset && (
          <ConfirmDialog
            message="Reset to the original default template? Your saved template will be replaced."
            onConfirm={() => { setLocal(clone(DEFAULT_TEMPLATE)); setConfirmReset(false); }}
            onCancel={() => setConfirmReset(false)}
          />
        )}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6 }}>
          <div>
            <p style={{ fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"var(--soft)",marginBottom:4 }}>Checklist Template</p>
            <h2 style={{ fontFamily:"var(--serif)",fontSize:26,fontWeight:400 }}>{isAdmin ? "Edit Default Template" : "View Default Template"}</h2>
            <p style={{ fontSize:12,color:"var(--soft)",marginTop:6 }}>Changes apply to all new projects. Existing projects are unaffected.</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding:"7px 14px",flexShrink:0 }}>✕</button>
        </div>
        {!isAdmin && (
          <div style={{ padding:"10px 14px",background:"var(--cream)",border:"1px solid var(--border)",borderRadius:8,fontSize:12,color:"var(--soft)",marginBottom:4 }}>
            Only studio admins can edit the template.
          </div>
        )}
        <div style={{ height:1,background:"var(--border)",margin:"20px 0" }} />
        <div style={{ maxHeight:"52vh",overflowY:"auto",paddingRight:4 }}>
          <PhasesPanel phases={local} checks={null} onPhasesChange={isAdmin ? setLocal : null} onChecksChange={null} alwaysEdit={isAdmin} />
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"space-between",marginTop:24,paddingTop:16,borderTop:"1px solid var(--border)" }}>
          {isAdmin ? (
            <>
              <button className="btn btn-danger" style={{ fontSize:12 }} onClick={() => setConfirmReset(true)}>↺ Reset to Default</button>
              <div style={{ display:"flex",gap:10 }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={() => { onSave(local); onClose(); }}>💾 Save Template</button>
              </div>
            </>
          ) : (
            <div style={{ marginLeft:"auto" }}>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Docs & Links Tab ──────────────────────────────────────────────────────────
function DocsLinksTab({ files, links, saveFiles, setLinks, userId, projectId }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [addingLink, setAddingLink] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [linkForm, setLinkForm] = useState({ label:"", url:"" });
  const [warning, setWarning] = useState("");
  const fileRef = useRef(null);
  const MAX_MB = 50;

  const processFiles = async list => {
    const arr = Array.from(list);
    const big = arr.filter(f => f.size > MAX_MB * 1024 * 1024);
    if (big.length) {
      setWarning(big.map(f=>f.name).join(", ") + " exceed " + MAX_MB + "MB and were skipped.");
      setTimeout(() => setWarning(""), 5000);
    }
    const valid = arr.filter(f => f.size <= MAX_MB * 1024 * 1024);
    if (!valid.length) return;
    setUploading(true);
    const results = await Promise.all(valid.map(async file => {
      const path = `${userId}/${projectId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("project-files").upload(path, file);
      if (error) { console.error("upload:", error); return null; }
      return { id:uid(), name:file.name, size:file.size, type:file.type, path, addedAt:new Date().toISOString() };
    }));
    setUploading(false);
    const uploaded = results.filter(Boolean);
    if (uploaded.length) saveFiles([...files, ...uploaded]);
  };

  const submitLink = () => {
    const url = linkForm.url.trim();
    if (!url) return;
    const label = linkForm.label.trim() || url;
    if (editingLinkId) {
      setLinks(links.map(l => l.id===editingLinkId ? { ...l,label,url } : l));
      setEditingLinkId(null);
    } else {
      setLinks([...links, { id:uid(), label, url, addedAt:new Date().toISOString() }]);
    }
    setLinkForm({ label:"", url:"" });
    setAddingLink(false);
  };

  const cancelLink = () => { setAddingLink(false); setEditingLinkId(null); setLinkForm({ label:"", url:"" }); };
  const startEdit = l => { setLinkForm({ label:l.label, url:l.url }); setEditingLinkId(l.id); setAddingLink(true); };
  const removeFile = async id => {
    const file = files.find(f => f.id === id);
    if (file?.path) await supabase.storage.from("project-files").remove([file.path]);
    saveFiles(files.filter(f => f.id !== id));
  };
  const removeLink = id => setLinks(links.filter(l => l.id!==id));
  const openFile = async f => {
    setOpeningId(f.id);
    const { data, error } = await supabase.storage.from("project-files").createSignedUrl(f.path, 3600);
    setOpeningId(null);
    if (error) { setWarning("Could not open file. Please try again."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Docs & Links</h1>
        <p style={{ color:"var(--soft)",fontSize:13 }}>Store reference files and useful URLs for this project.</p>
      </div>

      <div className={`drop-zone${dragging?" over":""}`}
        onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!uploading) processFiles(e.dataTransfer.files); }}
        onClick={() => { if (!uploading) fileRef.current?.click(); }}
        style={{ marginBottom:28, opacity: uploading ? 0.6 : 1, cursor: uploading ? "default" : "pointer" }}>
        <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e => { processFiles(e.target.files); e.target.value=""; }} />
        <div style={{ fontSize:32,marginBottom:10 }}>{uploading ? "⏳" : dragging ? "⬇️" : "📎"}</div>
        <p style={{ fontWeight:600,fontSize:14,color:dragging?"var(--accent)":"var(--ink)",marginBottom:4 }}>
          {uploading ? "Uploading…" : dragging ? "Release to upload" : "Drop files here, or click to browse"}
        </p>
        <p style={{ fontSize:12,color:"var(--soft)" }}>PDFs, images, docs, spreadsheets — Max {MAX_MB} MB each</p>
      </div>

      {warning && (
        <div style={{ padding:"10px 14px",background:"#fff3e0",border:"1px solid #ffe0b2",borderRadius:8,fontSize:12,color:"#e65100",marginBottom:16 }}>
          ⚠ {warning}
        </div>
      )}

      <div style={{ marginBottom:28 }}>
        <p style={{ fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)",marginBottom:12 }}>
          Files {files.length > 0 && `(${files.length})`}
        </p>
        {files.length > 0 ? (
          <div style={{ background:"var(--white)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden" }}>
            {files.map((f,i) => (
              <div key={f.id} className="file-row" style={{ borderBottom:i<files.length-1?"1px solid var(--cream)":"none" }}>
                <span style={{ fontSize:26,flexShrink:0 }}>{FILE_ICON(f.type)}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:2 }}>{f.name}</p>
                  <p style={{ fontSize:11,color:"var(--soft)" }}>{fmtSize(f.size)} · Added {fmtDate(f.addedAt)}</p>
                </div>
                <button className="btn btn-ghost" style={{ padding:"5px 12px",fontSize:11,flexShrink:0 }} onClick={() => openFile(f)} disabled={openingId === f.id}>
                  {openingId === f.id ? "…" : "↗ Open"}
                </button>
                <button className="btn btn-danger" style={{ padding:"5px 10px",fontSize:11,flexShrink:0 }} onClick={() => removeFile(f.id)}>🗑</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding:"20px",background:"var(--white)",border:"1px solid var(--border)",borderRadius:10,textAlign:"center",color:"var(--soft)",fontSize:13 }}>
            No files uploaded yet.
          </div>
        )}
      </div>

      <div>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
          <p style={{ fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)" }}>
            Links {links.length > 0 && `(${links.length})`}
          </p>
          {!addingLink && <button className="btn btn-outline" style={{ padding:"5px 14px",fontSize:12 }} onClick={() => setAddingLink(true)}>+ Add Link</button>}
        </div>

        {addingLink && (
          <div style={{ background:"var(--white)",border:"1px solid var(--border)",borderRadius:10,padding:20,marginBottom:12 }}>
            <p style={{ fontSize:13,fontWeight:600,marginBottom:14 }}>{editingLinkId ? "Edit Link" : "New Link"}</p>
            <Field label="Label">
              <input value={linkForm.label} onChange={e => setLinkForm(f=>({...f,label:e.target.value}))} placeholder="e.g. Client Brief, Reference Film" autoFocus />
            </Field>
            <Field label="URL">
              <input value={linkForm.url} onChange={e => setLinkForm(f=>({...f,url:e.target.value}))} placeholder="https://…"
                onKeyDown={e => { if(e.key==="Enter") submitLink(); if(e.key==="Escape") cancelLink(); }} />
            </Field>
            <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:4 }}>
              <button className="btn btn-ghost" style={{ fontSize:12,padding:"7px 14px" }} onClick={cancelLink}>Cancel</button>
              <button className="btn btn-primary" style={{ fontSize:12 }} onClick={submitLink} disabled={!linkForm.url.trim()}>
                {editingLinkId ? "Save Changes" : "Add Link"}
              </button>
            </div>
          </div>
        )}

        {links.length > 0 ? (
          <div style={{ background:"var(--white)",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden" }}>
            {links.map((l,i) => (
              <div key={l.id} className="link-row" style={{ borderBottom:i<links.length-1?"1px solid var(--cream)":"none" }}>
                <div style={{ width:34,height:34,borderRadius:8,background:"var(--cream)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>🔗</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontSize:13,fontWeight:600,marginBottom:2 }}>{l.label}</p>
                  <p style={{ fontSize:11,color:"var(--soft)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{l.url}</p>
                </div>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink:0,textDecoration:"none" }}>
                  <button className="btn btn-ghost" style={{ padding:"5px 12px",fontSize:11 }}>↗ Open</button>
                </a>
                <button className="btn btn-ghost" style={{ padding:"5px 10px",fontSize:11,flexShrink:0 }} onClick={() => startEdit(l)}>✏</button>
                <button className="btn btn-danger" style={{ padding:"5px 10px",fontSize:11,flexShrink:0 }} onClick={() => removeLink(l.id)}>🗑</button>
              </div>
            ))}
          </div>
        ) : !addingLink && (
          <div style={{ padding:"32px 20px",background:"var(--white)",border:"2px dashed var(--border)",borderRadius:10,textAlign:"center",color:"var(--soft)" }}>
            <p style={{ fontSize:28,marginBottom:10 }}>🔗</p>
            <p style={{ fontSize:13 }}>Add Google Drive folders, Vimeo references, client portals, or any useful URL.</p>
            <button className="btn btn-outline" style={{ marginTop:16,fontSize:12 }} onClick={() => setAddingLink(true)}>+ Add First Link</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Proposal Modal ────────────────────────────────────────────────────────────
function ProposalModal({ project, status, onClose }) {
  const [selected, setSelected] = useState(Object.fromEntries(PROPOSAL_SECTIONS.map(s => [s.key, true])));
  const [generated, setGenerated] = useState(false);
  const [pdfText, setPdfText] = useState("");
  const [loading, setLoading] = useState(false);

  const toggle = key => setSelected(s => ({ ...s, [key]:!s[key] }));
  const hasData = key => {
    if (key==="overview") return !!(project.title||project.client||project.logline);
    if (key==="timeline") return !!(project.startDate||project.deliveryDate||project.timelinePhases);
    if (key==="budget") return !!(project.budgetTotal||project.paymentSchedule);
    if (key==="deliverables") return project.deliverables?.length > 0;
    if (key==="team") return !!(project.director||project.producer||project.writer||project.dop||project.editor||project.vfxLead||project.customTeam);
    if (key==="notes") return !!project.notes_general;
    return false;
  };

  const buildPreviewText = () => {
    const div = "─".repeat(60);
    const lines = ["STUDIO PROPOSAL", div,
      "Prepared by: " + (project.preparedBy || "[Studio Name]"),
      "Date: " + new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}), ""];
    if (selected.overview) {
      lines.push("PROJECT OVERVIEW", div);
      if (project.title) lines.push("Project Title:   " + project.title);
      if (project.client) lines.push("Client / Studio: " + project.client);
      if (project.genre) lines.push("Genre / Style:   " + project.genre);
      if (status) lines.push("Status:          " + status.label);
      if (project.logline) lines.push("", "SYNOPSIS", project.logline);
      lines.push("");
    }
    if (selected.timeline) {
      lines.push("TIMELINE", div);
      if (project.startDate) lines.push("Start Date:      " + project.startDate);
      if (project.deliveryDate) lines.push("Delivery Date:   " + project.deliveryDate);
      if (project.timelinePhases) lines.push("", "Phases:", project.timelinePhases);
      lines.push("");
    }
    if (selected.budget) {
      lines.push("BUDGET & FINANCIALS", div);
      if (project.budgetTotal) lines.push("Total Budget:    " + project.currency + " " + project.budgetTotal);
      if (project.paymentSchedule) lines.push("", "Payment Schedule:", project.paymentSchedule);
      lines.push("");
    }
    if (selected.deliverables && project.deliverables?.length > 0) {
      lines.push("DELIVERABLES", div);
      project.deliverables.forEach((d,i) => {
        lines.push("  " + (i+1) + ". " + (d.name || "Untitled"));
        if (d.runtime) lines.push("     Runtime:   " + d.runtime);
        if (d.format) lines.push("     Format:    " + d.format);
        if (d.resolution) lines.push("     Res:       " + d.resolution);
      });
      lines.push("");
    }
    if (selected.team) {
      lines.push("CREATIVE TEAM", div);
      [["Director",project.director],["Producer",project.producer],["Writer",project.writer],
       ["DOP",project.dop],["Editor",project.editor],["VFX Lead",project.vfxLead]]
        .filter(([,v])=>v).forEach(([k,v]) => lines.push("  " + k.padEnd(20) + v));
      lines.push("");
    }
    if (selected.notes && project.notes_general) lines.push("ADDITIONAL NOTES", div, project.notes_general, "");
    lines.push(div, "Confidential · For Discussion Purposes Only");
    return lines.join("\n");
  };

  const handleGenerate = () => {
    setLoading(true);
    setTimeout(() => { setPdfText(buildPreviewText()); setGenerated(true); setLoading(false); }, 400);
  };

  const handleDownload = () => {
    const html = buildProposalHtml(project, selected, status);
    const blob = new Blob([html], { type:"text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (project.title || "proposal").replace(/\s+/g,"_") + "_proposal.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="modal">
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28 }}>
          <div>
            <p style={{ fontSize:11,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase",color:"var(--soft)",marginBottom:4 }}>Proposal Builder</p>
            <h2 style={{ fontFamily:"var(--serif)",fontSize:26,fontWeight:400 }}>Choose Sections to Include</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding:"7px 14px" }}>✕</button>
        </div>

        <div style={{ background:"var(--cream)",borderRadius:10,overflow:"hidden",marginBottom:24 }}>
          {PROPOSAL_SECTIONS.map(s => {
            const has = hasData(s.key);
            return (
              <label key={s.key} className="pcheck-row" style={{ opacity:has?1:.45 }}>
                <input type="checkbox" checked={selected[s.key]} onChange={() => toggle(s.key)} disabled={!has} />
                <div>
                  <div style={{ fontSize:14,fontWeight:500 }}>{s.label}</div>
                  {!has && <div style={{ fontSize:11,color:"var(--soft)",marginTop:2 }}>No data entered yet</div>}
                </div>
              </label>
            );
          })}
        </div>

        {!generated ? (
          <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading ? "⏳ Building…" : "⚡ Generate Proposal"}
            </button>
          </div>
        ) : (
          <>
            <div style={{ padding:"14px 16px",background:"#f0faf0",borderRadius:8,border:"1px solid #c8e6c9",fontSize:13,color:"#2e7d32",marginBottom:16 }}>
              ✅ Ready — download as HTML, open in browser → Print → Save as PDF
            </div>
            <pre className="pdf-preview">{pdfText}</pre>
            <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setGenerated(false)}>← Revise</button>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={handleDownload}>⬇ Download Proposal</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Project Editor ────────────────────────────────────────────────────────────
function ProjectEditor({ project: initProject, user, onUpdate, onClose, template, onSaveTemplate, isAdmin }) {
  const [project, setProject] = useState(initProject);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [savedAt, setSavedAt] = useState(null);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const timer = setTimeout(() => {
      onUpdate(project);
      setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(timer);
  }, [project]);

  const set = (k, v) => setProject(p => ({ ...p, [k]:v }));
  const setClPhases = phases => set("clPhases", phases);
  const setChecks = checks => set("checks", checks);
  const setLinks = links => set("links", links);

  // Files bypass the debounced autosave: persisted immediately against the
  // latest project state so an in-flight upload/delete can't be overwritten
  // by a stale closure, and failures are surfaced rather than swallowed.
  const saveFiles = newFiles => {
    setProject(p => {
      const updated = { ...p, files: newFiles, updatedAt: new Date().toISOString() };
      onUpdate(updated);
      return updated;
    });
    setSavedAt(Date.now());
  };
  const updateDel = (id, u) => set("deliverables", project.deliverables.map(d => d.id===id ? u : d));
  const removeDel = id => set("deliverables", project.deliverables.filter(d => d.id!==id));
  const addDel = () => set("deliverables", [...project.deliverables, emptyDeliverable()]);

  const status = useMemo(() => deriveStatus(project.checks, project.clPhases), [project.checks, project.clPhases]);
  const fieldPct = useMemo(() => {
    const c = [project.title,project.client,project.preparedBy,project.logline,project.startDate,project.deliveryDate,project.budgetTotal,project.deliverables?.length>0,project.director];
    return Math.round(c.filter(Boolean).length / c.length * 100);
  }, [project]);
  const checklistPct = useMemo(() => clPct(project), [project.checks, project.clPhases]);
  const docsCount = (project.files||[]).length + (project.links||[]).length;

  const tabs = [
    {id:"overview",label:"Overview",icon:"◉"},
    {id:"timeline",label:"Timeline",icon:"◷"},
    {id:"budget",label:"Budget",icon:"◈"},
    {id:"deliverables",label:"Deliverables",icon:"◻"},
    {id:"team",label:"Team",icon:"◎"},
    {id:"notes",label:"Notes",icon:"◌"},
    {id:"checklist",label:"Checklist",icon:"✓",badge:checklistPct},
    {id:"docs",label:"Docs & Links",icon:"◫",badge:docsCount||null},
  ];

  return (
    <>
      <FontStyle />
      {proposalOpen && <ProposalModal project={project} status={status} onClose={() => setProposalOpen(false)} />}
      {tplEditorOpen && <TemplateEditorModal template={template} onSave={onSaveTemplate} onClose={() => setTplEditorOpen(false)} isAdmin={isAdmin} />}
      {shareOpen && <ShareModal project={project} onUpdate={p => { setProject(p); onUpdate(p); }} onClose={() => setShareOpen(false)} />}
      {confirmReset && (
        <ConfirmDialog
          message={"Reset this project's checklist to the current template?\n\nAll checkbox progress and customizations will be lost."}
          onConfirm={() => { const fresh=clone(template); setProject(p=>({...p,clPhases:fresh,checks:makeChecks(fresh)})); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      <div style={{ minHeight:"100vh",background:"var(--paper)" }}>
        <header style={{ position:"sticky",top:0,zIndex:50,background:"rgba(245,242,236,.92)",backdropFilter:"blur(12px)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:60,gap:12 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,minWidth:0 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ padding:"6px 12px",fontSize:12,flexShrink:0 }}>← Home</button>
            <span style={{ color:"var(--soft)",fontSize:16 }}>·</span>
            <span style={{ fontFamily:"var(--serif)",fontSize:18,flexShrink:0 }}>✦</span>
            <span style={{ fontSize:13,color:"var(--soft)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              {project.title || "New Project"}
            </span>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            {savedAt && <span style={{ fontSize:11,color:"#4caf50",fontWeight:600,transition:"opacity .5s" }}>✓ Saved</span>}
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <div style={{ width:72,height:4,background:"var(--cream)",borderRadius:2,overflow:"hidden" }}>
                <div style={{ height:"100%",width:`${fieldPct}%`,background:fieldPct>70?"#4caf50":fieldPct>40?"#ff9800":"var(--accent)",borderRadius:2,transition:"width .5s" }} />
              </div>
              <span style={{ fontSize:11,color:"var(--soft)",fontWeight:600 }}>{fieldPct}%</span>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:12,padding:"7px 12px" }} onClick={() => setShareOpen(true)}>👥 Share</button>
            <button className="btn btn-primary" style={{ fontSize:12,padding:"7px 14px" }} onClick={() => setProposalOpen(true)}>📄 Proposal</button>
          </div>
        </header>

        <div style={{ display:"flex",maxWidth:1100,margin:"0 auto",padding:"32px 24px",gap:28,alignItems:"flex-start" }}>
          <nav style={{ width:184,flexShrink:0,position:"sticky",top:80 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",textAlign:"left",padding:"10px 14px",borderRadius:8,border:"none",background:activeTab===t.id?"var(--accent)":"transparent",color:activeTab===t.id?"#fff":"var(--ink)",fontFamily:"var(--sans)",fontSize:13,fontWeight:activeTab===t.id?600:400,cursor:"pointer",marginBottom:2,transition:"all .15s" }}>
                <span style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ opacity:activeTab===t.id?1:.4,fontSize:12 }}>{t.icon}</span>
                  {t.label}
                </span>
                {t.badge != null && (
                  <span style={{ fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:10,background:activeTab===t.id?"rgba(255,255,255,.25)":(t.id==="checklist"&&t.badge===100)?"#f3e5f5":"var(--cream)",color:activeTab===t.id?"#fff":(t.id==="checklist"&&t.badge===100)?"#6a1b9a":"var(--soft)" }}>
                    {t.id==="checklist" ? `${t.badge}%` : t.badge}
                  </span>
                )}
              </button>
            ))}

            <div style={{ marginTop:28,padding:16,background:"var(--white)",border:"1px solid var(--border)",borderRadius:10 }}>
              <p style={{ fontSize:10,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"var(--soft)",marginBottom:10 }}>Quick Info</p>
              <span style={{ display:"inline-block",fontSize:11,fontWeight:600,letterSpacing:".04em",padding:"3px 10px",borderRadius:20,textTransform:"uppercase",marginBottom:10,background:status.bg,color:status.color }}>
                {status.label}
              </span>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontSize:10,color:"var(--soft)",fontWeight:600,letterSpacing:".05em",textTransform:"uppercase" }}>Checklist</span>
                  <span style={{ fontSize:10,color:"var(--soft)",fontWeight:600 }}>{checklistPct}%</span>
                </div>
                <div style={{ height:3,background:"var(--cream)",borderRadius:2,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${checklistPct}%`,background:checklistPct===100?"#6a1b9a":"var(--accent)",borderRadius:2,transition:"width .4s" }} />
                </div>
              </div>
              {project.preparedBy && <p style={{ fontSize:12,color:"var(--soft)",marginBottom:4 }}>By {project.preparedBy}</p>}
              {project.client && <p style={{ fontSize:12,color:"var(--soft)",marginBottom:4 }}>{project.client}</p>}
              {project.deliveryDate && <p style={{ fontSize:11,color:"var(--soft)",marginBottom:4 }}>🗓 {project.deliveryDate}</p>}
              {project.budgetTotal && <p style={{ fontSize:12,fontWeight:600,color:"var(--accent)",marginBottom:4 }}>{project.currency} {project.budgetTotal}</p>}
              {project.deliverables?.length > 0 && <p style={{ fontSize:11,color:"var(--soft)",marginBottom:4 }}>📦 {project.deliverables.length} deliverable{project.deliverables.length!==1?"s":""}</p>}
              {docsCount > 0 && <p style={{ fontSize:11,color:"var(--soft)" }}>📎 {docsCount} file{docsCount!==1?"s":""}/link{docsCount!==1?"s":""}</p>}
            </div>
          </nav>

          <main style={{ flex:1,minWidth:0 }}>

            {activeTab==="overview" && (
              <>
                <div style={{ marginBottom:24 }}><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Project Overview</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Core identity of your project.</p></div>
                <div className="card">
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                    <Field label="Project Title"><input value={project.title} onChange={e=>set("title",e.target.value)} placeholder="e.g. Neon Requiem"/></Field>
                    <Field label="Client / Studio"><input value={project.client} onChange={e=>set("client",e.target.value)} placeholder="e.g. Apex Films"/></Field>
                  </div>
                  <Field label="Prepared By"><input value={project.preparedBy} onChange={e=>set("preparedBy",e.target.value)} placeholder="e.g. Jane Doe, Creative Director"/></Field>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                    <Field label="Project Type">
                      <select value={project.projectType} onChange={e=>set("projectType",e.target.value)}>
                        {[["animation","Animation"],["live_action","Live Action"],["vfx","VFX"],["mixed","Mixed Media"],["documentary","Documentary"],["short_film","Short Film"],["series","Series"],["commercial","Commercial"],["music_video","Music Video"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Genre / Style"><input value={project.genre} onChange={e=>set("genre",e.target.value)} placeholder="e.g. Sci-Fi, Noir, 2D Animation"/></Field>
                  </div>
                  <div style={{ display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"var(--cream)",borderRadius:8,marginBottom:16 }}>
                    <span style={{ fontSize:11,fontWeight:600,letterSpacing:".06em",textTransform:"uppercase",color:"var(--soft)" }}>Project Status</span>
                    <span style={{ display:"inline-block",fontSize:11,fontWeight:600,letterSpacing:".04em",padding:"3px 10px",borderRadius:20,textTransform:"uppercase",background:status.bg,color:status.color }}>{status.label}</span>
                    <span style={{ fontSize:11,color:"var(--soft)" }}>— auto-updated from Checklist</span>
                  </div>
                  <Field label="Logline / Synopsis"><textarea rows={5} value={project.logline} onChange={e=>set("logline",e.target.value)} placeholder="A brief description of the project…"/></Field>
                </div>
              </>
            )}

            {activeTab==="timeline" && (
              <>
                <div style={{ marginBottom:24 }}><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Timeline</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Key dates and production phases.</p></div>
                <div className="card">
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                    <Field label="Start Date"><input type="date" value={project.startDate} onChange={e=>set("startDate",e.target.value)}/></Field>
                    <Field label="Delivery Date"><input type="date" value={project.deliveryDate} onChange={e=>set("deliveryDate",e.target.value)}/></Field>
                  </div>
                  <Field label="Production Phases"><textarea rows={7} value={project.timelinePhases} onChange={e=>set("timelinePhases",e.target.value)} placeholder={"Week 1–2: Concept & Script\nWeek 3–6: Storyboarding\nWeek 7–14: Production\nWeek 15–18: Post-Production\nWeek 19: Delivery"}/></Field>
                </div>
              </>
            )}

            {activeTab==="budget" && (
              <>
                <div style={{ marginBottom:24 }}><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Budget</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Financial overview and payment structure.</p></div>
                <div className="card">
                  <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:16 }}>
                    <Field label="Total Budget"><input value={project.budgetTotal} onChange={e=>set("budgetTotal",e.target.value)} placeholder="e.g. 250,000"/></Field>
                    <Field label="Currency"><select value={project.currency} onChange={e=>set("currency",e.target.value)}>{["USD","EUR","GBP","CAD","AUD","JPY","CHF","MXN","BRL"].map(c=><option key={c}>{c}</option>)}</select></Field>
                  </div>
                  <Field label="Payment Schedule"><textarea rows={5} value={project.paymentSchedule} onChange={e=>set("paymentSchedule",e.target.value)} placeholder={"30% on signing\n30% at production start\n20% at picture lock\n20% on final delivery"}/></Field>
                  <Field label="Budget Notes"><textarea rows={3} value={project.notes_budget} onChange={e=>set("notes_budget",e.target.value)} placeholder="Contingency, exclusions, assumptions…"/></Field>
                </div>
              </>
            )}

            {activeTab==="deliverables" && (
              <>
                <div style={{ marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"flex-end" }}>
                  <div><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Deliverables</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Each deliverable has its own technical specifications.</p></div>
                  <button className="btn btn-outline" onClick={addDel}>+ Add Deliverable</button>
                </div>
                {project.deliverables.length === 0 ? (
                  <div style={{ textAlign:"center",padding:"60px 20px",background:"var(--white)",border:"2px dashed var(--border)",borderRadius:12,color:"var(--soft)" }}>
                    <div style={{ fontSize:32,marginBottom:12 }}>📦</div>
                    <p style={{ fontFamily:"var(--serif)",fontSize:20,marginBottom:6 }}>No deliverables yet</p>
                    <p style={{ fontSize:13,marginBottom:20 }}>Add each output — film, trailer, EPK — with its own specs.</p>
                    <button className="btn btn-primary" onClick={addDel}>+ Add First Deliverable</button>
                  </div>
                ) : (
                  <>
                    {project.deliverables.map((d,i) => <DeliverableCard key={d.id} del={d} index={i} onChange={u=>updateDel(d.id,u)} onRemove={()=>removeDel(d.id)}/>)}
                    <div style={{ textAlign:"center",marginTop:8 }}><button className="btn btn-outline" onClick={addDel}>+ Add Another Deliverable</button></div>
                  </>
                )}
              </>
            )}

            {activeTab==="team" && (
              <>
                <div style={{ marginBottom:24 }}><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Creative Team</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Key personnel attached to the project.</p></div>
                <div className="card">
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                    {[["director","Director"],["producer","Producer"],["writer","Writer / Screenwriter"],["dop","Director of Photography"],["editor","Editor"],["vfxLead","VFX Lead"]].map(([k,l]) => (
                      <Field key={k} label={l}><input value={project[k]} onChange={e=>set(k,e.target.value)} placeholder="Name or TBD"/></Field>
                    ))}
                  </div>
                  <Field label="Additional Team Members"><textarea rows={4} value={project.customTeam} onChange={e=>set("customTeam",e.target.value)} placeholder={"Composer: Jane Doe\nSound Designer: John Smith\nColorist: TBD"}/></Field>
                </div>
              </>
            )}

            {activeTab==="notes" && (
              <>
                <div style={{ marginBottom:24 }}><h1 style={{ fontFamily:"var(--serif)",fontSize:32,fontWeight:400,marginBottom:4 }}>Notes</h1><p style={{ color:"var(--soft)",fontSize:13 }}>Anything else worth capturing.</p></div>
                <div className="card">
                  <Field label="General Notes"><textarea rows={14} value={project.notes_general} onChange={e=>set("notes_general",e.target.value)} placeholder="References, special requirements, client preferences, legal considerations…"/></Field>
                </div>
              </>
            )}

            {activeTab==="checklist" && (
              <div>
                <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginBottom:16 }}>
                  <button className="btn btn-ghost" style={{ fontSize:12,padding:"7px 14px" }} onClick={() => setConfirmReset(true)}>↺ Reset to Template</button>
                  <button className="btn btn-ghost" style={{ fontSize:12,padding:"7px 14px" }} onClick={() => setTplEditorOpen(true)}>🗂 Edit Template</button>
                </div>
                <PhasesPanel phases={project.clPhases} checks={project.checks} onPhasesChange={setClPhases} onChecksChange={setChecks} alwaysEdit={false} />
              </div>
            )}

            {activeTab==="docs" && (
              <DocsLinksTab files={project.files||[]} links={project.links||[]} saveFiles={saveFiles} setLinks={setLinks} userId={user.id} projectId={project.id} />
            )}

            {activeTab!=="checklist" && activeTab!=="docs" && (
              <div style={{ display:"flex",justifyContent:"flex-end",marginTop:8 }}>
                <button className="btn btn-outline" onClick={() => setProposalOpen(true)}>📄 Build Proposal</button>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

// ── DB field converters ───────────────────────────────────────────────────────
const toDb = p => ({
  id:               p.id,
  owner_id:         p.ownerId,
  owner_name:       p.ownerName,
  owner_email:      p.ownerEmail,
  collaborators:    p.collaborators,
  created_at:       p.createdAt,
  updated_at:       p.updatedAt,
  title:            p.title,
  client:           p.client,
  prepared_by:      p.preparedBy,
  logline:          p.logline,
  project_type:     p.projectType,
  genre:            p.genre,
  start_date:       p.startDate,
  delivery_date:    p.deliveryDate,
  timeline_phases:  p.timelinePhases,
  budget_total:     p.budgetTotal,
  currency:         p.currency,
  payment_schedule: p.paymentSchedule,
  notes_budget:     p.notes_budget,
  deliverables:     p.deliverables,
  director:         p.director,
  producer:         p.producer,
  writer:           p.writer,
  dop:              p.dop,
  editor:           p.editor,
  vfx_lead:         p.vfxLead,
  custom_team:      p.customTeam,
  notes_general:    p.notes_general,
  cl_phases:        p.clPhases,
  checks:           p.checks,
  files:            p.files || [],
  links:            p.links,
});

const fromDb = r => ({
  id:              r.id,
  ownerId:         r.owner_id,
  ownerName:       r.owner_name        || "",
  ownerEmail:      r.owner_email       || "",
  collaborators:   r.collaborators     || [],
  createdAt:       r.created_at,
  updatedAt:       r.updated_at,
  title:           r.title             || "",
  client:          r.client            || "",
  preparedBy:      r.prepared_by       || "",
  logline:         r.logline           || "",
  projectType:     r.project_type      || "animation",
  genre:           r.genre             || "",
  startDate:       r.start_date        || "",
  deliveryDate:    r.delivery_date     || "",
  timelinePhases:  r.timeline_phases   || "",
  budgetTotal:     r.budget_total      || "",
  currency:        r.currency          || "USD",
  paymentSchedule: r.payment_schedule  || "",
  notes_budget:    r.notes_budget      || "",
  deliverables:    r.deliverables      || [],
  director:        r.director          || "",
  producer:        r.producer          || "",
  writer:          r.writer            || "",
  dop:             r.dop               || "",
  editor:          r.editor            || "",
  vfxLead:         r.vfx_lead          || "",
  customTeam:      r.custom_team       || "",
  notes_general:   r.notes_general     || "",
  clPhases:        r.cl_phases         || [],
  checks:          r.checks            || {},
  files:           r.files             || [],
  links:           r.links             || [],
});

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [template, setTemplate] = useState(clone(DEFAULT_TEMPLATE));
  const [isAdmin, setIsAdmin] = useState(false);
  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const user = normalizeUser(session.user);
        setCurrentUser(user);
        loadProjects(user);
        loadTemplateAndAdmin(user);
      }
      setAppLoading(false);
    });

    // Keep session in sync across sign-in (OAuth redirect), sign-out, token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setCurrentUser(normalizeUser(session.user));
      } else {
        setCurrentUser(null);
        setProjects([]);
        setCurrentProjectId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProjects = async user => {
    const { data, error } = await supabase.from("projects").select("*");
    if (error) console.error("loadProjects:", error);
    setProjects((data || []).map(fromDb));
  };

  const loadTemplateAndAdmin = async user => {
    const [tplRes, adminRes] = await Promise.all([
      supabase.from("studio_template").select("phases").eq("id", 1).single(),
      supabase.from("admins").select("user_id").eq("user_id", user.id).single(),
    ]);
    if (tplRes.data?.phases) setTemplate(tplRes.data.phases);
    setIsAdmin(!adminRes.error && !!adminRes.data);
  };

  const saveTemplate = async tpl => {
    setTemplate(tpl);
    await supabase.from("studio_template").upsert({ id: 1, phases: tpl, updated_at: new Date().toISOString() });
  };

  const handleLogin = async supabaseUser => {
    const user = normalizeUser(supabaseUser);
    setCurrentUser(user);
    await Promise.all([loadProjects(user), loadTemplateAndAdmin(user)]);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null); setProjects([]); setCurrentProjectId(null);
  };

  const createProject = async meta => {
    const np = { ...emptyProject(template, currentUser), title:meta.title||"Untitled Project", client:meta.client||"", projectType:meta.type||"animation" };
    const { id: _omit, ...rowWithoutId } = toDb(np);
    const { data, error } = await supabase.from("projects").insert(rowWithoutId).select().single();
    if (error) { console.error("createProject:", error); return; }
    const saved = fromDb(data);
    setProjects(prev => [...prev, saved]);
    setCurrentProjectId(saved.id);
  };

  const updateProject = async updated => {
    const now = new Date().toISOString();
    const p = { ...updated, updatedAt: now };
    setProjects(prev => prev.map(q => q.id === p.id ? p : q));
    const { error } = await supabase.from("projects").upsert(toDb(p));
    if (error) { console.error("updateProject failed:", error); return false; }
    return true;
  };

  const deleteProject = id => {
    setProjects(prev => prev.filter(p => p.id !== id));
    supabase.from("projects").delete().eq("id", id);
  };

  const duplicateProject = async id => {
    const orig = projects.find(p => p.id === id);
    if (!orig) return;
    const dup = { ...clone(orig), title:`${orig.title} (Copy)`, ownerId:currentUser.id, ownerName:currentUser.name, ownerEmail:currentUser.email, collaborators:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), files:[] };
    const { id: _omit, ...rowWithoutId } = toDb(dup);
    const { data, error } = await supabase.from("projects").insert(rowWithoutId).select().single();
    if (error) { console.error("duplicateProject:", error); return; }
    setProjects(prev => [...prev, fromDb(data)]);
  };

  if (appLoading) return <><FontStyle/><LoadingScreen /></>;
  if (!currentUser) return <><FontStyle/><AuthScreen onLogin={handleLogin} /></>;

  const currentProject = projects.find(p => p.id===currentProjectId);
  if (currentProjectId && currentProject) {
    return (
      <ProjectEditor
        project={currentProject}
        user={currentUser}
        onUpdate={updateProject}
        onClose={() => setCurrentProjectId(null)}
        template={template}
        onSaveTemplate={saveTemplate}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <HomeScreen
      user={currentUser}
      projects={projects}
      onOpenProject={setCurrentProjectId}
      onNewProject={createProject}
      onDeleteProject={deleteProject}
      onDuplicateProject={duplicateProject}
      onUpdateProject={updateProject}
      onLogout={handleLogout}
    />
  );
}
