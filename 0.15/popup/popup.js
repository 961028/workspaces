// popup/popup.js
// This script manages the popup UI for Workspace Manager.
// It communicates with the background script for data operations.
// Saved workspaces now use a custom context menu (on right-click) for "Rename" and "Unsave" actions.
// The currently active window is highlighted in the workspace lists.

document.addEventListener("DOMContentLoaded", async () => {
  await initPopup();
  setupExportImportButtons();
});

/* ===== INITIALIZATION ===== */
/**
 * Initializes the popup by setting up the context menu, drag-and-drop listeners, state load,
 * click listener to hide the context menu, and applying the current theme.
 * @returns {Promise<void>}
 */
async function initPopup() {
  createContextMenu();
  setDragDropListeners();
  await loadState();
  document.addEventListener("click", hideContextMenu);
  await setInitialStyle();
}

/* ===== STATE LOADING ===== */
/**
 * Loads the current state from the background.
 * Retrieves the active window and sends a "getState" message.
 * @returns {Promise<void>}
 */
async function loadState() {
  try {
    const currentWindow = await browser.windows.getLastFocused();
    const currentWindowId = currentWindow.id;
    const response = await browser.runtime.sendMessage({ action: "getState" });
    if (response && response.success) {
      updateSavedList(response.saved, currentWindowId);
      updateUnsavedList(response.unsaved, currentWindowId);
    } else {
      showStatus(response?.error || "Failed to retrieve state.", true);
    }
  } catch (err) {
    showStatus(err.message || "Error retrieving state.", true);
    console.error("State load error:", err);
  }
}

/* ===== MESSAGE SENDER ===== */
/**
 * Sends a message to the background script and processes the response.
 * Displays a status message and reloads state afterward.
 * Uses async/await to improve readability and error handling.
 * @param {Object} message - The message to send.
 * @returns {Promise<void>}
 */
async function sendMessage(message) {
  try {
    const response = await browser.runtime.sendMessage(message);
    if (response && response.success) {
      showStatus(response.message || "Action completed.", false);
    } else {
      showStatus(response?.error || "Action failed.", true);
    }
    await loadState();
  } catch (error) {
    showStatus(error.message || "Error communicating with background script.", true);
    console.error("Error in sendMessage:", error);
  }
}

/* ===== SAVED WORKSPACES UI ===== */
/**
 * Updates the Saved Workspaces list in the popup.
 * Workspaces are sorted by their "order" value.
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateSavedList(saved, currentWindowId) {
  const list = document.getElementById("saved-list");
  list.innerHTML = "";
  if (!Array.isArray(saved) || saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  // Sort by the order property (defaulting to 0 if undefined)
  saved.sort((a, b) => (a.order || 0) - (b.order || 0));
  saved.forEach(ws => {
    list.appendChild(createSavedListItem(ws, currentWindowId));
  });
}

/**
 * Creates an <li> element for a saved workspace.
 * Sets up left-click to open/focus and right-click for the custom context menu.
 * @param {Object} workspace - The workspace object.
 * @param {number} currentWindowId - The active window's id.
 * @returns {HTMLElement} The created list item.
 */
function createSavedListItem(workspace, currentWindowId) {
  const li = document.createElement("li");
  li.dataset.wsid = workspace.id;
  li.className = "saved-item";
  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  li.innerHTML = `<span class="label">${workspace.title || "(No Title)"}</span>`;

  // Set up drag-and-drop events
  li.setAttribute("draggable", "true");
  li.addEventListener("dragstart", handleDragStart);
  li.addEventListener("dragover", handleDragOver);
  li.addEventListener("drop", handleDrop);
  li.addEventListener("dragend", handleDragEnd);

  // Left-click to open/focus the workspace.
  li.addEventListener("click", () => {
    sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id) });
  });

  // Right-click to show the custom context menu.
  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e, workspace.id);
  });

  return li;
}

/* ===== UNSAVED WINDOWS UI ===== */
/**
 * Updates the Unsaved Windows list in the popup.
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The currently focused window's id.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  const list = document.getElementById("unsaved-list");
  list.innerHTML = "";
  if (!Array.isArray(unsaved) || unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach(win => {
    list.appendChild(createUnsavedListItem(win, currentWindowId));
  });
}

/**
 * Creates an <li> element for an unsaved window.
 * Sets up a "Save" button and click-to-focus behavior.
 * @param {Object} win - The unsaved window object.
 * @param {number} currentWindowId - The active window's id.
 * @returns {HTMLElement} The created list item.
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

  // Clicking (except on the button) focuses the window.
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
let contextMenuEl; // Global variable to track the context menu element

/**
 * Creates the custom context menu element and appends it to document.body.
 */
