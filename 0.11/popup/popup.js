// popup/popup.js
// This script manages the popup UI for Workspace Manager.
// It communicates with the background script for data operations.
// Saved workspaces now use a custom context menu (on right-click) for "Rename" and "Unsave" actions.
// The currently active window is highlighted in the workspace lists.

document.addEventListener("DOMContentLoaded", initPopup);

/**
 * Initializes the popup by loading state and setting up the custom context menu.
 */
function initPopup() {
  createContextMenu();
  loadState();
  // Hide context menu if user clicks elsewhere in the popup.
  document.addEventListener("click", hideContextMenu);
}

/**
 * Sends a message to the background script.
 * After the action, reloads the current state.
 *
 * @param {Object} message - The message to send.
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
 * Loads the current state (saved workspaces and unsaved windows) from the background.
 */
function loadState() {
  getActiveWindowId()
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
    })
    .catch(err => {
      showStatus(err.message || "Error getting active window.", true);
      console.error("Active window error:", err);
    });
}

/**
 * Retrieves the ID of the currently focused window.
 *
 * @returns {Promise<number>} The current window's id.
 */
function getActiveWindowId() {
  return browser.windows.getLastFocused().then(currentWin => currentWin.id);
}

/**
 * Updates the Saved Workspaces list in the popup.
 * Sorts workspaces by the "order" property for persistent reordering.
 *
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  const list = document.getElementById("saved-list");
  list.innerHTML = "";
  if (!saved || saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  // Sort by the order property (default to 0 if undefined).
  saved.sort((a, b) => (a.order || 0) - (b.order || 0));
  saved.forEach(ws => {
    list.appendChild(createSavedListItem(ws, currentWindowId));
  });

  // Allow dropping into empty space in the saved list.
  list.addEventListener("dragover", (e) => { e.preventDefault(); });
  list.addEventListener("drop", (e) => {
    e.preventDefault();
    // If an unsaved window is dropped outside a saved item.
    const unsavedWindowId = e.dataTransfer.getData("unsavedWindowId");
    if (unsavedWindowId) {
      sendMessage({ action: "saveWindow", windowId: parseInt(unsavedWindowId) });
    }
  });
}


/**
 * Creates a list item element for a saved workspace.
 * Attaches a right-click context menu for Rename/Unsave.
 * Now includes drag event listeners for reordering.
 *
 * @param {Object} workspace - The workspace object.
 * @param {number} currentWindowId - The current active window's id.
 * @returns {HTMLElement} The list item element.
 */
