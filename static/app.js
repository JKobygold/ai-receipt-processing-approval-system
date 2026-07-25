/* Rajant Receipt Portal SPA — vanilla JS, no build step. */

let role = "employee";
let receipts = [];
let selectedId = null;   // employee: receipt shown in preview + fields panel
let modalId = null;      // manager: receipt open in the approval modal

const $ = (sel) => document.querySelector(sel);

const STATUS_LABELS = {
  uploaded: "Uploaded", processing: "Processing…", failed: "Failed",
  review: "Needs review", submitted: "Submitted", approved: "Approved", rejected: "Rejected",
};
const STAGES = ["uploaded", "processing", "review", "submitted"];
const ACCEPTED_EXT = /\.(png|jpe?g|heic|heif|pdf)$/i;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "X-Role": role, ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...opts.headers },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function money(v, currency) {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(2)} ${currency || ""}`.trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function confBadge(conf, field) {
  if (!conf || conf[field] === undefined) return "";
  const c = conf[field];
  const cls = c >= 0.9 ? "conf-high" : c >= 0.7 ? "conf-mid" : "conf-low";
  return `<span class="conf ${cls}" title="AI confidence">${Math.round(c * 100)}%</span>`;
}

// Flag a field yellow when the extractor wasn't confident about it.
function lowConf(conf, field) {
  return conf && conf[field] !== undefined && conf[field] < 0.9;
}

// ---------- stage tracker ----------

function stageTrack(status) {
  if (status === "failed") {
    return `<span class="stage-track"><span class="outcome outcome-failed">✕ Failed — retry</span></span>`;
  }
  const past = ["approved", "rejected"].includes(status) ? STAGES.length : STAGES.indexOf(status);
  const pills = STAGES.map((s, i) => {
    const cls = i < past ? "done" : i === past ? "current" : "";
    return `<span class="stage s-${s} ${cls}">${STATUS_LABELS[s].replace("…", "")}</span>`;
  }).join(`<i class="stage-arrow">›</i>`);
  const outcome = status === "approved" ? `<span class="outcome outcome-approved">✓ Approved</span>`
    : status === "rejected" ? `<span class="outcome outcome-rejected">✕ Rejected</span>` : "";
  return `<span class="stage-track">${pills}${outcome}</span>`;
}

// ---------- receipts table ----------

function tableRow(r) {
  const dup = r.duplicate_of_id ? `<div class="rt-flags"><span class="badge-dup">⚠ possible duplicate of #${r.duplicate_of_id}</span></div>` : "";
  const rejected = r.status === "rejected" && r.manager_comment
    ? `<div class="rt-flags"><span class="badge-dup" style="color:var(--danger);border-color:#e3b6ad;background:#f7e3df;">Manager: ${escapeHtml(r.manager_comment)}</span></div>` : "";
  const notReceipt = r.status === "failed" && r.extraction_error?.startsWith("Sorry")
    ? `<div class="rt-flags"><span class="badge-dup" style="color:var(--danger);border-color:#e3b6ad;background:#f7e3df;">Not a receipt</span></div>` : "";
  return `
    <div class="r-table-row ${r.id === selectedId && role === "employee" ? "selected" : ""}" data-id="${r.id}">
      <span class="rt-id">#${r.id}</span>
      <span class="rt-merchant">${escapeHtml(r.merchant || "—")}
        <span class="rt-file">${escapeHtml(r.original_name)}</span>${dup}${rejected}${notReceipt}
      </span>
      <span class="rt-date">${r.purchase_date || "—"}</span>
      <span class="rt-total">${money(r.total_amount, r.currency)}</span>
      <span class="rt-tax">${r.tax_amount != null ? Number(r.tax_amount).toFixed(2) : "—"}</span>
      <span class="rt-stage">${stageTrack(r.status)}</span>
    </div>`;
}