function createContextMenu() {
  contextMenuEl = document.createElement("div");
  contextMenuEl.id = "context-menu";

  // "Rename" menu item.
  const renameItem = document.createElement("div");
  renameItem.textContent = "Rename";
  renameItem.className = "context-menu-item";
  renameItem.addEventListener("click", onRenameClick);

  // "Unsave" menu item.
  const unsaveItem = document.createElement("div");
  unsaveItem.textContent = "Unsave";
  unsaveItem.className = "context-menu-item";
  unsaveItem.addEventListener("click", onUnsaveClick);

  contextMenuEl.appendChild(renameItem);
  contextMenuEl.appendChild(unsaveItem);
  document.body.appendChild(contextMenuEl);
}

/**
 * Displays the context menu at the mouse event position.
 * @param {MouseEvent} e - The right-click event.
 * @param {number} workspaceId - The id of the workspace.
 */
function showContextMenu(e, workspaceId) {
  contextMenuEl.style.left = e.clientX + "px";
  contextMenuEl.style.top = e.clientY + "px";
  contextMenuEl.style.display = "block";
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
 * Handles the Rename action from the context menu.
 * Prompts for a new name and sends a rename request.
 */
function onRenameClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl.dataset.wsid);
  const newTitle = prompt("Enter new name for workspace:");
  if (newTitle && newTitle.trim() !== "") {
    sendMessage({ action: "renameWorkspace", workspaceId: wsid, newTitle: newTitle.trim() });
  }
}

/**
 * Handles the Unsave action from the context menu.
 */
function onUnsaveClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl.dataset.wsid);
  sendMessage({ action: "unsaveWorkspace", workspaceId: wsid });
}

/* ===== STATUS MESSAGE HANDLING ===== */
/**
 * Displays a status message to the user.
 * The message is automatically cleared after three seconds.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message is an error.
 */
function showStatus(message, isError) {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "success";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, 3000);
}

/* ===== THEME STYLING ===== */
/**
 * Retrieves and applies the current theme to the popup.
 * @returns {Promise<void>}
 */
async function setInitialStyle() {
  try {
    const theme = await browser.theme.getCurrent();
    applyThemeStyle(theme);
    console.info("Theme applied successfully:", theme);
  } catch (error) {
    console.error("Error retrieving initial theme:", error);
  }
}

/**
 * Applies theme styles based on the provided theme object.
 * @param {Object} theme - The theme object containing color properties.
 */
function applyThemeStyle(theme) {
  if (!theme || !theme.colors) return;
  const colors = theme.colors;
  const docStyle = document.documentElement.style;
  docStyle.setProperty("--popup", colors.popup);
  docStyle.setProperty("--popup_border", colors.popup_border);
  docStyle.setProperty("--popup_highlight", colors.popup_highlight);
  docStyle.setProperty("--popup_highlight_text", colors.popup_highlight_text);
  docStyle.setProperty("--popup_text", colors.popup_text);
  docStyle.setProperty("--toolbar", colors.toolbar);
  docStyle.setProperty("--test", colors.toolbar_bottom_separator);
  console.info("Theme updated successfully:", theme);
}

browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  try {
    const currentWindow = await browser.windows.getCurrent();
    if (!windowId || windowId === currentWindow.id) {
      applyThemeStyle(theme);
    } else {
      console.info("Theme update skipped for windowId:", windowId);
    }
  } catch (error) {
    console.error("Error handling theme update:", error);
  }
});

/* ===== DRAG AND DROP HANDLERS ===== */
/**
 * Handles the drag start event for saved workspace items.
 * @param {DragEvent} e - The drag event.
 */
function handleDragStart(e) {
  e.dataTransfer.setData("workspaceId", e.currentTarget.dataset.wsid);
  e.dataTransfer.effectAllowed = "move";
}

/**
 * Handles the drag over event.
 * @param {DragEvent} e - The drag event.
 */
function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

