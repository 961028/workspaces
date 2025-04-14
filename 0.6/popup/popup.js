// popup/popup.js
// This script manages the popup UI for Workspace Manager. It communicates with
// the background script to get the current state and send user actions.
// The currently active window is highlighted in the workspace lists.

document.addEventListener("DOMContentLoaded", initPopup);

/**
 * Entry point for the popup.
 */
function initPopup() {
  loadState();
}

/**
 * Sends a message to the background script and handles its response.
 *
 * @param {Object} message - The message object to send.
 */
function sendMessage(message) {
  browser.runtime.sendMessage(message)
    .then(handleResponse)
    .catch(handleSendMessageError);
}

/**
 * Handles a successful message response.
 *
 * @param {Object} response - Response from the background script.
 */
function handleResponse(response) {
  if (response.success) {
    showStatus(response.message || "Action completed.", false);
  } else {
    showStatus(response.error || "Action failed.", true);
  }
  loadState();
}

/**
 * Handles errors when sending messages.
 *
 * @param {Error} err - The error object.
 */
function handleSendMessageError(err) {
  showStatus(err.message || "Error communicating with background script.", true);
  console.error("Message error:", err);
}

/**
 * Loads the current state by retrieving the currently focused window,
 * then requesting saved and unsaved workspace state from the background.
 */
function loadState() {
  getCurrentWindowId()
    .then(currentWindowId => {
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
 * Retrieves the currently focused window's ID.
 *
 * @returns {Promise<number>} A promise that resolves with the current window's id.
 */
function getCurrentWindowId() {
  return browser.windows.getLastFocused()
    .then(currentWin => currentWin.id);
}

/**
 * Updates the Saved Workspaces list in the popup.
 *
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  const list = document.getElementById("saved-list");
  clearList(list);
  if (saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  saved.forEach(ws => {
    list.appendChild(createSavedWorkspaceItem(ws, currentWindowId));
  });
}

/**
 * Updates the Unsaved Windows list in the popup.
 *
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  const list = document.getElementById("unsaved-list");
  clearList(list);
  if (unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach(win => {
    list.appendChild(createUnsavedWindowItem(win, currentWindowId));
  });
}

/**
 * Clears all children from an element.
 *
 * @param {HTMLElement} element - The DOM element to clear.
 */
function clearList(element) {
  element.innerHTML = "";
}

/**
 * Creates a list item element for a saved workspace.
 *
 * @param {Object} ws - The workspace object.
 * @param {number} currentWindowId - The currently focused window's id.
 * @returns {HTMLElement} - The list item element.
 */
function createSavedWorkspaceItem(ws, currentWindowId) {
  const li = document.createElement("li");
  if (ws.windowId && ws.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${ws.title || "(No Title)"}</span>
                  <button class="delete-btn" data-wsid="${ws.id}">Delete</button>`;
  
  // Open/focus workspace when clicking the list item (unless the delete button is clicked)
  li.addEventListener("click", (e) => {
    if (!e.target.classList.contains("delete-btn")) {
      sendMessage({ action: "openWorkspace", workspaceId: parseInt(ws.id) });
    }
  });
  
  // Stop event propagation when clicking the delete button and delete the workspace.
  const deleteBtn = li.querySelector(".delete-btn");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "deleteWorkspace", workspaceId: parseInt(ws.id) });
  });
  
  return li;
}

/**
 * Creates a list item element for an unsaved window.
 *
 * @param {Object} win - The unsaved window object.
 * @param {number} currentWindowId - The currently focused window's id.
 * @returns {HTMLElement} - The list item element.
 */
function createUnsavedWindowItem(win, currentWindowId) {
  const li = document.createElement("li");
  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${win.title || "(Error: No Title)"}</span>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;
  
  // Focus window on click (unless the save button is clicked)
  li.addEventListener("click", (e) => {
    if (!e.target.classList.contains("save-btn")) {
      sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId) });
    }
  });
  
  // Stop event propagation when clicking the save button and save the window as a workspace.
  const saveBtn = li.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId) });
  });
  
  return li;
}

/**
 * Displays status messages to the user.
 *
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether the message is an error.
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
