// popup/popup.js
// Manages the popup UI for Workspace Manager.
// Now, right-clicking a saved workspace sends a context message; the background forwards a rename request to the popup.

document.addEventListener("DOMContentLoaded", initPopup);

/**
 * Initializes the popup by loading the current state.
 */
function initPopup() {
  loadState();
  // Listen for rename requests from the background.
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "renameWorkspaceRequest") {
      let newName = prompt("Enter a new name for the workspace:", "");
      if (newName !== null && newName.trim().length > 0) {
        sendMessage({ action: "renameWorkspace", workspaceId: msg.workspaceId, newName: newName.trim() });
      }
    }
  });
}

/**
 * Sends a message to the background and reloads state upon response.
 *
 * @param {Object} message - The message object to send.
 */
function sendMessage(message) {
  browser.runtime.sendMessage(message)
    .then(response => {
      if (response && response.success) {
        showStatus(response.message || "Action completed.", false);
      } else {
        showStatus((response && response.error) || "Action failed.", true);
      }
      loadState();
    })
    .catch(err => {
      showStatus(err.message || "Error communicating with background script.", true);
      console.error("Message error:", err);
    });
}

/**
 * Loads the current state (saved workspaces and unsaved windows) and highlights the active window.
 */
function loadState() {
  getActiveWindowId().then(currentWindowId => {
    browser.runtime.sendMessage({ action: "getState" })
      .then(response => {
        if (response.success) {
          updateSavedList(response.saved, currentWindowId);
          updateUnsavedList(response.unsaved, currentWindowId);
        } else {
          showStatus(response.error || "Failed to retrieve state.", true);
        }
      })
      .catch(err => {
        showStatus(err.message || "Error retrieving state.", true);
        console.error("State load error:", err);
      });
  });
}

/**
 * Retrieves the ID of the currently focused window.
 *
 * @returns {Promise<number>} A promise resolving to the current window's id.
 */
function getActiveWindowId() {
  return browser.windows.getLastFocused().then(currentWin => currentWin.id);
}

/**
 * Updates the Saved Workspaces list.
 *
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - Currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  const list = document.getElementById("saved-list");
  list.innerHTML = "";
  if (!saved || saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  saved.forEach(ws => {
    list.appendChild(createSavedListItem(ws, currentWindowId));
  });
}

/**
 * Creates an HTML element for a saved workspace.
 * Left-click opens/focuses; right-click triggers context for renaming/unsaving.
 *
 * @param {Object} workspace - The workspace object.
 * @param {number} currentWindowId - Currently focused window's id.
 * @returns {HTMLElement} The list item element.
 */
function createSavedListItem(workspace, currentWindowId) {
  const li = document.createElement("li");
  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${workspace.title || "(No Title)"}</span>`;
  li.addEventListener("click", () => {
    sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id) });
  });
  li.addEventListener("contextmenu", (e) => {
    // Send the selected workspace ID to the background.
    browser.runtime.sendMessage({ action: "setContextWorkspace", workspaceId: workspace.id });
  });
  return li;
}

/**
 * Updates the Unsaved Windows list.
 *
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - Currently focused window's id.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  const list = document.getElementById("unsaved-list");
  list.innerHTML = "";
  if (!unsaved || unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach(win => {
    list.appendChild(createUnsavedListItem(win, currentWindowId));
  });
}

/**
 * Creates an HTML element for an unsaved window.
 * Left-click focuses the window; the "Save" button saves it.
 *
 * @param {Object} win - The window object.
 * @param {number} currentWindowId - Currently focused window's id.
 * @returns {HTMLElement} The list item element.
 */
function createUnsavedListItem(win, currentWindowId) {
  const li = document.createElement("li");
  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${win.title || "(Error: No Title)"}</span>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("save-btn")) return;
    sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId) });
  });
  const saveBtn = li.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId) });
  });
  return li;
}

/**
 * Displays a status message in the popup.
 *
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether it's an error message.
 */
function showStatus(message, isError) {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "success";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, 3000);
}