// ===== constants.js =====
// constants.jsa
// ===== CONSTANTS =====
/**
 * Global constant defining status message display time in milliseconds.
 * @constant {number}
 */
const STATUS_DISPLAY_TIME = 3000;

/**
 * Gap between items in pixels for pointer-based drag-and-drop.
 * @constant {number}
 */
const ITEMS_GAP = 4;

/**
 * Default download filename for workspace export.
 * @constant {string}
 */
const EXPORT_FILENAME = "workspace_backup.json";


// ===== dom.js =====
// dom.js
// ===== HELPER FUNCTIONS =====
/**
 * Retrieves a DOM element by its ID and logs a warning if it is not found.
 * @param {string} id - The ID of the element.
 * @returns {HTMLElement|null} The DOM element or null if not found.
 */
function getDomElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with id "${id}" not found.`);
  }
  return element;
}

/**
 * Inserts a dragged item before or after a target item based on vertical position.
 * @param {HTMLElement} list - The parent list element.
 * @param {HTMLElement} draggedItem - The item being dragged.
 * @param {HTMLElement} targetItem - The target item at drop.
 * @param {number} clientY - The Y-coordinate of the drop event.
 */
function reorderItem(list, draggedItem, targetItem, clientY) {
  const bounding = targetItem.getBoundingClientRect();
  const offset = clientY - bounding.top;
  if (offset < bounding.height / 2) {
    list.insertBefore(draggedItem, targetItem);
  } else {
    list.insertBefore(draggedItem, targetItem.nextSibling);
  }
}


// ===== import_export.js =====
// import_export.js
// ===== EXPORT & IMPORT FUNCTIONALITY =====
/**
 * Processes the raw text data from an import file.
 * @param {string} dataString - The raw JSON string from a file.
 * @returns {Promise<void>}
 */
async function processImportData(dataString) {
  try {
    const importedData = JSON.parse(dataString);
    const response = await browser.runtime.sendMessage({
      action: "importWorkspaces",
      data: importedData,
    });
    if (response && response.success) {
      showStatus("Import successful.", false);
      await loadState();
    } else {
      showStatus(response?.error || "Import failed.", true);
    }
  } catch (error) {
    console.error("Process import error:", error);
    showStatus(error.message || "Import error.", true);
  }
}

/**
 * Exports the saved workspaces by triggering a download of JSON data.
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
      a.download = EXPORT_FILENAME; // Use constant for filename
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
 * @param {Event} e - The file input change event.
 */
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) {
    console.warn("No file selected for import.");
    return;
  }
  const reader = new FileReader();
  reader.onload = async function (evt) {
    await processImportData(evt.target.result);
  };
  reader.readAsText(file);
}

/**
 * Sets up the export and import buttons in the UI.
 */
function setupExportImportButtons() {
  const container = getDomElement("export-import-controls");
  if (!container) {
    console.warn("Export/Import container not found.");
    return;
  }

  // Create hidden file input for importing workspaces.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", handleImportFile);
  container.appendChild(fileInput);

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
  importBtn.addEventListener("click", () => fileInput.click());
  container.appendChild(importBtn);
}


// ===== init.js =====
// init.js
// ===== EVENT LISTENER FOR INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initPopup();
    setupExportImportButtons();
  } catch (error) {
    console.error("Error during DOMContentLoaded initialization:", error);
  }
});

// ===== INITIALIZATION =====
/**
 * Initializes the popup by setting up context menus, drag-and-drop listeners, loading state, and theme.
 * @returns {Promise<void>}
 */
async function initPopup() {
  try {
    createContextMenu();
    await loadState();
    document.addEventListener("click", hideContextMenu);
    await setInitialStyle();
  } catch (error) {
    console.error("Error during popup initialization:", error);
  }
}


// ===== state.js =====
// state.js
// ===== STATE LOADING =====
/**
 * Loads the state by retrieving the current window and fetching workspace data.
 * @returns {Promise<void>}
 */
async function loadState() {
  try {
    const currentWindow = await browser.windows.getLastFocused();
    if (!currentWindow || !currentWindow.id) {
      console.warn("Could not retrieve current window info.");
      showStatus("Failed to retrieve window information.", true);
      return;
    }
    const currentWindowId = currentWindow.id;
    const response = await browser.runtime.sendMessage({ action: "getState" });
    if (response && response.success) {
      updateSavedList(response.saved, currentWindowId);
      updateUnsavedList(response.unsaved, currentWindowId);
    } else {
      showStatus(response?.error || "Failed to retrieve state.", true);
    }
  } catch (err) {
    console.error("State load error:", err);
    showStatus(err.message || "Error retrieving state.", true);
  }
}

// ===== MESSAGE SENDER =====
/**
 * Sends a message to the background script and processes the response.
 * @param {Object} message - The message payload.
 * @returns {Promise<void>}
 */
async function sendMessage(message) {
  if (!message || typeof message !== "object") {
    console.error("Invalid message object:", message);
    showStatus("Invalid message data.", true);
    return;
  }
  try {
    const response = await browser.runtime.sendMessage(message);
    if (response && response.success) {
      showStatus(response.message || "Action completed.", false);
    } else {
      showStatus(response?.error || "Action failed.", true);
    }
    await loadState();
  } catch (error) {
    console.error("Error in sendMessage:", error);
    showStatus(error.message || "Communication error with background script.", true);
  }
}


// ===== saved_ui.js =====
// saved_ui.js
// ===== SAVED WORKSPACES UI =====
/**
 * Updates the saved workspaces list in the popup.
 * @param {Array<Object>} saved - Array of saved workspace objects.
 * @param {number} currentWindowId - The active window ID.
 */
function updateSavedList(saved, currentWindowId) {
  const list = getDomElement("saved-list");
  if (!list) return;
  list.innerHTML = "";
  list.classList.add("js-list"); // Add class for pointer-based drag-and-drop

  if (!Array.isArray(saved) || saved.length === 0) {
    list.innerHTML = "<li>(No saved workspaces)</li>";
    return;
  }
  // Sort workspaces by the order property (defaulting to 0)
  saved.sort((a, b) => (a.order || 0) - (b.order || 0));
  saved.forEach((ws) => {
    list.appendChild(createSavedListItem(ws, currentWindowId));
  });

  // Re-initialize pointer-based drag-and-drop after DOM update
  setupPointerDnD();
}

/**
 * Creates a list item (<li>) element for a saved workspace.
 * @param {Object} workspace - The workspace object.
 * @param {number} currentWindowId - The active window ID.
 * @returns {HTMLElement} The created list item.
 */
function createSavedListItem(workspace, currentWindowId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
  return li;
}


// ===== unsaved_ui.js =====
// unsaved_ui.js
// ===== UNSAVED WINDOWS UI =====
/**
 * Updates the unsaved windows list in the popup.
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The active window ID.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Creates a list item (<li>) element for an unsaved window.
 * @param {Object} win - The unsaved window object.
 * @param {number} currentWindowId - The active window ID.
 * @returns {HTMLElement} The created list item.
 */
function createUnsavedListItem(win, currentWindowId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}


// ===== context_menu.js =====
// context_menu.js
// ===== CUSTOM CONTEXT MENU =====
let contextMenuEl; // Global context menu element
let contextMenuOpenForWorkspaceId = null; // Track which workspace the context menu is open for

/**
 * Creates and appends the custom context menu to the document body.
 */
function createContextMenu() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Displays the context menu at the mouse event position, ensuring it stays within bounds.
 * @param {MouseEvent} e - The right-click event.
 * @param {number} workspaceId - The workspace ID for the menu.
 */
function showContextMenu(e, workspaceId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Hides the custom context menu.
 */
function hideContextMenu() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Handles the "Rename" action by prompting for a new name.
 */
function onRenameClick() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Handles the "Unsave" action.
 */
function onUnsaveClick() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}


// ===== status.js =====
// status.js
// ===== STATUS MESSAGE HANDLING =====
/**
 * Displays a status message to the user and automatically clears it.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message indicates an error.
 */
function showStatus(message, isError) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}


// ===== theme.js =====
// theme.js
// ===== THEME STYLING =====
/**
 * Retrieves and applies the current theme to the popup.
 * @returns {Promise<void>}
 */
async function setInitialStyle() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Applies CSS custom properties based on the theme colors.
 * @param {Object} theme - The theme object with color properties.
 */
function applyThemeStyle(theme) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
});


// ===== dnd.js =====
// dnd.js
// ===== DRAG AND DROP HANDLERS =====
/**
 * Handles drag start for unsaved window items.
 * @param {DragEvent} e - The drag event.
 */
function handleDragStartUnsaved(e) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Persists the new order of saved workspaces.
 */
function persistSavedOrder() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}


// ===== pointer_dnd.js =====
// pointer_dnd.js
// ===== ADVANCED DRAG-AND-DROP WIDGET (EXPERIMENTAL) =====
/**
 * This section implements a pointer-based drag-and-drop reordering widget for list items.
 * It is modular and does not interfere with the existing drag-and-drop logic above.
 *
 * To use, add the 'js-list' class to a <ul> or <ol> and 'js-item' to its <li> children.
 *
 * All logic is self-contained and follows the project's coding standards.
 */

'use strict';

// Global variables and cached elements for the widget
let listContainer = null; // The container element for the draggable list
let draggableItem = null; // The item currently being dragged
let pointerStartX = 0; // X position where pointer started
let pointerStartY = 0; // Y position where pointer started
let items = []; // Cached list of items

/**
 * Sets up the pointer-based drag-and-drop widget for the saved workspaces list.
 * Ensures only one event listener is attached at a time.
 */
function setupPointerDnD() {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

// ...existing code for pointerDownHandler, pointerMoveHandler, pointerUpHandler, etc...
// (All pointer-based drag-and-drop widget functions from popup_backup.js)
// ...existing code...


// ===== unsaved_ui copy.js =====
// unsaved_ui.js
// ===== UNSAVED WINDOWS UI =====
/**
 * Updates the unsaved windows list in the popup.
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The active window ID.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}

/**
 * Creates a list item (<li>) element for an unsaved window.
 * @param {Object} win - The unsaved window object.
 * @param {number} currentWindowId - The active window ID.
 * @returns {HTMLElement} The created list item.
 */
function createUnsavedListItem(win, currentWindowId) {
  // ...existing code...
  // (Full function body from popup_backup.js)
  // ...existing code...
}


