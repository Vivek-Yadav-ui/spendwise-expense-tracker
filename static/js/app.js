/* ═══════════════════════════════════════════════════════
   Spendwise — app.js
   All API calls, rendering, charts, and event handling
   ═══════════════════════════════════════════════════════ */

const API = "";          // same origin — Flask serves both HTML and API
const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let categories   = [];
let expenses     = [];
let editingId    = null;
let donutAnimReq = null;

/* ── Utility ──────────────────────────────────────────── */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (type === "error" ? " error" : "");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3000);
}

function showView(name) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $$(".nav-item").forEach(b => b.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  $(`.nav-item[data-view="${name}"]`).classList.add("active");
  $("#pageTitle").textContent =
    { dashboard: "Dashboard", expenses: "Expenses", analytics: "Analytics", categories: "Categories" }[name];
  if (name === "analytics") renderCharts();
}

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── API helpers ──────────────────────────────────────── */
async function apiFetch(url, opts = {}) {
  const res = await fetch(API + url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ── Categories ──────────────────────────────────────── */
async function loadCategories() {
  categories = await apiFetch("/api/categories");
  renderCategorySelects();
  renderCatGrid();
}

function renderCategorySelects() {
  const opts = `<option value="">Uncategorised</option>` +
    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  $("#expCategory").innerHTML = opts;
  $("#filterCategory").innerHTML = `<option value="">All categories</option>` +
    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
}

function renderCatGrid() {
  const grid = $("#catGrid");
  if (!categories.length) { grid.innerHTML = `<p style="color:var(--text-muted);font-size:.85rem">No categories yet.</p>`; return; }
  grid.innerHTML = categories.map(c => `
    <div class="cat-card">
      <div class="cat-icon-wrap" style="background:${hexToRgba(c.color,0.18)}">
        <span style="font-size:1.2rem">${c.icon}</span>
      </div>
      <span class="cat-card-name">${c.name}</span>
      <button class="cat-card-del" data-id="${c.id}" title="Delete">✕</button>
    </div>`).join("");

  grid.querySelectorAll(".cat-card-del").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this category? Expenses will become uncategorised.")) return;
      await apiFetch(`/api/categories/${btn.dataset.id}`, { method: "DELETE" });
      toast("Category deleted");
      await loadCategories();
      await loadAll();
    });
  });
}

async function saveCategory() {
  const name  = $("#catName").value.trim();
  const icon  = $("#catIcon").value.trim() || "📦";
  const color = $("#catColor").value;
  if (!name) { toast("Category name is required", "error"); return; }
  await apiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify({ name, icon, color }),
  });
  toast("Category added ✓");
  $("#catName").value = "";
  await loadCategories();
}

/* ── Expenses ─────────────────────────────────────────── */
async function loadExpenses() {
  const params = new URLSearchParams();
  const search = $("#searchInput").value.trim();
  const start  = $("#filterStart").value;
  const end    = $("#filterEnd").value;
  const cat    = $("#filterCategory").value;
  if (search) params.set("search", search);
  if (start)  params.set("start_date", start);
  if (end)    params.set("end_date", end);
  if (cat)    params.set("category_id", cat);
  expenses = await apiFetch(`/api/expenses?${params}`);
  renderExpenseList(expenses);
}

function getCat(id) { return categories.find(c => c.id === id) || null; }

function expenseHTML(exp) {
  const cat     = getCat(exp.category_id);
  const bg      = cat ? hexToRgba(cat.color, 0.18) : "var(--surface-2)";
  const icon    = cat ? cat.icon : "📦";
  const catName = cat ? cat.name : "Uncategorised";
  const dateStr = new Date(exp.date + "T00:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
  return `
    <div class="expense-item" data-id="${exp.id}">
      <div class="exp-cat-dot" style="background:${bg}">${icon}</div>
      <div class="exp-info">
        <div class="exp-title">${escHtml(exp.title)}</div>
        <div class="exp-meta">${catName} · ${dateStr}${exp.notes ? " · " + escHtml(exp.notes) : ""}</div>
      </div>
      <div class="exp-amount">${fmt(exp.amount)}</div>
      <div class="exp-actions">
        <button class="icon-btn edit"   data-id="${exp.id}" title="Edit">✎</button>
        <button class="icon-btn delete" data-id="${exp.id}" title="Delete">✕</button>
      </div>
    </div>`;
}

function renderExpenseList(list, containerId = "expenseList") {
  const el = $(`#${containerId}`);
  const empty = $("#emptyExpenses");
  if (!list.length) {
    el.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");
  el.innerHTML = list.map(expenseHTML).join("");

  el.querySelectorAll(".icon-btn.edit").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(Number(btn.dataset.id)));
  });
  el.querySelectorAll(".icon-btn.delete").forEach(btn => {
    btn.addEventListener("click", () => deleteExpense(Number(btn.dataset.id)));
  });
}

