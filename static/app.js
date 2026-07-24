/* Receipt Approval SPA — vanilla JS, no build step. */

let role = "employee";
let receipts = [];
let openId = null;

const $ = (sel) => document.querySelector(sel);

const STATUS_LABELS = {
  uploaded: "Uploaded", processing: "Processing…", failed: "Failed",
  review: "Needs review", submitted: "Submitted", approved: "Approved", rejected: "Rejected",
};

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

function confBadge(conf, field) {
  if (!conf || conf[field] === undefined) return "";
  const c = conf[field];
  const cls = c >= 0.9 ? "conf-high" : c >= 0.7 ? "conf-mid" : "conf-low";
  return `<span class="conf ${cls}" title="AI confidence">${Math.round(c * 100)}%</span>`;
}

// ---------- rendering ----------

function receiptCard(r) {
  const dup = r.duplicate_of_id ? `<span class="badge badge-warn">⚠ possible duplicate of #${r.duplicate_of_id}</span>` : "";
  return `
    <div class="card" data-id="${r.id}">
      <div class="card-top">
        <strong>#${r.id} ${r.merchant || r.original_name}</strong>
        <span class="badge status-${r.status}">${STATUS_LABELS[r.status]}</span>
      </div>
      <div class="card-sub">
        <span>${r.purchase_date || ""}</span>
        <span>${money(r.total_amount, r.currency)}</span>
      </div>
      ${dup}
      ${r.status === "rejected" && r.manager_comment ? `<div class="reject-note">Rejected: ${escapeHtml(r.manager_comment)}</div>` : ""}
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderLists() {
  if (role === "employee") {
    $("#employee-list").innerHTML =
      receipts.map(receiptCard).join("") || `<p class="empty">No receipts yet — upload one to get started.</p>`;
  } else {
    const pending = receipts.filter((r) => r.status === "submitted");
    const done = receipts.filter((r) => ["approved", "rejected"].includes(r.status));
    $("#manager-list").innerHTML = pending.map(receiptCard).join("") || `<p class="empty">Nothing awaiting approval.</p>`;
    $("#manager-done-list").innerHTML = done.map(receiptCard).join("") || `<p class="empty">No reviewed receipts yet.</p>`;
  }
}

function lineItemRow(li = {}, editable) {
  const d = editable ? "" : "disabled";
  return `
    <tr>
      <td><input class="li-desc" value="${escapeHtml(li.description ?? "")}" ${d}></td>
      <td><input class="li-qty" type="number" step="any" value="${li.quantity ?? ""}" ${d}></td>
      <td><input class="li-unit" type="number" step="any" value="${li.unit_price ?? ""}" ${d}></td>
      <td><input class="li-amt" type="number" step="any" value="${li.amount ?? ""}" ${d}></td>
      ${editable ? `<td><button class="li-del ghost">✕</button></td>` : ""}
    </tr>`;
}

async function openDetail(id) {
  openId = id;
  const r = await api(`/api/receipts/${id}`);
  const audit = await api(`/api/receipts/${id}/audit`);
  const editable = role === "employee" && ["review", "failed", "rejected"].includes(r.status);
  const conf = r.confidence;
  const d = editable ? "" : "disabled";

  const field = (label, name, value, type = "text") => `
    <label>${label} ${confBadge(conf, name)}
      <input name="${name}" type="${type}" step="any" value="${value ?? ""}" ${d}>
    </label>`;

  let actions = "";
  if (role === "employee") {
    if (editable) actions += `<button id="save-btn">Save changes</button>`;
    if (["review", "rejected"].includes(r.status)) actions += `<button id="submit-btn" class="primary">Submit for approval</button>`;
    if (["failed", "review"].includes(r.status)) actions += `<button id="retry-btn" class="ghost">Re-run extraction</button>`;
  } else if (r.status === "submitted") {
    actions = `
      <button id="approve-btn" class="primary">Approve</button>
      <button id="reject-btn" class="danger">Reject…</button>`;
  }

  $("#detail-panel").innerHTML = `
    <div class="detail-head">
      <h2>Receipt #${r.id} <span class="badge status-${r.status}">${STATUS_LABELS[r.status]}</span></h2>
      <button id="close-btn" class="ghost">✕</button>
    </div>
    ${r.duplicate_of_id ? `<div class="banner warn">⚠ Possible duplicate of receipt #${r.duplicate_of_id} (same file or same merchant/date/total).</div>` : ""}
    ${r.extraction_error ? `<div class="banner error">Extraction failed: ${escapeHtml(r.extraction_error)}</div>` : ""}
    ${r.manager_comment ? `<div class="banner warn">Manager comment: ${escapeHtml(r.manager_comment)}</div>` : ""}
    <div class="detail-grid">
      <div class="preview">
        ${r.mime_type === "application/pdf"
          ? `<a href="/api/receipts/${r.id}/file" target="_blank" class="pdf-link">📄 Open PDF (${escapeHtml(r.original_name)})</a>`
          : `<img src="/api/receipts/${r.id}/file" alt="receipt">`}
      </div>
      <form id="edit-form">
        ${field("Merchant", "merchant", r.merchant)}
        ${field("Purchase date", "purchase_date", r.purchase_date, "date")}
        ${field("Total amount", "total_amount", r.total_amount, "number")}
        ${field("Currency", "currency", r.currency)}
        ${field("Tax", "tax_amount", r.tax_amount, "number")}
        <div class="li-block">
          <div class="li-head">Line items ${confBadge(conf, "line_items")}
            ${editable ? `<button type="button" id="li-add" class="ghost">+ add</button>` : ""}</div>
          <table id="li-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th>${editable ? "<th></th>" : ""}</tr></thead>
            <tbody>${(r.line_items || []).map((li) => lineItemRow(li, editable)).join("")}</tbody>
          </table>
        </div>
      </form>
    </div>
    <div class="actions">${actions}<span id="detail-msg"></span></div>
    <details class="audit"><summary>Audit log</summary>
      <ul>${audit.map((a) => `<li><span>${a.created_at}</span> <b>${a.actor}</b> ${a.action}${a.detail ? " — " + escapeHtml(a.detail) : ""}</li>`).join("")}</ul>
    </details>`;

  $("#detail-overlay").hidden = false;
  wireDetail(r, editable);
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

function wireDetail(r, editable) {
  const msg = (t, isErr) => { const el = $("#detail-msg"); el.textContent = t; el.className = isErr ? "err" : "ok"; };
  const act = (fn) => async () => {
    try { await fn(); await refresh(); await openDetail(r.id); } catch (e) { msg(e.message, true); }
  };

  $("#close-btn").onclick = () => { $("#detail-overlay").hidden = true; openId = null; };
  if (editable) {
    $("#li-add")?.addEventListener("click", () => {
      $("#li-table tbody").insertAdjacentHTML("beforeend", lineItemRow({}, true));
      wireRowDeletes();
    });
    wireRowDeletes();
  }
  $("#save-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) })));
  $("#submit-btn")?.addEventListener("click", act(async () => {
    if (editable) await api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) });
    await api(`/api/receipts/${r.id}/submit`, { method: "POST" });
  }));
  $("#retry-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}/retry`, { method: "POST" })));
  $("#approve-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}/approve`, { method: "POST" })));
  $("#reject-btn")?.addEventListener("click", async () => {
    const comment = prompt("Rejection comment (required):");
    if (comment === null) return;
    try {
      await api(`/api/receipts/${r.id}/reject`, { method: "POST", body: JSON.stringify({ comment }) });
      await refresh(); await openDetail(r.id);
    } catch (e) { msg(e.message, true); }
  });
}

