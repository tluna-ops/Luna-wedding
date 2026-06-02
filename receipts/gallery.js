const config = window.LUNA_RECEIPTS_CONFIG || {};

const supabaseUrl = String(config.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseKey = String(config.SUPABASE_ANON_KEY || "");
const tableName = String(config.TABLE_NAME || "public_receipt_sessions");
const pageSize = Number(config.PAGE_SIZE || 48);

const fields = config.FIELDS || {
  publicSessionId: "public_session_id",
  createdAt: "created_at",
  galleryUrl: "gallery_url",
  receiptPublicUrl: "receipt_public_url",
  isPublic: "is_public"
};

const gallery = document.getElementById("gallery");
const galleryHeader = document.getElementById("galleryHeader");
const empty = document.getElementById("empty");
const errorBox = document.getElementById("errorBox");
const errorMessage = document.getElementById("errorMessage");
const singleSession = document.getElementById("singleSession");
const statusBox = document.getElementById("statusBox");

const refreshButton = document.getElementById("refreshButton");
const emptyRefreshButton = document.getElementById("emptyRefreshButton");
const errorRefreshButton = document.getElementById("errorRefreshButton");

const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxCaption = document.getElementById("lightboxCaption");
const lightboxOpen = document.getElementById("lightboxOpen");
const lightboxDownload = document.getElementById("lightboxDownload");
const lightboxClose = document.getElementById("lightboxClose");

function formatDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
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

function normalizeItem(row) {
  return {
    publicSessionId: row[fields.publicSessionId],
    createdAt: row[fields.createdAt],
    galleryUrl: row[fields.galleryUrl],
    receiptPublicUrl: row[fields.receiptPublicUrl],
    isPublic: row[fields.isPublic]
  };
}

function receiptFilename(item) {
  const sessionId = item.publicSessionId || "receipt";
  return `luna-wedding-${sessionId}.png`;
}

function sessionUrl(item) {
  const id = encodeURIComponent(item.publicSessionId || "");
  return `${config.RECEIPTS_PATH || "/receipts/"}?session=${id}`;
}

function showStatus(title = "Loading receipt gallery…", message = "Checking for uploaded receipt strips.") {
  statusBox.classList.remove("hidden");
  statusBox.querySelector("strong").textContent = title;
  statusBox.querySelector("p").textContent = message;
}

function hideStatus() {
  statusBox.classList.add("hidden");
}

function showError(message) {
  hideStatus();
  gallery.classList.add("hidden");
  galleryHeader.classList.add("hidden");
  empty.classList.add("hidden");
  errorBox.classList.remove("hidden");

  if (errorMessage) {
    errorMessage.textContent = message || "Please refresh the page. If this keeps happening, the receipt upload may still be processing.";
  }
}

function clearError() {
  errorBox.classList.add("hidden");
}

function validateConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured yet. Check receipts/config.js for SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  if (!tableName) {
    throw new Error("Supabase table/view name is missing. Check receipts/config.js.");
  }
}

