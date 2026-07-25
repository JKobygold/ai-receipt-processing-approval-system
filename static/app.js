/* Rajant Receipt Portal SPA — vanilla JS, no build step. */

let role = "employee";
let receipts = [];
let selectedId = null;   // employee: receipt open in preview + Extracted details (via Edit)
let expandedId = null;   // employee: receipt expanded inline in the table (via row click)
let modalId = null;      // manager: receipt open in the approval modal
let pendingFile = null;  // staged file shown in the preview but NOT yet uploaded
let pendingUrl = null;   // object URL for the staged file's local preview
let receiptSort = "merchant-asc";
const selectedReceiptIds = new Set();
let activeCameraStream = null;

const $ = (sel) => document.querySelector(sel);
const ROLE_PROFILES = {
  employee: { name: "Employee #427 - Parable, Stanley", role: "Employee", initials: "SP" },
  manager: { name: "Manager", role: "Manager", initials: "MG" },
};

const STATUS_LABELS = {
  uploaded: "Uploaded", processing: "Processing…", failed: "Failed",
  review: "Needs review", submitted: "Submitted", approved: "Approved", rejected: "Rejected",
};
const STAGES = ["uploaded", "processing", "review", "submitted"];
const STAGE_SORT = { uploaded: 0, processing: 1, failed: 2, review: 3, rejected: 4, submitted: 5, approved: 6 };
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").replace("Z", "");
  return date.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const CONFIDENCE_HELP = {
  merchant: {
    label: "Merchant name",
    basis: "The AI looks for the store name in the receipt header, logo text, payment descriptor, or repeated merchant text.",
  },
  purchase_date: {
    label: "Purchase date",
    basis: "The AI compares visible date-like text and favors the date most likely attached to the purchase or transaction.",
  },
  total_amount: {
    label: "Total amount",
    basis: "The AI looks for the final amount charged, usually near labels like total, amount due, paid, or card charge.",
  },
  currency: {
    label: "Currency",
    basis: "The AI infers currency from printed symbols, ISO codes, merchant locale, and amount formatting.",
  },
  tax_amount: {
    label: "Tax",
    basis: "The AI looks for explicit tax, VAT, GST, or sales tax lines and avoids confusing tax with subtotal or total.",
  },
  line_items: {
    label: "Line items",
    basis: "The AI scores the extracted item list as a whole based on row readability, quantities, prices, and whether the item totals match the receipt.",
  },
};

function confBadge(conf, field, label = CONFIDENCE_HELP[field]?.label || field) {
  const raw = conf && typeof conf[field] === "number" ? conf[field] : null;
  if (raw === null) {
    return `<button type="button" class="conf conf-na" data-conf-field="${field}" data-conf-label="${escapeHtml(label)}" data-conf-score="" title="AI confidence details">N/A</button>`;
  }
  const c = Math.max(0, Math.min(1, raw));
  const cls = c >= 0.9 ? "conf-high" : c >= 0.7 ? "conf-mid" : "conf-low";
  return `<button type="button" class="conf ${cls}" data-conf-field="${field}" data-conf-label="${escapeHtml(label)}" data-conf-score="${c}" title="AI confidence details">${Math.round(c * 100)}%</button>`;
}

function confidenceTier(score) {
  if (score === null) return "No score";
  if (score >= 0.9) return "High confidence";
  if (score >= 0.7) return "Medium confidence";
  return "Low confidence";
}

function openConfidenceModal(field, label, scoreValue) {
  const score = scoreValue === "" ? null : Number(scoreValue);
  const help = CONFIDENCE_HELP[field] || { basis: "The AI rated this field from evidence visible in the receipt." };
  const displayScore = score === null ? "N/A" : `${Math.round(score * 100)}%`;
  let overlay = $("#conf-overlay");
  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", `<div id="conf-overlay" class="confidence-overlay" hidden></div>`);
    overlay = $("#conf-overlay");
  }
  overlay.innerHTML = `
    <div class="confidence-card" role="dialog" aria-modal="true" aria-labelledby="confidence-title">
      <div class="modal-head">
        <span id="confidence-title" class="modal-title">${escapeHtml(label)} confidence</span>
        <button type="button" class="modal-close conf-close" title="Close">✕</button>
      </div>
      <div class="confidence-score">${displayScore}</div>
      <p><b>${confidenceTier(score)}.</b> This number comes from the receipt-processing AI's structured JSON response at <code>confidence.${escapeHtml(field)}</code>, scored from 0.0 to 1.0.</p>
      <p>${escapeHtml(help.basis)}</p>
      <p>Use this as a review signal, not a guarantee. Lower scores mean the field deserves a closer look against the receipt preview.</p>
    </div>`;
  overlay.hidden = false;
  overlay.querySelector(".conf-close").focus();
}

function closeConfidenceModal() {
  const overlay = $("#conf-overlay");
  if (overlay) overlay.hidden = true;
}

function receiptDisplayName(r) {
  return r.receipt_name || r.merchant || r.original_name || `Receipt #${r.id}`;
}