async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;
  await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
  toast("Expense deleted");
  await loadAll();
}

/* ── Summary ──────────────────────────────────────────── */
let summaryData = null;

async function loadSummary() {
  summaryData = await apiFetch("/api/summary");
  const { month_total, today_total, month_count, by_category } = summaryData;

  // Sidebar
  const now = new Date();
  $("#sidebarMonth").textContent = now.toLocaleDateString("en-IN", { month:"long", year:"numeric" });
  $("#sidebarTotal").textContent = fmt(month_total);

  // Stats
  $("#statMonth").textContent      = fmt(month_total);
  $("#statMonthCount").textContent = `${month_count} transaction${month_count !== 1 ? "s" : ""}`;
  $("#statToday").textContent      = fmt(today_total);

  const topCat = by_category.find(c => c.total > 0);
  if (topCat) {
    $("#statTopCat").textContent    = `${topCat.icon} ${topCat.name}`;
    $("#statTopCatAmt").textContent = fmt(topCat.total);
  }

  // Category breakdown bars
  const max = Math.max(...by_category.map(c => c.total), 1);
  $("#catBreakdown").innerHTML = by_category
    .filter(c => c.total > 0)
    .slice(0, 7)
    .map(c => `
      <div class="cat-bar-row">
        <div class="cat-bar-label">${c.icon} <span>${c.name}</span></div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${(c.total/max*100).toFixed(1)}%;background:${c.color}"></div>
        </div>
        <div class="cat-bar-amt">${fmt(c.total)}</div>
      </div>`).join("") || `<p style="color:var(--text-dim);font-size:.85rem">No expenses this month.</p>`;
}

async function loadAll() {
  await Promise.all([loadSummary(), loadExpenses()]);
  // Recent on dashboard (first 5)
  renderExpenseList(expenses.slice(0, 5), "recentList");
}

/* ── Modal ────────────────────────────────────────────── */
function openModal(id = null) {
  editingId = id;
  const exp = id ? expenses.find(e => e.id === id) : null;
  $("#modalTitle").textContent = id ? "Edit Expense" : "Add Expense";
  $("#expTitle").value    = exp ? exp.title : "";
  $("#expAmount").value   = exp ? exp.amount : "";
  $("#expDate").value     = exp ? exp.date : new Date().toISOString().slice(0, 10);
  $("#expCategory").value = exp ? (exp.category_id ?? "") : "";
  $("#expNotes").value    = exp ? (exp.notes ?? "") : "";
  $("#expenseModal").classList.remove("hidden");
  setTimeout(() => $("#expTitle").focus(), 50);
}
function openEditModal(id) { openModal(id); }
function closeModal() { $("#expenseModal").classList.add("hidden"); editingId = null; }