function receiptTable(rows, emptyText) {
  if (!rows.length) return `<p class="r-empty">${emptyText}</p>`;
  return `
    <div class="r-table-header">
      <span class="rt-id">#</span>
      <span class="rt-merchant">Merchant / file</span>
      <span class="rt-date">Date</span>
      <span class="rt-total" style="color:var(--gold-100);font-family:inherit;">Total</span>
      <span class="rt-tax">Tax</span>
      <span class="rt-stage" style="justify-content:flex-end;">Stage</span>
    </div>
    ${rows.map(tableRow).join("")}`;
}

function renderLists() {
  if (role === "employee") {
    $("#employee-table").innerHTML = receiptTable(receipts, "No receipts yet — upload one to get started.");
  } else {
    const pending = receipts.filter((r) => r.status === "submitted");
    const done = receipts.filter((r) => ["approved", "rejected"].includes(r.status));
    $("#manager-table").innerHTML = receiptTable(pending, "Nothing awaiting approval.");
    $("#manager-done-table").innerHTML = receiptTable(done, "No reviewed receipts yet.");
  }
}

// ---------- preview frame ----------

function previewHtml(r) {
  if (!r) return `<div class="preview-empty">Upload a receipt — or select one from the table below — to preview it here.</div>`;
  if (r.mime_type === "application/pdf") {
    return `<div class="pdf-wrap">
      <iframe class="pdf-embed" src="/api/receipts/${r.id}/file#toolbar=0&navpanes=0" title="Receipt ${r.id}"></iframe>
      <a href="/api/receipts/${r.id}/file" target="_blank" class="pdf-open-link">Open full size ↗</a>
    </div>`;
  }
  return `<img src="/api/receipts/${r.id}/file" alt="Receipt ${r.id}"
    onerror="this.outerHTML='<div class=&quot;preview-fallback&quot;>🧾 ${escapeHtml(r.original_name)}<br>Preview isn\\'t supported for this format in your browser — the file uploaded fine and will still be processed.</div>'">`;
}

// ---------- extracted fields panel (employee) ----------

function lineItemRow(li = {}, editable) {
  const d = editable ? "" : "disabled";
  return `
    <tr>
      <td><input class="li-desc" value="${escapeHtml(li.description ?? "")}" ${d}></td>
      <td><input class="li-qty" type="number" step="any" value="${li.quantity ?? ""}" ${d}></td>
      <td><input class="li-unit" type="number" step="any" value="${li.unit_price ?? ""}" ${d}></td>
      <td><input class="li-amt" type="number" step="any" value="${li.amount ?? ""}" ${d}></td>
      ${editable ? `<td style="width:30px;"><button class="li-del btn btn-ghost" title="Remove line">✕</button></td>` : ""}
    </tr>`;
}