// Flag a field yellow when the extractor wasn't confident about it.
function lowConf(conf, field) {
  return conf && conf[field] !== undefined && conf[field] < 0.9;
}

function isNotReceiptError(err) {
  return typeof err === "string" && err.startsWith("Sorry");
}

// "Sorry — this is not a receipt.\n• reason\n• reason" -> banner with bullet list
function rejectionBanner(err) {
  const [title, ...rest] = err.split("\n");
  const bullets = rest.map((l) => l.replace(/^•\s*/, "").trim()).filter(Boolean);
  return `<div class="banner error"><b>${escapeHtml(title)}</b>
    ${bullets.length ? `<div class="reject-just">Justification of rejection:</div>
      <ul class="reject-reasons">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
  </div>`;
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

function tableRow(r, withEdit) {
  const dup = r.duplicate_of_id ? `<div class="rt-flags"><span class="badge-dup">⚠ possible duplicate of #${r.duplicate_of_id}</span></div>` : "";
  const rejected = r.status === "rejected" && r.manager_comment
    ? `<div class="rt-flags"><span class="badge-dup" style="color:var(--danger);border-color:#e3b6ad;background:#f7e3df;">Manager: ${escapeHtml(r.manager_comment)}</span></div>` : "";
  const notReceipt = r.status === "failed" && r.extraction_error?.startsWith("Sorry")
    ? `<div class="rt-flags"><span class="badge-dup" style="color:var(--danger);border-color:#e3b6ad;background:#f7e3df;">Not a receipt</span></div>` : "";
  return `
    <div class="r-table-row ${r.id === expandedId && role === "employee" ? "selected" : ""}" data-id="${r.id}">
      ${withEdit ? `<span class="rt-select">
        <input type="checkbox" data-select="${r.id}" aria-label="Select receipt #${r.id}" ${selectedReceiptIds.has(r.id) ? "checked" : ""}>
      </span>` : ""}
      <span class="rt-id">#${r.id}</span>
      <span class="rt-merchant">${escapeHtml(receiptDisplayName(r))}
        <span class="rt-file">${escapeHtml(r.original_name)}</span>${dup}${rejected}${notReceipt}
      </span>
      <span class="rt-date">${r.purchase_date || "—"}</span>
      <span class="rt-total">${r.total_amount != null ? Number(r.total_amount).toFixed(2) : "—"}</span>
      <span class="rt-currency">${escapeHtml(r.currency || "—")}</span>
      <span class="rt-tax">${r.tax_amount != null ? Number(r.tax_amount).toFixed(2) : "—"}</span>
      <span class="rt-items" title="${escapeHtml((r.line_items || []).map((li) => li.description).join(", "))}">${(r.line_items || []).length || "—"}</span>
      <span class="rt-stage">${stageTrack(r.status)}</span>
      <span class="rt-actions">
        <button class="btn rt-audit" data-audit="${r.id}" title="View submission audit and manager response">Audit</button>
        ${withEdit ? `
        <button class="btn rt-edit" data-edit="${r.id}" title="Open in the review panel to edit fields">✎ Edit</button>
        <button class="btn rt-delete" data-delete="${r.id}" title="Delete this receipt">Delete</button>
        ` : ""}
      </span>
    </div>`;
}

// Inline expansion under the selected row — the full record, read-only.
function expandHtml(r) {
  const cell = (label, value) => `
    <div class="rx-cell"><span class="rx-label">${label}</span><span class="rx-value">${value}</span></div>`;
  const items = (r.line_items || []);
  return `<div class="r-expand">
    <div class="rx-grid">
      ${cell("Merchant name", escapeHtml(r.merchant || "—"))}
      ${cell("Purchase date", r.purchase_date || "—")}
      ${cell("Total amount", r.total_amount != null ? Number(r.total_amount).toFixed(2) : "—")}
      ${cell("Currency", escapeHtml(r.currency || "—"))}
      ${cell("Tax", r.tax_amount != null ? Number(r.tax_amount).toFixed(2) : "—")}
      ${cell("File", escapeHtml(r.original_name))}
      ${cell("Uploaded", formatTimestamp(r.created_at))}
      ${cell("Status", STATUS_LABELS[r.status])}
    </div>
    ${items.length ? `
      <table class="li-table rx-items-table">
        <thead><tr><th>Line item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>${items.map((li) => `<tr>
          <td>${escapeHtml(li.description || "")}</td>
          <td>${li.quantity ?? "—"}</td>
          <td>${li.unit_price != null ? Number(li.unit_price).toFixed(2) : "—"}</td>
          <td>${li.amount != null ? Number(li.amount).toFixed(2) : "—"}</td>
        </tr>`).join("")}</tbody>
      </table>` : `<div class="rx-no-items">No line items extracted.</div>`}
    ${r.manager_comment ? `<div class="banner warn" style="margin:10px 0 0;"><b>Manager comment:</b> ${escapeHtml(r.manager_comment)}</div>` : ""}
    ${r.employee_note ? `<div class="banner warn" style="margin:10px 0 0;"><b>Note to manager:</b> ${escapeHtml(r.employee_note)}</div>` : ""}
    ${r.extraction_error ? `<div style="margin-top:10px;">${isNotReceiptError(r.extraction_error)
      ? rejectionBanner(r.extraction_error)
      : `<div class="banner error">${escapeHtml(r.extraction_error)}</div>`}</div>` : ""}
  </div>`;
}