async function saveExpense() {
  const title  = $("#expTitle").value.trim();
  const amount = parseFloat($("#expAmount").value);
  const date   = $("#expDate").value;
  if (!title)       { toast("Title is required", "error"); return; }
  if (isNaN(amount) || amount <= 0) { toast("Enter a valid amount", "error"); return; }
  if (!date)        { toast("Date is required", "error"); return; }

  const payload = {
    title, amount,
    date,
    category_id: $("#expCategory").value ? Number($("#expCategory").value) : null,
    notes: $("#expNotes").value.trim() || null,
  };

  if (editingId) {
    await apiFetch(`/api/expenses/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    toast("Expense updated ✓");
  } else {
    await apiFetch("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    toast("Expense added ✓");
  }
  closeModal();
  await loadAll();
}

/* ── Charts ───────────────────────────────────────────── */
function renderCharts() {
  if (!summaryData) return;
  drawDonut(summaryData.by_category.filter(c => c.total > 0));
  drawBar(summaryData.trend);
}

// ── Donut Chart (vanilla canvas) ──
function drawDonut(data) {
  const canvas = $("#donutChart");
  const ctx    = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, r = 80, thick = 26;

  ctx.clearRect(0, 0, W, H);

  const total = data.reduce((s, c) => s + c.total, 0);
  $("#donutTotal").textContent = total > 0 ? "₹" + shortNum(total) : "₹0";

  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#262b45";
    ctx.lineWidth = thick;
    ctx.stroke();
    return;
  }

  let start = -Math.PI / 2;
  const gap  = 0.025;
  data.forEach((c, i) => {
    const slice = (c.total / total) * (Math.PI * 2 - gap * data.length);
    ctx.beginPath();
    ctx.arc(cx, cy, r, start + gap / 2, start + slice);
    ctx.strokeStyle = c.color;
    ctx.lineWidth   = thick;
    ctx.lineCap     = "round";
    ctx.stroke();
    start += slice + gap;
  });

  // Legend
  $("#donutLegend").innerHTML = data.slice(0, 6).map(c => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${c.color}"></div>
      <span>${c.icon} ${c.name}</span>
      <span class="legend-amt">${fmt(c.total)}</span>
    </div>`).join("");
}

// ── Bar Chart (vanilla canvas) ──
function drawBar(trend) {
  const canvas = $("#barChart");
  const ctx    = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!trend.length) {
    ctx.fillStyle = "#4a4f72";
    ctx.font = "14px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", W / 2, H / 2);
    return;
  }

  const pad    = { t: 20, r: 20, b: 50, l: 60 };
  const cw     = W - pad.l - pad.r;
  const ch     = H - pad.t - pad.b;
  const max    = Math.max(...trend.map(d => d.total), 1);
  const barW   = Math.min(40, cw / trend.length - 12);

  // Gridlines
  ctx.strokeStyle = "#1c2038";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch - (i / 4) * ch;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = "#4a4f72";
    ctx.font = "10px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("₹" + shortNum((max * i) / 4), pad.l - 8, y + 4);
  }

  trend.forEach((d, i) => {
    const x  = pad.l + (i / trend.length) * cw + (cw / trend.length - barW) / 2;
    const bh = (d.total / max) * ch;
    const y  = pad.t + ch - bh;

    // Bar (gradient)
    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    grad.addColorStop(0, "#818cf8");
    grad.addColorStop(1, "#6366f1");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, [4, 4, 0, 0]);
    ctx.fill();

    // Label
    ctx.fillStyle = "#8b90b8";
    ctx.font = "10px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.month.split(" ")[0], x + barW / 2, H - pad.b + 16);
  });
}

function shortNum(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n/1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ── Event Wiring ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", async () => {

  // Nav
  $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });
  $$(".link-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  // Add expense
  $("#addExpenseBtn").addEventListener("click", () => openModal());
  $("#modalClose").addEventListener("click", closeModal);
  $("#cancelModal").addEventListener("click", closeModal);
  $("#saveExpense").addEventListener("click", saveExpense);

  // Close modal on overlay click
  $("#expenseModal").addEventListener("click", (e) => {
    if (e.target === $("#expenseModal")) closeModal();
  });

  // Keyboard: Escape to close, Enter to save
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && !$("#expenseModal").classList.contains("hidden")) {
      if (document.activeElement.tagName !== "TEXTAREA") saveExpense();
    }
  });

  // Filters
  let filterTimer;
  ["searchInput","filterStart","filterEnd","filterCategory"].forEach(id => {
    $("#" + id).addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(loadExpenses, 300);
    });
  });
  $("#clearFilters").addEventListener("click", () => {
    ["searchInput","filterStart","filterEnd"].forEach(id => { $("#" + id).value = ""; });
    $("#filterCategory").value = "";
    loadExpenses();
  });

  // Category form
  $("#saveCatBtn").addEventListener("click", saveCategory);
  $("#catName").addEventListener("keydown", (e) => { if (e.key === "Enter") saveCategory(); });

  // Init
  await loadCategories();
  await loadAll();
});