function fieldsHtml(r, audit) {
  const editable = ["review", "failed", "rejected"].includes(r.status);
  const conf = r.confidence;
  const d = editable ? "" : "disabled";

  const field = (label, name, value, type = "text") => `
    <div class="field ${lowConf(conf, name) ? "flagged" : ""}">
      <label>${label} ${confBadge(conf, name)}</label>
      <input class="field-input" name="${name}" type="${type}" step="any" value="${value ?? ""}" ${d}>
    </div>`;

  let actions = "";
  if (editable) actions += `<button id="save-btn" class="btn">Save changes</button>`;
  if (["review", "rejected"].includes(r.status)) actions += `<button id="submit-btn" class="btn btn-primary">Submit for approval</button>`;
  if (["failed", "review"].includes(r.status)) actions += `<button id="retry-btn" class="btn btn-ghost">↻ Re-run extraction</button>`;

  return `
    <div class="fields-head">
      <span class="fields-title">Extracted details — receipt #${r.id}</span>
      <span class="status-chip status-${r.status}">${STATUS_LABELS[r.status]}</span>
      <span class="fields-spacer"></span>
      ${stageTrack(r.status)}
    </div>
    ${r.duplicate_of_id ? `<div class="banner warn">⚠ Possible duplicate of receipt #${r.duplicate_of_id} (same file, or same merchant / date / total).</div>` : ""}
    ${r.extraction_error ? `<div class="banner error">${r.extraction_error.startsWith("Sorry") ? escapeHtml(r.extraction_error) : "Extraction failed: " + escapeHtml(r.extraction_error)}</div>` : ""}
    ${r.manager_comment ? `<div class="banner warn"><b>Manager comment:</b> ${escapeHtml(r.manager_comment)} — correct the fields below and resubmit.</div>` : ""}
    ${r.status === "uploaded" ? `<div class="banner warn">Receipt uploaded — press <b>Submit receipt</b> under the preview to send it to our AI for extraction.</div>` : ""}
    ${r.status === "processing" ? `<div class="banner warn">Our AI is reading this receipt — fields will appear here in a few seconds.</div>` : ""}
    <form id="edit-form" onsubmit="return false;">
      <div class="fields-grid">
        ${field("Merchant", "merchant", r.merchant)}
        ${field("Purchase date", "purchase_date", r.purchase_date, "date")}
        ${field("Total amount", "total_amount", r.total_amount, "number")}
        ${field("Currency", "currency", r.currency)}
        ${field("Tax", "tax_amount", r.tax_amount, "number")}
      </div>
      <div class="li-block">
        <div class="li-head">Line items ${confBadge(conf, "line_items")}
          ${editable ? `<button type="button" id="li-add" class="btn btn-ghost">+ add line</button>` : ""}</div>
        <table class="li-table" id="li-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th>${editable ? "<th></th>" : ""}</tr></thead>
          <tbody>${(r.line_items || []).map((li) => lineItemRow(li, editable)).join("")}</tbody>
        </table>
      </div>
    </form>
    <div class="actions">${actions}<span id="detail-msg"></span></div>
    <details class="audit"><summary>Audit log</summary>
      <ul>${audit.map((a) => `<li><span>${a.created_at}</span> <b>${a.actor}</b> ${a.action}${a.detail ? " — " + escapeHtml(a.detail) : ""}</li>`).join("")}</ul>
    </details>`;
}

async function selectReceipt(id, { scroll = false } = {}) {
  selectedId = id;
  renderLists();
  if (id === null) {
    $("#preview-frame").innerHTML = previewHtml(null);
    $("#preview-actions").hidden = true;
    $("#fields-card").hidden = true;
    return;
  }
  const r = await api(`/api/receipts/${id}`);
  const audit = await api(`/api/receipts/${id}/audit`);
  $("#preview-frame").innerHTML = previewHtml(r);
  $("#preview-actions").hidden = !["uploaded", "failed"].includes(r.status);
  $("#extract-status").textContent = "";
  $("#fields-card").hidden = false;
  $("#fields-card").innerHTML = fieldsHtml(r, audit);
  wireFields(r);
  if (scroll) $("#fields-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function collectForm() {
  const f = $("#edit-form");
  const num = (v) => (v === "" ? null : Number(v));
  return {
    merchant: f.merchant.value || null,
    purchase_date: f.purchase_date.value || null,
    total_amount: num(f.total_amount.value),
    currency: f.currency.value || null,
    tax_amount: num(f.tax_amount.value),
    line_items: [...$("#li-table tbody").querySelectorAll("tr")]
      .map((tr) => ({
        description: tr.querySelector(".li-desc").value,
        quantity: num(tr.querySelector(".li-qty").value),
        unit_price: num(tr.querySelector(".li-unit").value),
        amount: num(tr.querySelector(".li-amt").value),
      }))
      .filter((li) => li.description.trim() !== ""),
  };
}

function wireFields(r) {
  const msg = (t, isErr) => { const el = $("#detail-msg"); el.textContent = t; el.className = isErr ? "msg-err" : "msg-ok"; };
  const act = (fn, okText) => async () => {
    try { await fn(); await refresh(); await selectReceipt(r.id); if (okText) $("#detail-msg") && msg(okText); }
    catch (e) { msg(e.message, true); }
  };

  $("#li-add")?.addEventListener("click", () => {
    $("#li-table tbody").insertAdjacentHTML("beforeend", lineItemRow({}, true));
    wireRowDeletes();
  });
  wireRowDeletes();

  $("#save-btn")?.addEventListener("click", act(() =>
    api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) }), "Saved."));
  $("#submit-btn")?.addEventListener("click", act(async () => {
    if (["review", "failed", "rejected"].includes(r.status))
      await api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) });
    await api(`/api/receipts/${r.id}/submit`, { method: "POST" });
  }));
  $("#retry-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}/extract`, { method: "POST" })));
}