function receiptTable(rows, emptyText, expandable) {
  if (!rows.length) return `<p class="r-empty">${emptyText}</p>`;
  const selectedCount = selectedReceiptIds.size;
  return `
    <div class="r-table-header">
      ${expandable ? `<span class="rt-select"></span>` : ""}
      <span class="rt-id">#</span>
      <span class="rt-merchant">Merchant / file</span>
      <span class="rt-date">Date</span>
      <span class="rt-total" style="color:var(--gold-100);font-family:inherit;">Total</span>
      <span class="rt-currency">Currency</span>
      <span class="rt-tax">Tax</span>
      <span class="rt-items">Items</span>
      <span class="rt-stage" style="justify-content:flex-end;">Stage</span>
      <span class="rt-actions">
      ${expandable ? `
        <button id="delete-selected-btn" class="btn btn-danger bulk-delete-btn" ${selectedCount ? "" : "hidden"}>
          Delete selected${selectedCount ? ` (${selectedCount})` : ""}
        </button>
      ` : "Actions"}
      </span>
    </div>
    ${rows.map((r) => tableRow(r, expandable) + (expandable && r.id === expandedId ? expandHtml(r) : "")).join("")}`;
}

function sortedReceipts(rows) {
  const text = (value) => (value || "").toLocaleLowerCase();
  const dateValue = (r) => Date.parse(r.purchase_date || r.created_at || "") || 0;
  const totalValue = (r) => r.total_amount == null ? Number.POSITIVE_INFINITY : Number(r.total_amount);
  const byIdDesc = (a, b) => b.id - a.id;

  return [...rows].sort((a, b) => {
    let result = 0;
    if (receiptSort === "merchant-asc") {
      result = text(receiptDisplayName(a)).localeCompare(text(receiptDisplayName(b)));
    } else if (receiptSort === "date-desc") {
      result = dateValue(b) - dateValue(a);
    } else if (receiptSort === "date-asc") {
      result = dateValue(a) - dateValue(b);
    } else if (receiptSort === "total-asc") {
      result = totalValue(a) - totalValue(b);
    } else if (receiptSort === "total-desc") {
      result = totalValue(b) - totalValue(a);
    } else if (receiptSort === "stage-asc") {
      result = (STAGE_SORT[a.status] ?? 99) - (STAGE_SORT[b.status] ?? 99);
    }
    return result || byIdDesc(a, b);
  });
}