function createSavedListItem(workspace, currentWindowId) {
  const li = document.createElement("li");
  li.dataset.wsid = workspace.id;
  li.className = "saved-item";
  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${workspace.title || "(No Title)"}</span>`;
  
  // Make the item draggable.
  li.setAttribute("draggable", "true");
  li.addEventListener("dragstart", handleDragStart);
  li.addEventListener("dragover", handleDragOver);
  li.addEventListener("drop", handleDrop);
  li.addEventListener("dragend", handleDragEnd);
  
  // Left-click on the item opens/focuses the workspace.
  li.addEventListener("click", () => {
    sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id) });
  });
  
  // Right-click shows the custom context menu.
  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e, workspace.id);
  });
  
  return li;
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
  if (!unsaved || unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach(win => {
    list.appendChild(createUnsavedListItem(win, currentWindowId));
  });
}

/**
 * Creates a list item element for an unsaved window.
 * Marked as draggable so it can be dropped to save it.
 *
 * @param {Object} win - The window object.
 * @param {number} currentWindowId - The current active window's id.
 * @returns {HTMLElement} The list item element.
 */
function createUnsavedListItem(win, currentWindowId) {
  const li = document.createElement("li");
  li.dataset.wid = win.windowId;
  li.className = "unsaved-item";
  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${win.title || "(Error: No Title)"}</span>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;
  
  // Make the unsaved item draggable.
  li.setAttribute("draggable", "true");
  li.addEventListener("dragstart", handleDragStartUnsaved);
  
  // Clicking the list item (except the button) focuses the window.
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("save-btn")) return;
    sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId) });
  });
  
  // Clicking the save button saves the window as a workspace.
  const saveBtn = li.querySelector(".save-btn");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId) });
  });
  
  return li;
}

/* ===== CUSTOM CONTEXT MENU ===== */

// Global variable to hold the context menu element.
let contextMenuEl;

/**
 * Creates the custom context menu element and appends it to the document body.
 * The styles (position, background, border, padding, etc.) are now provided by CSS.
 */
function createContextMenu() {
  contextMenuEl = document.createElement("div");
  contextMenuEl.id = "context-menu";
  // Create menu items for "Rename" and "Unsave".
  const renameItem = document.createElement("div");
  renameItem.textContent = "Rename";
  renameItem.className = "context-menu-item";
  renameItem.addEventListener("click", onRenameClick);
  
  const unsaveItem = document.createElement("div");
  unsaveItem.textContent = "Unsave";
  unsaveItem.className = "context-menu-item";
  unsaveItem.addEventListener("click", onUnsaveClick);
  
  contextMenuEl.appendChild(renameItem);
  contextMenuEl.appendChild(unsaveItem);
  
  document.body.appendChild(contextMenuEl);
}

/**
 * Displays the custom context menu at the mouse event's position.
 *
 * @param {MouseEvent} e - The mouse event from right-click.
 * @param {number} workspaceId - The workspace ID for which the menu is shown.
 */
function showContextMenu(e, workspaceId) {
  contextMenuEl.style.left = e.clientX + "px";
  contextMenuEl.style.top = e.clientY + "px";
  contextMenuEl.style.display = "block";
  // Store the workspaceId on the context menu element for later reference.
  contextMenuEl.dataset.wsid = workspaceId;
}

/**
 * Hides the custom context menu.
 */
function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.style.display = "none";
  }
}

/**
 * Handles the Rename menu item click.
 * Prompts the user for a new title, then sends a rename request.
 */
function onRenameClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl.dataset.wsid);
  let newTitle = prompt("Enter new name for workspace:");
  if (newTitle && newTitle.trim() !== "") {
    sendMessage({ action: "renameWorkspace", workspaceId: wsid, newTitle: newTitle.trim() });
  }
}

/**
 * Handles the Unsave menu item click.
 * Sends a request to unsave (remove) the workspace.
 */
function onUnsaveClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl.dataset.wsid);
  sendMessage({ action: "unsaveWorkspace", workspaceId: wsid });
}

/* ===== STATUS MESSAGES ===== */

/**
 * Displays a status message to the user.
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

/* ===== CUSTOM THEME STYLING ===== */

// Initialize styles when the extension page loads
async function setInitialStyle() {
  try {
    const theme = await browser.theme.getCurrent();
    const colors = theme.colors;
    const docstyle = document.documentElement.style;
    docstyle.setProperty('--popup', colors.popup);
    docstyle.setProperty('--popup_border', colors.popup_border);
    docstyle.setProperty('--popup_highlight', colors.popup_highlight);
    docstyle.setProperty('--popup_highlight_text', colors.popup_highlight_text);
    docstyle.setProperty('--popup_text', colors.popup_text);

    docstyle.setProperty('--toolbar', colors.toolbar);
    docstyle.setProperty('--test', colors.toolbar_bottom_separator);

    console.info('Theme applied successfully:', theme);
  } catch (error) {
    console.error('Error retrieving initial theme:', error);
  }
}
setInitialStyle();

// Listen for theme updates
browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  try {
    const currentWindow = await browser.windows.getCurrent();
    // Only update style if the theme applies to the current window or is global
    if (!windowId || windowId === currentWindow.id) {
      setStyle(theme);
    } else {
      console.info('Theme update skipped for windowId:', windowId);
    }
  } catch (error) {
    console.error('Error handling theme update:', error);
  }
});

/* ===== DRAG AND DROP HANDLERS ===== */

/**
 * Handles the drag start event for saved workspace list items.
 *
 * @param {DragEvent} e - The drag event.
 */
function handleDragStart(e) {
  // Save the workspace ID in the drag event.
  e.dataTransfer.setData("workspaceId", e.currentTarget.dataset.wsid);
  e.dataTransfer.effectAllowed = "move";
}

/**
 * Handles the drag over event for saved workspace list items.
 *
 * @param {DragEvent} e - The drag event.
 */
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

/**
 * Handles the drop event on a saved workspace list item.
 * Reorders the saved list and persists the change.
 *
 * @param {DragEvent} e - The drag event.
 */
function handleDrop(e) {
  e.preventDefault();
  // Check for dragged saved workspace.
  const draggedWsId = e.dataTransfer.getData("workspaceId");
  // Fallback check for unsaved item drop.
  if (!draggedWsId) {
    const unsavedWindowId = e.dataTransfer.getData("unsavedWindowId");
    if (unsavedWindowId) {
      sendMessage({ action: "saveWindow", windowId: parseInt(unsavedWindowId) });
      return;
    }
  }
  const targetWsId = e.currentTarget.dataset.wsid;
  if (draggedWsId === targetWsId) return; // No action if dropped on itself.

  const savedList = document.getElementById("saved-list");
  const draggedItem = savedList.querySelector(`[data-wsid='${draggedWsId}']`);
  const targetItem = savedList.querySelector(`[data-wsid='${targetWsId}']`);

  if (draggedItem && targetItem) {
    // Determine if the dragged item should be placed before or after the target.
    const bounding = targetItem.getBoundingClientRect();
    const offset = e.clientY - bounding.top;
    if (offset < bounding.height / 2) {
      savedList.insertBefore(draggedItem, targetItem);
    } else {
      savedList.insertBefore(draggedItem, targetItem.nextSibling);
    }
    // Update the order in persistent storage.
    persistSavedOrder();
  }
}

/**
 * Handles the drag end event.
 *
 * @param {DragEvent} e - The drag event.
 */
function handleDragEnd(e) {
  // (Optional) Remove any visual cues or cleanup if needed.
}

/**
 * Handles the drag start event for unsaved windows.
 * Uses a different data key to differentiate the source.
 *
 * @param {DragEvent} e - The drag event.
 */
function handleDragStartUnsaved(e) {
  e.dataTransfer.setData("unsavedWindowId", e.currentTarget.dataset.wid);
  // Use "copy" because the unsaved window remains in its list.
  e.dataTransfer.effectAllowed = "copy";
}

/**
 * Reads the current order of saved workspaces from the UI and sends it to the background.
 */
function persistSavedOrder() {
  const savedList = document.getElementById("saved-list");
  const order = [];
  savedList.querySelectorAll("li.saved-item").forEach(item => {
    order.push(parseInt(item.dataset.wsid));
  });
  // Send the new order to be persisted.
  sendMessage({ action: "updateOrder", newOrder: order });
}