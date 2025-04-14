// popup/popup.js
// This script manages the popup UI for Workspace Manager.
// It communicates with the background script to get the current state and send user actions.
// The currently active window is highlighted in the workspace lists.

const savedListEl = document.getElementById("saved-list");
const unsavedListEl = document.getElementById("unsaved-list");
const statusEl = document.getElementById("status");

document.addEventListener("DOMContentLoaded", initPopup);

/**
 * Initializes the popup by loading the current state.
 */
function initPopup() {
  loadState();
}

/**
 * Sends a message to the background script.
 * On response, displays status messages and reloads state.
 *
 * @param {Object} message - The message object to send.
 */
function sendMessage(message) {
  browser.runtime.sendMessage(message)
    .then(response => {
      if (response.success) {
        showStatus(response.message || "Action completed.", false);
      } else {
        showStatus(response.error || "Action failed.", true);
      }
      loadState();
    })
    .catch(err => {
      showStatus(err.message || "Error communicating with background script.", true);
      console.error("Message error:", err);
    });
}

/**
 * Loads the current state from the background script, including
 * saved workspaces and unsaved windows, and the currently active window.
 */
async function loadState() {
  try {
    const currentWindowId = await getActiveWindowId();
    const response = await browser.runtime.sendMessage({ action: "getState" });
    if (response.success) {
      updateSavedList(response.saved, currentWindowId);
      updateUnsavedList(response.unsaved, currentWindowId);
    } else {
      showStatus(response.error || "Failed to retrieve state.", true);
    }
  } catch (err) {
    showStatus(err.message || "Error retrieving state.", true);
    console.error("State load error:", err);
  }
}


/**
 * Retrieves the ID of the currently focused window.
 *
 * @returns {Promise<number>} A promise that resolves to the current window's id.
 */
function getActiveWindowId() {
  return browser.windows.getLastFocused().then(currentWin => currentWin.id);
}

/**
 * Updates the Saved Workspaces list based on the provided data.
 *
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  savedListEl.innerHTML = "";
  if (!saved || saved.length === 0) {
    savedListEl.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  saved.forEach(ws => {
    savedListEl.appendChild(createSavedListItem(ws, currentWindowId));
  });
}

/**
 * Creates a list item element for a saved workspace.
 *
 * @param {Object} workspace - The workspace object.
 * @param {number} currentWindowId - The currently focused window's id.
 * @returns {HTMLElement} The list item element.
 */
function createSavedListItem(workspace, currentWindowId) {
  const li = document.createElement("li");

  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }

  li.innerHTML = `<span class="label">${workspace.title || "(No Title)"}</span>
                  <button class="delete-btn" data-wsid="${workspace.id}">Delete</button>`;

  // When clicking on the list item (except on the delete button), open/focus the workspace.
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) return;
    sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id) });
  });

  // Stop propagation when clicking the delete button to avoid triggering the li click handler.
  const deleteBtn = li.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "deleteWorkspace", workspaceId: parseInt(workspace.id) });
  });

  return li;
}

/**
 * Updates the Unsaved Windows list based on the provided data.
 *
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  unsavedListEl.innerHTML = "";

  if (!unsaved || unsaved.length === 0) {
    unsavedListEl.innerHTML = "<li>No unsaved windows</li>";
    return;
  }

  unsaved.forEach(win => {
    unsavedListEl.appendChild(createUnsavedListItem(win, currentWindowId));
  });
}

/**
 * Creates a list item element for an unsaved window.
 *
 * @param {Object} win - The window object.
 * @param {number} currentWindowId - The currently focused window's id.
 * @returns {HTMLElement} The list item element.
 */
function createUnsavedListItem(win, currentWindowId) {
  const li = document.createElement("li");

  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }

  li.innerHTML = `<span class="label">${win.title || "(Error: No Title)"}</span>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;

  // When clicking on the list item (except on the save button), focus the window.
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("save-btn")) return;
    sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId) });
  });

  // Stop propagation when clicking the save button.
  const saveBtn = li.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId) });
  });

  return li;
}

/**
 * Displays a status message to the user.
 *
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether the message represents an error.
 */
function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "success";

  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, 3000);
}