/**
 * Handles the drop event to reorder saved workspace items.
 * Also saves the updated order.
 * @param {DragEvent} e - The drag event.
 */
function handleDrop(e) {
  e.preventDefault();
  const draggedWsId = e.dataTransfer.getData("workspaceId");
  // Fall back to unsaved window drop if needed.
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
    const bounding = targetItem.getBoundingClientRect();
    const offset = e.clientY - bounding.top;
    if (offset < bounding.height / 2) {
      savedList.insertBefore(draggedItem, targetItem);
    } else {
      savedList.insertBefore(draggedItem, targetItem.nextSibling);
    }
    persistSavedOrder();
  }
}

/**
 * Handles the drag end event.
 * Currently reserved for any optional cleanup.
 * @param {DragEvent} e - The drag event.
 */
function handleDragEnd(e) {
  // Optional cleanup if visual cues were added.
}

/**
 * Handles the drag start event for unsaved windows.
 * @param {DragEvent} e - The drag event.
 */
function handleDragStartUnsaved(e) {
  e.dataTransfer.setData("unsavedWindowId", e.currentTarget.dataset.wid);
  e.dataTransfer.effectAllowed = "copy";
}

/**
 * Reads the current order of saved workspaces from the UI and sends a message to persist it.
 */
function persistSavedOrder() {
  const savedList = document.getElementById("saved-list");
  const order = Array.from(savedList.querySelectorAll("li.saved-item")).map(item => parseInt(item.dataset.wsid));
  sendMessage({ action: "updateOrder", newOrder: order });
}

/**
 * Attaches drag and drop listeners to the saved list container.
 */
function setDragDropListeners() {
  const savedList = document.getElementById("saved-list");
  if (!savedList) return;
  savedList.addEventListener("dragover", e => { 
    e.preventDefault(); 
  });
  savedList.addEventListener("drop", e => {
    e.preventDefault();
    const unsavedWindowId = e.dataTransfer.getData("unsavedWindowId");
    if (unsavedWindowId) {
      sendMessage({ action: "saveWindow", windowId: parseInt(unsavedWindowId) });
    }
  });
}

/* ===== EXPORT & IMPORT FUNCTIONALITY ===== */
/**
 * Exports the saved workspaces data by requesting it from the background script,
 * converting the response to JSON, and triggering a download.
 * @returns {Promise<void>}
 */
async function exportWorkspaces() {
  try {
    const response = await browser.runtime.sendMessage({ action: "exportWorkspaces" });
    if (response && response.success) {
      const data = JSON.stringify(response.data, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workspace_backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus("Export successful.", false);
    } else {
      showStatus(response?.error || "Export failed.", true);
    }
  } catch (error) {
    console.error("Export error:", error);
    showStatus(error.message || "Export error.", true);
  }
}

/**
 * Handles the file input change event for importing workspace data.
 * Reads the file, parses JSON, and sends the data to the background script.
 * @param {Event} e - The file input change event.
 */
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const importedData = JSON.parse(evt.target.result);
      const response = await browser.runtime.sendMessage({ action: "importWorkspaces", data: importedData });
      if (response && response.success) {
        showStatus("Import successful.", false);
        await loadState(); // Refresh UI state after import.
      } else {
        showStatus(response?.error || "Import failed.", true);
      }
    } catch (error) {
      console.error("Import error:", error);
      showStatus(error.message || "Import error.", true);
    }
  };
  reader.readAsText(file);
}

/**
 * Creates UI elements for exporting and importing workspaces.
 * Adds export and import buttons along with a hidden file input for importing.
 */
function setupExportImportButtons() {
  const container = document.getElementById("export-import-controls");
  if (!container) return;
  
  // Create Export Button.
  const exportBtn = document.createElement("button");
  exportBtn.id = "export-btn";
  exportBtn.textContent = "Export Workspaces";
  exportBtn.addEventListener("click", exportWorkspaces);
  container.appendChild(exportBtn);
  
  // Create Import Button.
  const importBtn = document.createElement("button");
  importBtn.id = "import-btn";
  importBtn.textContent = "Import Workspaces";
  // Clicking the button simulates a click on the hidden file input.
  importBtn.addEventListener("click", () => {
    fileInput.click();
  });
  container.appendChild(importBtn);
  
  // Create a hidden file input element.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", handleImportFile);
  container.appendChild(fileInput);
}