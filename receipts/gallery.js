const apiBase = (window.LUNA_RECEIPT_API || "").replace(/\/$/, "");
const gallery = document.getElementById("gallery");
const empty = document.getElementById("empty");
const errorBox = document.getElementById("errorBox");
const singleSession = document.getElementById("singleSession");
const refreshButton = document.getElementById("refreshButton");

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function receiptFilename(item) {
  const date = item.createdAt ? new Date(item.createdAt) : new Date();
  const stamp = isNaN(date.getTime()) ? item.id : date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `luna-receipt-${stamp}.png`;
}

async function loadSingleSession(id) {
  if (!id || !apiBase) return;

  try {
    const response = await fetch(`${apiBase}/session?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const item = await response.json();

    if (!item || !item.receiptUrl) return;

    singleSession.classList.remove("hidden");
    singleSession.innerHTML = `
      <h2>Your receipt</h2>
      <img src="${escapeHtml(item.receiptUrl)}" alt="Selected receipt strip">
      <div class="single-session-actions">
        <a class="download-button" href="${escapeHtml(item.receiptUrl)}" download="${escapeHtml(receiptFilename(item))}">Download</a>
        <a class="download-button" href="${escapeHtml(item.receiptUrl)}" target="_blank" rel="noopener">Open Full Size</a>
      </div>
      <p>${escapeHtml(formatDate(item.createdAt))}</p>
    `;
  } catch {
    // The main gallery can still load even if the selected receipt fails.
  }
}

async function loadGallery() {
  gallery.innerHTML = "";
  empty.classList.add("hidden");
  errorBox.classList.add("hidden");

  if (!apiBase) {
    errorBox.classList.remove("hidden");
    return;
  }

  try {
    const response = await fetch(`${apiBase}/gallery`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Gallery failed: ${response.status}`);
    const items = await response.json();

    if (!Array.isArray(items) || items.length === 0) {
      empty.classList.remove("hidden");
      return;
    }

    gallery.innerHTML = items.map(item => `
      <a class="card" href="?id=${encodeURIComponent(item.id)}">
        <img src="${escapeHtml(item.receiptUrl)}" alt="Receipt booth strip" loading="lazy">
        <div class="card-meta">${escapeHtml(formatDate(item.createdAt))}</div>
      </a>
    `).join("");
  } catch (error) {
    console.error(error);
    errorBox.classList.remove("hidden");
  }
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  await loadSingleSession(params.get("id"));
  await loadGallery();
}

refreshButton.addEventListener("click", loadGallery);
init();