function renderLists() {
  if (role === "employee") {
    $("#employee-table").innerHTML = receiptTable(sortedReceipts(receipts), "No receipts yet — upload one to get started.", true);
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

function showImportMode() {
  $("#import-card-header").textContent = "Import file";
  $("#drop-zone").hidden = false;
  $(".import-actions").hidden = false;
  $("#preview-frame").hidden = true;
  $("#preview-frame").innerHTML = "";
  $("#preview-actions").hidden = true;
  $("#extract-status").textContent = "";
}

function showPreviewMode(title = "Receipt preview") {
  $("#import-card-header").textContent = title;
  $("#drop-zone").hidden = true;
  $(".import-actions").hidden = true;
  $("#preview-frame").hidden = false;
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
      <label>${label} ${name === "receipt_name" ? "" : confBadge(conf, name, label)}</label>
      <input class="field-input" name="${name}" type="${type}" step="any" value="${escapeHtml(value ?? "")}" ${d}>
    </div>`;

  let actions = "";
  if (editable) actions += `<button id="save-btn" class="btn">Save changes</button>`;
  if (["review", "rejected"].includes(r.status)) actions += `<button id="submit-btn" class="btn btn-primary">Submit for approval</button>`;
  if (r.status === "failed" && isNotReceiptError(r.extraction_error))
    actions += `<button id="override-btn" class="btn btn-gold" title="Disagree with the AI? Send this back into review and fill the fields manually.">Override — this IS a receipt</button>`;
  if (["failed", "review"].includes(r.status)) actions += `<button id="retry-btn" class="btn btn-ghost">↻ Re-run extraction</button>`;

  return `
    <div class="modal-head">
      <span class="modal-title">Extracted details</span>
      <span class="status-chip status-${r.status}">${STATUS_LABELS[r.status]}</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    <div class="fields-head">
      <span class="fields-title">Name receipt</span>
      ${stageTrack(r.status)}
    </div>
    ${r.duplicate_of_id ? `<div class="banner warn">⚠ Possible duplicate of receipt #${r.duplicate_of_id} (same file, or same merchant / date / total).</div>` : ""}
    ${r.extraction_error ? (isNotReceiptError(r.extraction_error)
      ? rejectionBanner(r.extraction_error)
      : `<div class="banner error">Extraction failed: ${escapeHtml(r.extraction_error)}</div>`) : ""}
    ${r.manager_comment ? `<div class="banner warn"><b>Manager comment:</b> ${escapeHtml(r.manager_comment)} — correct the fields below and resubmit.</div>` : ""}
    ${r.status === "uploaded" ? `<div class="banner warn">Receipt uploaded — press <b>Submit for AI extraction</b> under the preview to send it to our AI.</div>` : ""}
    ${r.status === "processing" ? `<div class="banner warn">Our AI is reading this receipt — fields will appear here in a few seconds.</div>` : ""}
    <div class="receipt-meta-grid">
      <div class="receipt-meta-cell"><span>Uploaded</span><b>${formatTimestamp(r.created_at)}</b></div>
      <div class="receipt-meta-cell"><span>File</span><b>${escapeHtml(r.original_name)}</b></div>
      <div class="receipt-meta-cell"><span>Last updated</span><b>${formatTimestamp(r.updated_at)}</b></div>
    </div>
    <div class="employee-review-grid">
      <form id="edit-form" onsubmit="return false;">
        <div class="fields-grid">
          ${field("Receipt name", "receipt_name", r.receipt_name || receiptDisplayName(r))}
          ${field("Merchant name", "merchant", r.merchant)}
          ${field("Purchase date", "purchase_date", r.purchase_date, "date")}
          ${field("Total amount", "total_amount", r.total_amount, "number")}
          ${field("Currency", "currency", r.currency)}
          ${field("Tax", "tax_amount", r.tax_amount, "number")}
        </div>
        <div class="li-block">
          <div class="li-head">Line items ${confBadge(conf, "line_items", "Line items")}
            ${editable ? `<button type="button" id="li-add" class="btn btn-ghost">+ add line</button>` : ""}</div>
          <table class="li-table" id="li-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th>${editable ? "<th></th>" : ""}</tr></thead>
            <tbody>${(r.line_items || []).map((li) => lineItemRow(li, editable)).join("")}</tbody>
          </table>
        </div>
      </form>
      <aside class="modal-receipt-preview" aria-label="Receipt preview for comparison">
        <div class="li-head">Receipt preview</div>
        <div class="preview-frame">${previewHtml(r)}</div>
      </aside>
    </div>
    <div class="actions">${actions}<span id="detail-msg"></span></div>
    ${r.status !== "approved" ? `
    <div class="msg-manager">
      <button id="msg-open" class="btn">Message to manager</button>
      <span id="msg-status" class="${r.employee_note ? "msg-ok" : ""}">${r.employee_note ? "Message saved." : ""}</span>
    </div>` : ""}
    <details class="audit"><summary>Audit log</summary>
      <ul>${audit.map((a) => `<li><span>${a.created_at}</span> <b>${a.actor}</b> ${a.action}${a.detail ? " — " + escapeHtml(a.detail) : ""}</li>`).join("")}</ul>
    </details>`;
}

async function selectReceipt(id, { scroll = false } = {}) {
  clearStaged();
  selectedId = id;
  renderLists();
  if (id === null) {
    showImportMode();
    $("#fields-card").hidden = true;
    return;
  }
  const r = await api(`/api/receipts/${id}`);
  const audit = await api(`/api/receipts/${id}/audit`);
  showPreviewMode("Receipt preview");
  $("#preview-frame").innerHTML = previewHtml(r);
  $("#preview-actions").hidden = !["uploaded", "failed"].includes(r.status);
  $("#extract-status").textContent = "";
  $("#fields-card").hidden = true;
  $("#fields-card").innerHTML = "";
  $("#detail-panel").classList.add("employee-detail-modal");
  $("#detail-panel").innerHTML = fieldsHtml(r, audit);
  $("#detail-overlay").hidden = false;
  wireFields(r);
  if (scroll) $("#detail-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function collectForm() {
  const f = $("#edit-form");
  const num = (v) => (v === "" ? null : Number(v));
  return {
    receipt_name: f.receipt_name.value.trim() || null,
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

  $("#modal-close")?.addEventListener("click", closeModal);
  $("#li-add")?.addEventListener("click", () => {
    $("#li-table tbody").insertAdjacentHTML("beforeend", lineItemRow({}, true));
    wireRowDeletes();
  });
  wireRowDeletes();

  $("#save-btn")?.addEventListener("click", act(() =>
    api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) }), "Saved."));
  $("#submit-btn")?.addEventListener("click", async () => {
    try {
      if (["review", "failed", "rejected"].includes(r.status))
        await api(`/api/receipts/${r.id}`, { method: "PATCH", body: JSON.stringify(collectForm()) });
      await api(`/api/receipts/${r.id}/submit`, { method: "POST" });
      closeModal();
      selectedId = null;
      expandedId = null;
      showImportMode();
      await refresh();
    } catch (e) {
      msg(e.message, true);
    }
  });
  $("#retry-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}/extract`, { method: "POST" })));
  $("#override-btn")?.addEventListener("click", act(() => api(`/api/receipts/${r.id}/override`, { method: "POST" })));
  $("#msg-open")?.addEventListener("click", () => openMessageModal(r));
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

  $("#detail-panel").classList.remove("employee-detail-modal");
  $("#detail-panel").innerHTML = `
    <div class="modal-head">
      <span class="modal-title">${escapeHtml(receiptDisplayName(r))}</span>
      <span class="status-chip status-${r.status}">${STATUS_LABELS[r.status]}</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    ${stageTrack(r.status)}
    <div class="receipt-meta-grid modal-meta-grid">
      <div class="receipt-meta-cell"><span>Uploaded</span><b>${formatTimestamp(r.created_at)}</b></div>
      <div class="receipt-meta-cell"><span>File</span><b>${escapeHtml(r.original_name)}</b></div>
      <div class="receipt-meta-cell"><span>Submitted</span><b>${formatTimestamp(r.submitted_at)}</b></div>
    </div>
    ${r.duplicate_of_id ? `<div class="banner warn" style="margin-top:10px;">⚠ Possible duplicate of receipt #${r.duplicate_of_id}.</div>` : ""}
    ${r.manager_comment ? `<div class="banner warn" style="margin-top:10px;"><b>Comment:</b> ${escapeHtml(r.manager_comment)}</div>` : ""}
    ${r.employee_note ? `<div class="banner warn" style="margin-top:10px;"><b>Note from employee:</b> ${escapeHtml(r.employee_note)}</div>` : ""}
    <div class="modal-grid">
      <div class="preview-frame">${previewHtml(r)}</div>
      <div>
        <div class="fields-grid" style="grid-template-columns:repeat(2,1fr);">
          ${ro("Merchant name", "merchant", r.merchant)}
          ${ro("Purchase date", "purchase_date", r.purchase_date)}
          ${ro("Total amount", "total_amount", r.total_amount)}
          ${ro("Currency", "currency", r.currency)}
          ${ro("Tax", "tax_amount", r.tax_amount)}
        </div>
        <div class="li-block">
          <div class="li-head">Line items ${confBadge(conf, "line_items", "Line items")}</div>
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