async function supabaseSelect(queryString) {
  validateConfig();

  const url = `${supabaseUrl}/rest/v1/${encodeURIComponent(tableName)}?${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    let details = "";

    try {
      const body = await response.json();
      details = body.message || body.error || JSON.stringify(body);
    } catch {
      details = await response.text();
    }

    throw new Error(`Supabase request failed (${response.status}): ${details}`);
  }

  return response.json();
}

async function fetchGalleryItems() {
  const selectFields = [
    fields.publicSessionId,
    fields.createdAt,
    fields.galleryUrl,
    fields.receiptPublicUrl,
    fields.isPublic
  ].join(",");

  const query = new URLSearchParams({
    select: selectFields,
    order: `${fields.createdAt}.desc`,
    limit: String(pageSize)
  });

  const rows = await supabaseSelect(query.toString());

  return Array.isArray(rows)
    ? rows.map(normalizeItem).filter(item => item.publicSessionId && item.receiptPublicUrl)
    : [];
}

async function fetchSessionById(publicSessionId) {
  const selectFields = [
    fields.publicSessionId,
    fields.createdAt,
    fields.galleryUrl,
    fields.receiptPublicUrl,
    fields.isPublic
  ].join(",");

  const query = new URLSearchParams({
    select: selectFields,
    limit: "1"
  });

  query.set(fields.publicSessionId, `eq.${publicSessionId}`);

  const rows = await supabaseSelect(query.toString());

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const item = normalizeItem(rows[0]);
  return item.publicSessionId && item.receiptPublicUrl ? item : null;
}

function renderSingleSession(item, requestedSessionId) {
  if (!requestedSessionId) {
    singleSession.classList.add("hidden");
    singleSession.innerHTML = "";
    return;
  }

  if (!item) {
    singleSession.classList.remove("hidden");
    singleSession.innerHTML = `
      <h2>Receipt not available yet</h2>
      <p>
        This receipt may still be uploading. Please refresh in a moment, or visit the full gallery after the event.
      </p>
      <div class="single-session-actions">
        <button type="button" id="singleRefreshButton">Check again</button>
        <a href="/receipts/">View gallery</a>
      </div>
    `;

    const singleRefreshButton = document.getElementById("singleRefreshButton");
    if (singleRefreshButton) {
      singleRefreshButton.addEventListener("click", init);
    }

    return;
  }

  const dateLabel = formatDate(item.createdAt);
  const imageUrl = item.receiptPublicUrl;
  const filename = receiptFilename(item);

  singleSession.classList.remove("hidden");
  singleSession.innerHTML = `
    <h2>Your receipt</h2>
    <p>${escapeHtml(item.publicSessionId)}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}</p>
    <button class="receipt-image-button" type="button" data-image="${escapeHtml(imageUrl)}" data-session="${escapeHtml(item.publicSessionId)}" data-date="${escapeHtml(dateLabel)}">
      <img src="${escapeHtml(imageUrl)}" alt="Receipt strip for ${escapeHtml(item.publicSessionId)}">
    </button>
    <div class="single-session-actions">
      <a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener">Open full size</a>
      <a href="${escapeHtml(imageUrl)}" download="${escapeHtml(filename)}">Download</a>
      <a href="/receipts/">View all receipts</a>
    </div>
  `;

  const imageButton = singleSession.querySelector(".receipt-image-button");
  if (imageButton) {
    imageButton.addEventListener("click", () => openLightbox(item));
  }
}

function renderGallery(items) {
  gallery.innerHTML = "";

  if (!items.length) {
    gallery.classList.add("hidden");
    galleryHeader.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  galleryHeader.classList.remove("hidden");
  gallery.classList.remove("hidden");

  gallery.innerHTML = items.map(item => {
    const dateLabel = formatDate(item.createdAt);
    const href = sessionUrl(item);

    return `
      <article class="card" data-session="${escapeHtml(item.publicSessionId)}">
        <a href="${escapeHtml(href)}" aria-label="Open receipt ${escapeHtml(item.publicSessionId)}">
          <img src="${escapeHtml(item.receiptPublicUrl)}" alt="Receipt strip ${escapeHtml(item.publicSessionId)}" loading="lazy">
        </a>
        <button class="card-preview-button" type="button" aria-label="Preview receipt ${escapeHtml(item.publicSessionId)}">
          Quick view
        </button>
        <div class="card-meta">
          <strong>${escapeHtml(item.publicSessionId)}</strong>
          ${escapeHtml(dateLabel)}
        </div>
      </article>
    `;
  }).join("");

  gallery.querySelectorAll(".card-preview-button").forEach(button => {
    button.addEventListener("click", event => {
      const card = event.currentTarget.closest(".card");
      const sessionId = card ? card.dataset.session : "";
      const item = items.find(candidate => candidate.publicSessionId === sessionId);

      if (item) {
        openLightbox(item);
      }
    });
  });
}

function openLightbox(item) {
  const dateLabel = formatDate(item.createdAt);
  const imageUrl = item.receiptPublicUrl;
  const filename = receiptFilename(item);

  lightboxImage.src = imageUrl;
  lightboxImage.alt = `Receipt strip for ${item.publicSessionId}`;
  lightboxCaption.textContent = `${item.publicSessionId}${dateLabel ? ` · ${dateLabel}` : ""}`;
  lightboxOpen.href = imageUrl;
  lightboxDownload.href = imageUrl;
  lightboxDownload.setAttribute("download", filename);

  lightbox.classList.remove("hidden");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
  document.body.classList.remove("lightbox-open");
  lightboxImage.src = "";
}

async function loadGallery() {
  clearError();
  showStatus();

  gallery.innerHTML = "";
  gallery.classList.add("hidden");
  galleryHeader.classList.add("hidden");
  empty.classList.add("hidden");

  const items = await fetchGalleryItems();

  hideStatus();
  renderGallery(items);

  return items;
}

async function loadSingleSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const requestedSessionId =
    params.get("session") ||
    params.get("id") ||
    "";

  if (!requestedSessionId) {
    renderSingleSession(null, "");
    return null;
  }

  showStatus("Loading your receipt…", "Checking for the receipt linked from your QR code.");

  const item = await fetchSessionById(requestedSessionId.trim());

  hideStatus();
  renderSingleSession(item, requestedSessionId.trim());

  return item;
}

async function init() {
  try {
    clearError();

    const params = new URLSearchParams(window.location.search);
    const hasRequestedSession = params.has("session") || params.has("id");

    if (hasRequestedSession) {
      await loadSingleSessionFromUrl();
    }

    await loadGallery();
  } catch (error) {
    console.error(error);
    showError(error.message || "The receipt gallery could not load.");
  }
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadGallery);
}

if (emptyRefreshButton) {
  emptyRefreshButton.addEventListener("click", loadGallery);
}

if (errorRefreshButton) {
  errorRefreshButton.addEventListener("click", init);
}

if (lightboxClose) {
  lightboxClose.addEventListener("click", closeLightbox);
}

if (lightbox) {
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !lightbox.classList.contains("hidden")) {
    closeLightbox();
  }
});

init();