function wireRowDeletes() {
  $("#li-table tbody").querySelectorAll(".li-del").forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); b.closest("tr").remove(); };
  });
}

// ---------- manager approval modal ----------

async function openModal(id) {
  modalId = id;
  const r = await api(`/api/receipts/${id}`);
  const audit = await api(`/api/receipts/${id}/audit`);
  const conf = r.confidence;

  const ro = (label, name, value) => `
    <div class="field ${lowConf(conf, name) ? "flagged" : ""}">
      <label>${label} ${confBadge(conf, name)}</label>
      <input class="field-input" value="${value ?? ""}" disabled>
    </div>`;

  const actions = r.status === "submitted" ? `
    <button id="approve-btn" class="btn btn-primary">✓ Approve</button>
    <span class="reject-row">
      <input id="reject-comment" class="reject-input" placeholder="Rejection comment (required)…">
      <button id="reject-btn" class="btn btn-danger">Reject</button>
    </span>` : "";

  $("#detail-panel").innerHTML = `
    <div class="modal-head">
      <span class="modal-title">Receipt #${r.id} — ${escapeHtml(r.merchant || r.original_name)}</span>
      <span class="status-chip status-${r.status}">${STATUS_LABELS[r.status]}</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    ${stageTrack(r.status)}
    ${r.duplicate_of_id ? `<div class="banner warn" style="margin-top:10px;">⚠ Possible duplicate of receipt #${r.duplicate_of_id}.</div>` : ""}
    ${r.manager_comment ? `<div class="banner warn" style="margin-top:10px;"><b>Comment:</b> ${escapeHtml(r.manager_comment)}</div>` : ""}
    <div class="modal-grid">
      <div class="preview-frame">${previewHtml(r)}</div>
      <div>
        <div class="fields-grid" style="grid-template-columns:repeat(2,1fr);">
          ${ro("Merchant", "merchant", r.merchant)}
          ${ro("Purchase date", "purchase_date", r.purchase_date)}
          ${ro("Total amount", "total_amount", r.total_amount)}
          ${ro("Currency", "currency", r.currency)}
          ${ro("Tax", "tax_amount", r.tax_amount)}
        </div>
        <div class="li-block">
          <div class="li-head">Line items ${confBadge(conf, "line_items")}</div>
          <table class="li-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
            <tbody>${(r.line_items || []).map((li) => lineItemRow(li, false)).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="actions">${actions}<span id="modal-msg"></span></div>
    <details class="audit"><summary>Audit log</summary>
      <ul>${audit.map((a) => `<li><span>${a.created_at}</span> <b>${a.actor}</b> ${a.action}${a.detail ? " — " + escapeHtml(a.detail) : ""}</li>`).join("")}</ul>
    </details>`;

  $("#detail-overlay").hidden = false;

  const msg = (t, isErr) => { const el = $("#modal-msg"); el.textContent = t; el.className = isErr ? "msg-err" : "msg-ok"; };
  $("#modal-close").onclick = closeModal;
  $("#approve-btn")?.addEventListener("click", async () => {
    try { await api(`/api/receipts/${r.id}/approve`, { method: "POST" }); await refresh(); await openModal(r.id); }
    catch (e) { msg(e.message, true); }
  });
  $("#reject-btn")?.addEventListener("click", async () => {
    const comment = $("#reject-comment").value;
    try { await api(`/api/receipts/${r.id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }); await refresh(); await openModal(r.id); }
    catch (e) { msg(e.message, true); }
  });
}