function auditActionLabel(action) {
  return {
    uploaded: "Uploaded",
    extraction_requested: "AI extraction requested",
    processing_started: "AI processing started",
    extraction_completed: "AI extraction completed",
    extraction_failed: "AI extraction failed",
    not_a_receipt: "Rejected by AI as non-receipt",
    duplicate_flagged: "Duplicate flagged",
    edited: "Employee edited fields",
    message_to_manager: "Employee messaged manager",
    rejection_overridden: "Employee overrode AI rejection",
    submitted: "Submitted for manager approval",
    approved: "Manager approved",
    rejected: "Manager rejected",
  }[action] || action.replaceAll("_", " ");
}

function managerResponseHtml(r, audit) {
  const response = audit.find((a) => ["approved", "rejected"].includes(a.action));
  if (r.status === "submitted" && !response) {
    return `<div class="audit-response pending"><b>Waiting for manager response.</b><span>The receipt was submitted and is still in the manager queue.</span></div>`;
  }
  if (response?.action === "approved" || r.status === "approved") {
    return `<div class="audit-response approved"><b>Approved by manager.</b><span>${escapeHtml(response?.detail || "Manager approved the submitted receipt.")}</span></div>`;
  }
  if (response?.action === "rejected" || r.status === "rejected") {
    return `<div class="audit-response rejected"><b>Rejected by manager.</b><span>${escapeHtml(r.manager_comment || response?.detail || "No rejection comment was recorded.")}</span></div>`;
  }
  return `<div class="audit-response neutral"><b>No manager response yet.</b><span>This receipt has not been submitted for manager review.</span></div>`;
}

async function openSubmissionAudit(id) {
  const r = await api(`/api/receipts/${id}`);
  const audit = await api(`/api/receipts/${id}/audit`);
  const submitted = audit.find((a) => a.action === "submitted");
  $("#detail-panel").classList.remove("employee-detail-modal");
  $("#detail-panel").innerHTML = `
    <div class="modal-head">
      <span class="modal-title">Submission audit — ${escapeHtml(receiptDisplayName(r))}</span>
      <span class="status-chip status-${r.status}">${STATUS_LABELS[r.status]}</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    <div class="receipt-meta-grid modal-meta-grid">
      <div class="receipt-meta-cell"><span>Submitted</span><b>${formatTimestamp(r.submitted_at || submitted?.created_at)}</b></div>
      <div class="receipt-meta-cell"><span>Manager reviewed</span><b>${formatTimestamp(r.reviewed_at)}</b></div>
      <div class="receipt-meta-cell"><span>Total</span><b>${r.total_amount != null ? `${escapeHtml(r.currency || "")} ${Number(r.total_amount).toFixed(2)}` : "—"}</b></div>
    </div>
    ${managerResponseHtml(r, audit)}
    ${r.employee_note ? `<div class="banner warn" style="margin-top:10px;"><b>Employee note:</b> ${escapeHtml(r.employee_note)}</div>` : ""}
    <div class="audit-panel">
      <div class="li-head">Full receipt audit log</div>
      <ul class="audit-timeline">
        ${audit.map((a) => `<li class="audit-event action-${a.action}">
          <span class="audit-time">${formatTimestamp(a.created_at)}</span>
          <b>${escapeHtml(a.actor)}</b>
          <strong>${escapeHtml(auditActionLabel(a.action))}</strong>
          ${a.detail ? `<p>${escapeHtml(a.detail)}</p>` : ""}
        </li>`).join("")}
      </ul>
    </div>`;
  $("#detail-overlay").hidden = false;
  $("#modal-close").onclick = closeModal;
}