function wireRowDeletes() {
  $("#li-table tbody").querySelectorAll(".li-del").forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); b.closest("tr").remove(); };
  });
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
  $("#employee-view").hidden = role !== "employee";
  $("#manager-view").hidden = role !== "manager";
  $("#detail-overlay").hidden = true;
  renderLists();
}

document.addEventListener("click", (e) => {
  const card = e.target.closest(".card[data-id]");
  if (card) openDetail(Number(card.dataset.id));
  if (e.target.id === "detail-overlay") { $("#detail-overlay").hidden = true; openId = null; }
});

$("#role-employee").onclick = () => setRole("employee");
$("#role-manager").onclick = () => setRole("manager");
$("#upload-btn").onclick = () => $("#file-input").click();
$("#file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  $("#upload-status").textContent = "Uploading…";
  try {
    await api("/api/receipts", { method: "POST", body: fd });
    $("#upload-status").textContent = "";
    await refresh();
  } catch (err) {
    $("#upload-status").textContent = err.message;
  }
  e.target.value = "";
});

async function init() {
  try {
    const meta = await api("/api/meta");
    $("#provider-badge").textContent = meta.ai_provider === "claude" ? "AI: Claude" : "AI: mock";
  } catch {}
  await refresh();
  // Poll while anything is still processing so statuses advance live.
  setInterval(async () => {
    if (receipts.some((r) => ["uploaded", "processing"].includes(r.status))) {
      await refresh();
      if (openId) {
        const open = receipts.find((r) => r.id === openId);
        if (open && !["uploaded", "processing"].includes(open.status)) openDetail(openId);
      }
    }
  }, 2000);
}

init();