function closeModal() {
  $("#detail-overlay").hidden = true;
  modalId = null;
}

// ---------- upload ----------

async function uploadFile(file) {
  const status = $("#upload-status");
  status.className = "upload-status";
  if (!ACCEPTED_EXT.test(file.name || "")) {
    status.textContent = "Unsupported file — upload a PDF, PNG, JPEG or HEIC.";
    status.classList.add("err");
    return;
  }
  status.textContent = `Uploading ${file.name}…`;
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await api("/api/receipts", { method: "POST", body: fd });
    status.textContent = "";
    await refresh();
    await selectReceipt(r.id, { scroll: true });
  } catch (err) {
    status.textContent = err.message;
    status.classList.add("err");
  }
}

// ---------- top-level wiring ----------

async function refresh() {
  receipts = await api("/api/receipts");
  renderLists();
}

function setRole(newRole) {
  role = newRole;
  $("#role-employee").classList.toggle("active", role === "employee");
  $("#role-manager").classList.toggle("active", role === "manager");
  $("#user-role").textContent = role === "employee" ? "Employee" : "Manager";
  $("#employee-view").hidden = role !== "employee";
  $("#manager-view").hidden = role !== "manager";
  $("#howto").hidden = role !== "employee";
  closeModal();
  renderLists();
}

document.addEventListener("click", (e) => {
  const row = e.target.closest(".r-table-row[data-id]");
  if (row) {
    const id = Number(row.dataset.id);
    if (role === "employee") selectReceipt(id, { scroll: true });
    else openModal(id);
  }
  if (e.target.id === "detail-overlay") closeModal();
});

$("#role-employee").onclick = () => setRole("employee");
$("#role-manager").onclick = () => setRole("manager");

$("#extract-btn").onclick = async () => {
  if (!selectedId) return;
  const id = selectedId;
  const status = $("#extract-status");
  status.className = "upload-status";
  status.textContent = "Sending to Claude…";
  $("#extract-btn").disabled = true;
  try {
    await api(`/api/receipts/${id}/extract`, { method: "POST" });
    // Follow the extraction through: uploaded -> processing -> review/failed.
    for (let i = 0; i < 45; i++) {
      await refresh();
      const r = receipts.find((x) => x.id === id);
      if (!r || !["uploaded", "processing"].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 2000));
    }
    if (selectedId === id) await selectReceipt(id);
  } catch (e) {
    status.textContent = e.message;
    status.classList.add("err");
  }
  $("#extract-btn").disabled = false;
};

const dropZone = $("#drop-zone");
dropZone.addEventListener("click", (e) => { if (!e.target.closest("button")) $("#file-input").click(); });
$("#upload-btn").onclick = (e) => { e.stopPropagation(); $("#file-input").click(); };
$("#file-input").addEventListener("change", async (e) => {
  if (e.target.files[0]) await uploadFile(e.target.files[0]);
  e.target.value = "";
});
["dragenter", "dragover"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", async (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) await uploadFile(file);
});

async function init() {
  try {
    const meta = await api("/api/meta");
    $("#provider-badge").textContent = meta.ai_provider === "claude" ? "AI · Claude" : "AI · mock";
  } catch {}
  if (location.hash === "#manager") setRole("manager");
  await refresh();
  if (role === "employee" && receipts.length) await selectReceipt(receipts[0].id);
  // Poll while anything is processing so stages advance live in the table.
  // ("uploaded" is now an idle state — it waits for the employee to submit.)
  setInterval(async () => {
    if (!receipts.some((r) => r.status === "processing")) return;
    const before = Object.fromEntries(receipts.map((r) => [r.id, r.status]));
    await refresh();
    const sel = receipts.find((r) => r.id === selectedId);
    if (sel && before[sel.id] !== sel.status) await selectReceipt(sel.id);
    const open = receipts.find((r) => r.id === modalId);
    if (open && before[open.id] !== open.status) await openModal(open.id);
  }, 2000);
}

init();