function closeModal() {
  stopCameraStream();
  $("#detail-overlay").hidden = true;
  $("#detail-panel").classList.remove("employee-detail-modal");
  modalId = null;
}

function stopCameraStream() {
  if (!activeCameraStream) return;
  activeCameraStream.getTracks().forEach((track) => track.stop());
  activeCameraStream = null;
}

function openMessageModal(r) {
  const current = escapeHtml(r.employee_note || "");
  $("#detail-panel").classList.remove("employee-detail-modal");
  $("#detail-panel").innerHTML = `
    <div class="modal-head">
      <span class="modal-title">Message to manager — ${escapeHtml(receiptDisplayName(r))}</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    <div class="message-modal-body">
      <textarea id="mgr-msg" class="msg-input msg-input-modal" rows="6"
        placeholder="Add a note about this receipt for your manager...">${current}</textarea>
      <div class="msg-meta">
        <span class="msg-hint">Please be clear and concise in your communication.</span>
        <span id="msg-count" class="msg-count"></span>
      </div>
      <div class="actions">
        <button id="msg-submit" class="btn btn-primary">Submit message</button>
        <button id="msg-cancel" class="btn btn-ghost">Cancel</button>
        <span id="modal-msg"></span>
      </div>
    </div>`;
  $("#detail-overlay").hidden = false;
  $("#modal-close").onclick = closeModal;
  $("#msg-cancel").onclick = closeModal;

  const msgBox = $("#mgr-msg");
  const LIMIT = 100;
  const words = (t) => t.trim().split(/\s+/).filter(Boolean);
  const updateCount = () => {
    let w = words(msgBox.value);
    if (w.length > LIMIT) {
      msgBox.value = w.slice(0, LIMIT).join(" ");
      w = words(msgBox.value);
    }
    const el = $("#msg-count");
    el.textContent = `${w.length}/${LIMIT} words`;
    el.classList.toggle("msg-limit", w.length >= LIMIT);
  };
  msgBox.addEventListener("input", updateCount);
  updateCount();
  msgBox.focus();

  $("#msg-submit").onclick = async () => {
    const submit = $("#msg-submit");
    const status = $("#modal-msg");
    submit.disabled = true;
    status.textContent = "";
    try {
      await api(`/api/receipts/${r.id}/message`, { method: "POST", body: JSON.stringify({ text: msgBox.value }) });
      await refresh();
      closeModal();
      await selectReceipt(r.id);
      const detailMsg = $("#detail-msg");
      if (detailMsg) {
        detailMsg.textContent = "Message sent.";
        detailMsg.className = "msg-ok";
      }
      const inlineStatus = $("#msg-status");
      if (inlineStatus) {
        inlineStatus.textContent = "Message sent.";
        inlineStatus.className = "msg-ok";
      }
    } catch (e) {
      submit.disabled = false;
      status.textContent = e.message;
      status.className = "msg-err";
    }
  };
}

