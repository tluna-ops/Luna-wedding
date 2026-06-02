const ADMIN_ENDPOINT = "https://vlmmfqjrrkdjvwuryixj.supabase.co/functions/v1/admin-receipts";
const PASSWORD_STORAGE_KEY = "lunaReceiptAdminPassword";

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginError = document.getElementById("loginError");

const refreshButton = document.getElementById("refreshButton");
const lockButton = document.getElementById("lockButton");
const searchInput = document.getElementById("searchInput");
const statusBox = document.getElementById("statusBox");
const sessionList = document.getElementById("sessionList");
const summaryText = document.getElementById("summaryText");

let adminPassword = sessionStorage.getItem(PASSWORD_STORAGE_KEY) || "";
let allSessions = [];
let busySessionId = "";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

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

function setStatus(message) {
  statusBox.textContent = message;
  statusBox.classList.toggle("hidden", !message);
}

function setLoginError(message) {
  loginError.textContent = message || "";
  loginError.classList.toggle("hidden", !message);
}

async function callAdmin(action, extra = {}) {
  const response = await fetch(ADMIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({
      action,
      password: adminPassword,
      ...extra
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `Request failed with ${response.status}`);
  }

  return body;
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}

function showLogin() {
  adminPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  passwordInput.focus();
}

function updateSummary(sessions) {
  const publicCount = sessions.filter(item => item.is_public).length;
  const hiddenCount = sessions.length - publicCount;

  summaryText.textContent = `${sessions.length} sessions · ${publicCount} public · ${hiddenCount} hidden`;
}

function filteredSessions() {
  const query = String(searchInput.value || "").trim().toUpperCase();

  if (!query) {
    return allSessions;
  }

  return allSessions.filter(session =>
    String(session.public_session_id || "").toUpperCase().includes(query)
  );
}

function renderSessions() {
  const sessions = filteredSessions();
  updateSummary(allSessions);

  if (!sessions.length) {
    sessionList.innerHTML = "";
    setStatus("No matching receipt sessions.");
    return;
  }

  setStatus("");

  sessionList.innerHTML = sessions.map(session => {
    const id = session.public_session_id || "";
    const isPublic = Boolean(session.is_public);
    const dateLabel = formatDate(session.created_at);
    const imageUrl = session.receipt_public_url || "";
    const publicUrl = `/receipts/?session=${encodeURIComponent(id)}`;
    const isBusy = busySessionId === id;

    return `
      <article class="session-card">
        <img class="session-thumb" src="${escapeHtml(imageUrl)}" alt="Receipt ${escapeHtml(id)}" loading="lazy">

        <div class="session-info">
          <div class="session-title-row">
            <h3 class="session-id">${escapeHtml(id)}</h3>
            <span class="badge ${isPublic ? "public" : "hidden-badge"}">
              ${isPublic ? "Public" : "Hidden"}
            </span>
          </div>

          <p class="session-date">${escapeHtml(dateLabel)}</p>

          <div class="session-actions">
            <a class="session-link" href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener">Open</a>
            <a class="session-link" href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener">Image</a>

            ${
              isPublic
                ? `<button class="danger" type="button" data-action="hide" data-id="${escapeHtml(id)}" ${isBusy ? "disabled" : ""}>Hide</button>`
                : `<button class="success" type="button" data-action="show" data-id="${escapeHtml(id)}" ${isBusy ? "disabled" : ""}>Restore</button>`
            }
          </div>
        </div>
      </article>
    `;
  }).join("");

  sessionList.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", async event => {
      const action = event.currentTarget.dataset.action;
      const sessionId = event.currentTarget.dataset.id;

      if (!action || !sessionId) return;

      const label = action === "hide" ? "hide" : "restore";
      const confirmed = window.confirm(`Are you sure you want to ${label} ${sessionId}?`);

      if (!confirmed) return;

      await toggleSession(action, sessionId);
    });
  });
}

async function loadSessions() {
  setStatus("Loading sessions…");

  const result = await callAdmin("list");
  allSessions = Array.isArray(result.sessions) ? result.sessions : [];
  renderSessions();
}

async function toggleSession(action, sessionId) {
  try {
    busySessionId = sessionId;
    renderSessions();
    setStatus(`${action === "hide" ? "Hiding" : "Restoring"} ${sessionId}…`);

    await callAdmin(action, { sessionId });
    await loadSessions();
  } catch (error) {
    alert(error.message || "Could not update session.");
  } finally {
    busySessionId = "";
    renderSessions();
  }
}

async function login(password) {
  adminPassword = password;
  await callAdmin("login");

  sessionStorage.setItem(PASSWORD_STORAGE_KEY, adminPassword);
  showAdmin();
  await loadSessions();
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  setLoginError("");

  const password = passwordInput.value;

  try {
    await login(password);
  } catch (error) {
    sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
    adminPassword = "";
    setLoginError(error.message || "Login failed.");
  }
});

refreshButton.addEventListener("click", async () => {
  try {
    await loadSessions();
  } catch (error) {
    setStatus(error.message || "Could not refresh sessions.");
  }
});

lockButton.addEventListener("click", () => {
  sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  adminPassword = "";
  allSessions = [];
  passwordInput.value = "";
  showLogin();
});

searchInput.addEventListener("input", renderSessions);

if (adminPassword) {
  login(adminPassword).catch(() => {
    sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
    adminPassword = "";
    showLogin();
  });
} else {
  showLogin();
}
