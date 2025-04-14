// popup/popup.js
// This script manages the popup UI for Workspace Manager.
// It communicates with the background script to get the current state and send user actions.
// The currently active window is highlighted in the workspace lists.

document.addEventListener("DOMContentLoaded", () => {
  // Load state when popup is opened.
  loadState();
});

/**
 * Utility function to send a message to the background script.
 * After each action, we reload the current state.
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
 * Loads the current state (saved workspaces and unsaved windows) from background.
 * Also retrieves the currently active window to highlight it in the list.
 */
function loadState() {
  // Get the currently focused window
  browser.windows.getLastFocused().then(currentWin => {
    const currentWindowId = currentWin.id;
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
 * Updates the Saved Workspaces list in the popup.
 *
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  const list = document.getElementById("saved-list");
  list.innerHTML = "";
  if (saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  saved.forEach(ws => {
    const li = document.createElement("li");

    // If the workspace window is currently focused, add highlight class.
    if (ws.windowId && ws.windowId === currentWindowId) {
      li.classList.add("highlight");
    }

    // Create the list item with a label and a delete button.
    li.innerHTML = `<span class="label">${ws.title || "(No Title)"}</span>
      <button class="delete-btn" data-wsid="${ws.id}">Delete</button>`;

    // When clicking on the li (except on the delete button), open/focus the workspace.
    li.addEventListener("click", (e) => {
      // If the click is on the delete button, do not trigger open/focus.
      if (e.target.classList.contains("delete-btn")) return;
      sendMessage({ action: "openWorkspace", workspaceId: parseInt(ws.id) });
    });

    // Stop the event from bubbling when clicking the delete button.
    const deleteBtn = li.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMessage({ action: "deleteWorkspace", workspaceId: parseInt(ws.id) });
    });

    list.appendChild(li);
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
  list.innerHTML = "";
  if (unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach(win => {
    const li = document.createElement("li");

    // If the unsaved window is currently focused, add highlight class.
    if (win.windowId && win.windowId === currentWindowId) {
      li.classList.add("highlight");
    }

    // Create the list item with a label and a save button.
    li.innerHTML = `<span class="label">${win.title || "(Error: No Title)"}</span>
      <button class="save-btn" data-wid="${win.windowId}">Save</button>`;

    // When clicking on the li (except on the save button), focus the window.
    li.addEventListener("click", (e) => {
      // If the click is on the save button, do not trigger focus.
      if (e.target.classList.contains("save-btn")) return;
      sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId) });
    });

    // Stop the event from bubbling when clicking the save button.
    const saveBtn = li.querySelector(".save-btn");
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId) });
    });

    list.appendChild(li);
  });
}

/**
 * Displays status messages to the user.
 *
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether this is an error message.
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