async function openCameraModal() {
  $("#detail-panel").classList.remove("employee-detail-modal");
  $("#detail-panel").innerHTML = `
    <div class="modal-head">
      <span class="modal-title">Take receipt photo</span>
      <button id="modal-close" class="modal-close" title="Close">✕</button>
    </div>
    <div class="camera-modal-body">
      <video id="camera-video" class="camera-video" autoplay playsinline muted></video>
      <div id="camera-status" class="upload-status"></div>
      <div id="camera-help" class="camera-help" hidden></div>
      <div class="actions">
        <button id="camera-capture" class="btn btn-primary" disabled>Capture photo</button>
        <button id="camera-retry" class="btn btn-gold" hidden>Request permission again</button>
        <button id="camera-fallback" class="btn">Choose image</button>
        <button id="camera-cancel" class="btn btn-ghost">Cancel</button>
      </div>
    </div>`;
  $("#detail-overlay").hidden = false;
  $("#modal-close").onclick = closeModal;
  $("#camera-cancel").onclick = closeModal;
  $("#camera-fallback").onclick = () => {
    closeModal();
    $("#camera-input").click();
  };

  const status = $("#camera-status");
  const video = $("#camera-video");
  const help = $("#camera-help");
  const capture = $("#camera-capture");
  const retry = $("#camera-retry");

  const requestCamera = async () => {
    stopCameraStream();
    capture.disabled = true;
    retry.hidden = true;
    help.hidden = true;
    help.textContent = "";
    status.classList.remove("err");
    status.textContent = "Requesting camera permission...";

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by this browser.");
      activeCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = activeCameraStream;
      await video.play();
      status.textContent = "Camera ready.";
      capture.disabled = false;
    } catch (e) {
      const denied = e.name === "NotAllowedError" || e.name === "PermissionDeniedError";
      const insecure = location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname);
      status.textContent = denied ? "Camera permission is blocked for this site." : e.message;
      status.classList.add("err");
      help.hidden = false;
      help.textContent = denied
        ? "Use the browser camera icon or site settings to allow camera access for localhost, then request permission again. You can also choose an image from this device."
        : insecure
          ? "Camera access requires HTTPS, except on localhost. Run the app on localhost or deploy over HTTPS."
          : "You can still choose an image from this device.";
      retry.hidden = false;
    }
  };

  retry.onclick = requestCamera;
  await requestCamera();

  $("#camera-capture").onclick = async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported by this browser.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        status.textContent = "Could not capture photo. Try again.";
        status.classList.add("err");
        return;
      }
      const file = new File([blob], `camera-receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
      closeModal();
      stageFile(file);
    }, "image/jpeg", 0.92);
  };
}

// ---------- staging / upload ----------

function clearStaged() {
  if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  pendingFile = null;
  pendingUrl = null;
}

// Show a chosen file in the preview WITHOUT uploading it. Nothing hits
// "My receipts" until the employee presses Submit receipt (see #extract-btn).
function stageFile(file) {
  const status = $("#upload-status");
  status.className = "upload-status";
  const looksLikeCameraImage = file.type && file.type.startsWith("image/");
  if (!ACCEPTED_EXT.test(file.name || "") && !looksLikeCameraImage) {
    status.textContent = "Unsupported file — upload a PDF, PNG, JPEG or HEIC.";
    status.classList.add("err");
    return;
  }
  clearStaged();
  pendingFile = file;
  pendingUrl = URL.createObjectURL(file);
  selectedId = null;
  status.textContent = "Ready — press Submit for AI extraction.";

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  showPreviewMode("Receipt preview");
  $("#preview-frame").innerHTML = isPdf
    ? `<div class="pdf-wrap"><iframe class="pdf-embed" src="${pendingUrl}#toolbar=0&navpanes=0" title="Staged receipt"></iframe></div>`
    : `<img src="${pendingUrl}" alt="Staged receipt">`;
  $("#preview-actions").hidden = false;
  $("#extract-status").textContent = "";
  $("#fields-card").hidden = true;
}

// ---------- top-level wiring ----------

async function refresh() {
  receipts = await api("/api/receipts");
  const liveIds = new Set(receipts.map((r) => r.id));
  [...selectedReceiptIds].forEach((id) => {
    if (!liveIds.has(id)) selectedReceiptIds.delete(id);
  });
  renderLists();
}

function setRole(newRole) {
  role = newRole;
  $("#role-employee").classList.toggle("active", role === "employee");
  $("#role-manager").classList.toggle("active", role === "manager");
  const profile = ROLE_PROFILES[role];
  $("#user-name").textContent = profile.name;
  $("#user-role").textContent = profile.role;
  $("#topbar-avatar").textContent = profile.initials;
  $("#employee-view").hidden = role !== "employee";
  $("#manager-view").hidden = role !== "manager";
  $("#howto").hidden = role !== "employee";
  closeModal();
  renderLists();
}

async function enterApp(newRole) {
  setRole(newRole);
  $("#login-screen").hidden = true;
  $("#main-app").hidden = false;
  await refresh();
  const deepLink = location.hash.match(/^#r(\d+)$/);
  if (deepLink && role === "employee") {
    expandedId = Number(deepLink[1]);
    await selectReceipt(expandedId);
  }
}

function showLogin() {
  clearStaged();
  closeModal();
  selectedId = null;
  expandedId = null;
  $("#main-app").hidden = true;
  $("#login-screen").hidden = false;
}

document.addEventListener("click", (e) => {
  const confBtn = e.target.closest("[data-conf-field]");
  if (confBtn) {
    e.preventDefault();
    e.stopPropagation();
    openConfidenceModal(confBtn.dataset.confField, confBtn.dataset.confLabel, confBtn.dataset.confScore);
    return;
  }
  if (e.target.closest(".conf-close") || e.target.id === "conf-overlay") {
    e.preventDefault();
    e.stopPropagation();
    closeConfidenceModal();
    return;
  }
  const bulkDeleteBtn = e.target.closest("#delete-selected-btn");
  if (bulkDeleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    deleteSelectedReceipts();
    return;
  }
  const selectBox = e.target.closest("[data-select]");
  if (selectBox) {
    e.stopPropagation();
    const id = Number(selectBox.dataset.select);
    if (selectBox.checked) selectedReceiptIds.add(id);
    else selectedReceiptIds.delete(id);
    renderLists();
    return;
  }
  const deleteBtn = e.target.closest("[data-delete]");
  if (deleteBtn) {
    e.preventDefault();
    e.stopPropagation();
    deleteReceipt(Number(deleteBtn.dataset.delete));
    return;
  }
  const auditBtn = e.target.closest("[data-audit]");
  if (auditBtn) {
    e.preventDefault();
    e.stopPropagation();
    openSubmissionAudit(Number(auditBtn.dataset.audit));
    return;
  }
  const editBtn = e.target.closest("[data-edit]");
  if (editBtn) {
    selectReceipt(Number(editBtn.dataset.edit), { scroll: true });
    return;
  }
  const row = e.target.closest(".r-table-row[data-id]");
  if (row) {
    const id = Number(row.dataset.id);
    if (role === "employee") {
      // Row click only expands/collapses the inline record — editing is via ✎ Edit.
      expandedId = expandedId === id ? null : id;
      renderLists();
    } else {
      openModal(id);
    }
  }
  if (e.target.id === "detail-overlay") closeModal();
});

async function deleteReceipt(id) {
  const receipt = receipts.find((r) => r.id === id);
  const label = receipt ? receiptDisplayName(receipt) : `receipt #${id}`;
  if (!confirm(`Delete ${label}? This removes it from the database and receipt list.`)) return;
  try {
    await api(`/api/receipts/${id}`, { method: "DELETE" });
    if (selectedId === id) await selectReceipt(null);
    if (expandedId === id) expandedId = null;
    await refresh();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteSelectedReceipts() {
  const ids = [...selectedReceiptIds];
  if (!ids.length) return;
  const plural = ids.length === 1 ? "receipt" : "receipts";
  if (!confirm(`Delete ${ids.length} selected ${plural}? This removes them from the database and receipt list.`)) return;
  try {
    await Promise.all(ids.map((id) => api(`/api/receipts/${id}`, { method: "DELETE" })));
    ids.forEach((id) => selectedReceiptIds.delete(id));
    if (ids.includes(selectedId)) await selectReceipt(null);
    if (ids.includes(expandedId)) expandedId = null;
    await refresh();
  } catch (e) {
    alert(e.message);
    await refresh();
  }
}

$("#role-employee").onclick = () => setRole("employee");
$("#role-manager").onclick = () => setRole("manager");
$("#switch-user-btn").onclick = showLogin;
$("#receipt-sort").addEventListener("change", (e) => {
  receiptSort = e.target.value;
  renderLists();
});
document.querySelectorAll("[data-login-role]").forEach((btn) => {
  btn.addEventListener("click", () => enterApp(btn.dataset.loginRole));
});

// Try random receipt: pick one of the sample images in /sample-receipts
// (local-only folder, see .gitignore) and STAGE it in the preview. It only
// lands in "My receipts" when the employee presses Submit receipt.
$("#random-receipt-btn").onclick = async () => {
  const status = $("#upload-status");
  status.className = "upload-status";
  status.textContent = "Picking a random receipt…";
  try {
    const manifest = await (await fetch("/sample-receipts/manifest.json")).json();
    const name = manifest[Math.floor(Math.random() * manifest.length)];
    const blob = await (await fetch(`/sample-receipts/${name}`)).blob();
    stageFile(new File([blob], `random-${name}`, { type: blob.type }));
  } catch (e) {
    status.textContent = "No sample receipts available (" + e.message + ")";
    status.classList.add("err");
  }
};

$("#extract-btn").onclick = async () => {
  const status = $("#extract-status");
  status.className = "upload-status";
  $("#extract-btn").disabled = true;
  try {
    let id = selectedId;
    // A staged file (random or drag/drop) is uploaded HERE — this is the point
    // where the receipt first appears in "My receipts".
    if (pendingFile) {
      status.textContent = `Uploading ${pendingFile.name}…`;
      const fd = new FormData();
      fd.append("file", pendingFile);
      const created = await api("/api/receipts", { method: "POST", body: fd });
      id = created.id;
      clearStaged();
      await refresh();
    }
    if (!id) { $("#extract-btn").disabled = false; return; }
    status.textContent = "Sending to Claude…";
    await api(`/api/receipts/${id}/extract`, { method: "POST" });
    // Follow the extraction through: uploaded -> processing -> review/failed.
    for (let i = 0; i < 45; i++) {
      await refresh();
      const r = receipts.find((x) => x.id === id);
      if (!r || !["uploaded", "processing"].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 2000));
    }
    await selectReceipt(id, { scroll: true });
  } catch (e) {
    status.textContent = e.message;
    status.classList.add("err");
  }
  $("#extract-btn").disabled = false;
};

const dropZone = $("#drop-zone");
$("#upload-btn").onclick = (e) => { e.stopPropagation(); $("#file-input").click(); };
$("#camera-btn").onclick = (e) => { e.stopPropagation(); openCameraModal(); };
$("#file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) stageFile(e.target.files[0]);
  e.target.value = "";
});
$("#camera-input").addEventListener("change", (e) => {
  if (e.target.files[0]) stageFile(e.target.files[0]);
  e.target.value = "";
});
["dragenter", "dragover"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach((ev) => dropZone.addEventListener(ev, (e) => {
  e.preventDefault(); dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) stageFile(file);
});

async function init() {
  try {
    const meta = await api("/api/meta");
    const label = meta.ai_provider === "claude" ? "AI · Claude" : "AI · mock";
    $("#provider-badge").textContent = label;
    $("#login-provider-badge").textContent = label;
  } catch {}
  if (location.hash === "#manager") setRole("manager");
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
