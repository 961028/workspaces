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
  if (!workspace) {
    console.warn("Invalid workspace provided.");
    return document.createElement("li");
  }
  const li = document.createElement("li");
  li.dataset.wsid = workspace.id;
  li.className = "saved-item js-item is-idle"; // Add js-item and is-idle for pointer-based DnD
  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }

  // Add favicon and title (async for live favicon)
  li.innerHTML = `
    <img src="default-favicon.png" alt="Favicon" class="favicon">
    <span class="label">${workspace.title || "(No Title)"}</span>
    <button class="edit-btn" data-wsid="${workspace.id}">Edit</button>
  `;
  if (workspace.windowId) {
    // Try to get the current favicon from the active tab of the window
    browser.tabs.query({ windowId: workspace.windowId, active: true }).then((tabs) => {
      if (tabs && tabs[0] && tabs[0].favIconUrl) {
        const img = li.querySelector(".favicon");
        if (img) img.src = tabs[0].favIconUrl;
      }
    }).catch(() => {});
  } else if (workspace.favicon) {
    // Fallback to stored favicon if available
    const img = li.querySelector(".favicon");
    if (img) img.src = workspace.favicon;
  }

  // Only open workspace on click if not currently dragging
  let pointerDragging = false;
  li.addEventListener("pointerdown", (e) => { 
    // If pointerdown is on the edit button, do not reset pointerDragging
    if (e.target.closest(".edit-btn")) return;
    pointerDragging = false; 
  });
  li.addEventListener("pointermove", (e) => { 
    // If pointermove is on the edit button, do not set pointerDragging
    if (e.target.closest(".edit-btn")) return;
    pointerDragging = true; 
  });
  li.addEventListener("pointerup", (e) => {
    // If pointerup is on the edit button, do not open workspace
    if (e.target.closest(".edit-btn")) return;
    // Prevent opening workspace if context menu is open
    if (contextMenuEl && contextMenuEl.style.display === "block") {
      return;
    }
    if (!pointerDragging) {
      sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id, 10) });
    }
    pointerDragging = false;
  });

  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu(e, workspace.id);
  });

  const editBtn = li.querySelector(".edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = editBtn.getBoundingClientRect();
      showContextMenu(
        { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {} },
        parseInt(workspace.id, 10)
      );
    });
  }

  return li;
}

// ===== UNSAVED WINDOWS UI =====
/**
 * Updates the unsaved windows list in the popup.
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The active window ID.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  const list = getDomElement("unsaved-list");
  if (!list) return;
  list.innerHTML = "";
  if (!Array.isArray(unsaved) || unsaved.length === 0) {
    list.innerHTML = "<li>(No unsaved windows)</li>";
    return;
  }
  unsaved.forEach((win) => {
    list.appendChild(createUnsavedListItem(win, currentWindowId));
  });
}

/**
 * Creates a list item (<li>) element for an unsaved window.
 * @param {Object} win - The unsaved window object.
 * @param {number} currentWindowId - The active window ID.
 * @returns {HTMLElement} The created list item.
 */
function createUnsavedListItem(win, currentWindowId) {
  if (!win) {
    console.warn("Invalid window object provided.");
    return document.createElement("li");
  }
  const li = document.createElement("li");
  li.dataset.wid = win.windowId;
  li.className = "unsaved-item";
  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  // Add favicon and title (async for live favicon)
  li.innerHTML = `<img src="default-favicon.png" alt="Favicon" class="favicon">
                  <span class="label">${win.title || "(Error: No Title)"}</span>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;
  browser.tabs.query({ windowId: win.windowId, active: true }).then((tabs) => {
    if (tabs && tabs[0] && tabs[0].favIconUrl) {
      const img = li.querySelector(".favicon");
      if (img) img.src = tabs[0].favIconUrl;
    }
  }).catch(() => {});

  li.setAttribute("draggable", "true");
  li.addEventListener("dragstart", handleDragStartUnsaved);

  // Separate click behavior for focusing vs. saving.
  li.addEventListener("click", (e) => {
    if (e.target.classList.contains("save-btn")) return;
    sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId, 10) });
  });

  const saveBtn = li.querySelector(".save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId, 10) });
    });
  }
  return li;
}

// ===== CUSTOM CONTEXT MENU =====
let contextMenuEl; // Global context menu element
let contextMenuOpenForWorkspaceId = null; // Track which workspace the context menu is open for

/**
 * Creates and appends the custom context menu to the document body.
 */
function createContextMenu() {
  contextMenuEl = document.createElement("div");
  contextMenuEl.id = "context-menu";

  // Create menu items using dedicated functions for single responsibilities.
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
 * Displays the context menu at the mouse event position.
 * @param {MouseEvent} e - The right-click event.
 * @param {number} workspaceId - The workspace ID for the menu.
 */
function showContextMenu(e, workspaceId) {
  if (!contextMenuEl) {
    console.error("Context menu not initialized.");
    return;
  }
  contextMenuEl.style.left = `${e.clientX}px`;
  contextMenuEl.style.top = `${e.clientY}px`;
  contextMenuEl.style.display = "block";
  contextMenuEl.dataset.wsid = workspaceId;
  contextMenuOpenForWorkspaceId = workspaceId;
}

/**
 * Hides the custom context menu.
 */
function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.style.display = "none";
    contextMenuOpenForWorkspaceId = null;
  } else {
    console.warn("Context menu element is not defined.");
  }
}

/**
 * Handles the "Rename" action by prompting for a new name.
 */
function onRenameClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl?.dataset.wsid, 10);
  const newTitle = prompt("Enter new name for workspace:");
  if (newTitle && newTitle.trim() !== "") {
    sendMessage({ action: "renameWorkspace", workspaceId: wsid, newTitle: newTitle.trim() });
  } else {
    console.info("Rename canceled due to empty input.");
  }
}

/**
 * Handles the "Unsave" action.
 */
function onUnsaveClick() {
  hideContextMenu();
  const wsid = parseInt(contextMenuEl?.dataset.wsid, 10);
  sendMessage({ action: "unsaveWorkspace", workspaceId: wsid });
}

// ===== STATUS MESSAGE HANDLING =====
/**
 * Displays a status message to the user and automatically clears it.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message indicates an error.
 */
function showStatus(message, isError) {
  const statusEl = getDomElement("status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "success";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, STATUS_DISPLAY_TIME);
}

// ===== THEME STYLING =====
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
 * Applies CSS custom properties based on the theme colors.
 * @param {Object} theme - The theme object with color properties.
 */
function applyThemeStyle(theme) {
  if (!theme || !theme.colors) {
    console.warn("Invalid theme or missing color information.");
    return;
  }
  const { colors } = theme;
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

// ===== DRAG AND DROP HANDLERS =====
/**
 * Handles drag start for unsaved window items.
 * @param {DragEvent} e - The drag event.
 */
function handleDragStartUnsaved(e) {
  if (!e?.dataTransfer || !e.currentTarget) return;
  e.dataTransfer.setData("unsavedWindowId", e.currentTarget.dataset.wid);
  e.dataTransfer.effectAllowed = "copy";
}

/**
 * Persists the new order of saved workspaces.
 */
function persistSavedOrder() {
  const savedList = getDomElement("saved-list");
  if (!savedList) {
    console.error("Cannot persist order; saved list element not found.");
    return;
  }
  const order = Array.from(savedList.querySelectorAll("li.saved-item")).map((item) =>
    parseInt(item.dataset.wsid, 10)
  );
  sendMessage({ action: "updateOrder", newOrder: order });
}

// ===== EXPORT & IMPORT FUNCTIONALITY =====
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
  const list = getDomElement("saved-list");
  if (!list) return;
  // Remove previous pointerdown listeners by replacing the node is problematic.
  // Instead, remove all pointerdown listeners by setting listContainer and using a fresh event listener.
  listContainer = list;
  // Remove any previous pointerdown event (by replacing the handler)
  list.onpointerdown = null;
  list.addEventListener('pointerdown', pointerDownHandler);
}

/**
 * Handler for pointerdown events. Initializes dragging of the entire list item.
 * @param {PointerEvent} e - The pointer event.
 */
function pointerDownHandler(e) {
  // Use closest to select the list item even if a child is clicked
  draggableItem = e.target.closest('.js-item');
  if (!draggableItem) return;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  disablePageScroll();
  initDraggableItem();
  initItemsState();

  // Capture all pointer events to the draggable item
  draggableItem.setPointerCapture(e.pointerId);
  draggableItem.addEventListener('pointermove', pointerMoveHandler);
  draggableItem.addEventListener('pointerup', pointerUpHandler);
  draggableItem.addEventListener('pointercancel', pointerUpHandler);
}

/**
 * Handler for pointermove events. Updates the draggable item's position and reorders idle items.
 * @param {PointerEvent} e - The pointer event.
 */
function pointerMoveHandler(e) {
  if (!draggableItem) return;
  // Prevent default behavior (e.g. scrolling or unwanted text selection)
  e.preventDefault();
  const currentX = e.clientX;
  const currentY = e.clientY;
  const offsetX = currentX - pointerStartX;
  const offsetY = currentY - pointerStartY;

  // Update draggable item’s position using CSS transform
  draggableItem.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

  updateIdleItemsStateAndPosition();
}

/**
 * Handler for pointerup (or pointercancel) events. Finalizes the drag operation, applies the new order, and cleans up.
 * @param {PointerEvent} e - The pointer event.
 */
function pointerUpHandler(e) {
  if (!draggableItem) return;
  draggableItem.removeEventListener('pointermove', pointerMoveHandler);
  draggableItem.removeEventListener('pointerup', pointerUpHandler);
  draggableItem.removeEventListener('pointercancel', pointerUpHandler);
  draggableItem.releasePointerCapture(e.pointerId);

  applyNewItemsOrder();
  persistSavedOrder(); // Persist order after pointer-based drag-and-drop
  cleanup();
}

/**
 * Activates the draggable item by switching its state.
 */
function initDraggableItem() {
  if (!draggableItem) return;
  draggableItem.classList.remove('is-idle');
  draggableItem.classList.add('is-draggable');
}

/**
 * Initializes state for idle items relative to the draggable item.
 */
function initItemsState() {
  getIdleItems().forEach((item, index) => {
    if (getAllItems().indexOf(draggableItem) > index) {
      item.dataset.isAbove = 'true';
    }
  });
}

/**
 * Updates the toggled state and visual position of idle items during dragging.
 */
function updateIdleItemsStateAndPosition() {
  if (!draggableItem) return;
  const draggableRect = draggableItem.getBoundingClientRect();
  const draggableCenterY = draggableRect.top + draggableRect.height / 2;
  // Update toggled state for each idle item based on its center relative to draggable center
  getIdleItems().forEach((item) => {
    const itemRect = item.getBoundingClientRect();
    const itemCenterY = itemRect.top + itemRect.height / 2;
    if (isItemAbove(item)) {
      if (draggableCenterY <= itemCenterY) {
        item.dataset.isToggled = 'true';
      } else {
        delete item.dataset.isToggled;
      }
    } else {
      if (draggableCenterY >= itemCenterY) {
        item.dataset.isToggled = 'true';
      } else {
        delete item.dataset.isToggled;
      }
    }
  });

  // Adjust position of idle items based on toggle state
  getIdleItems().forEach((item) => {
    if (isItemToggled(item)) {
      const direction = isItemAbove(item) ? 1 : -1;
      item.style.transform = `translateY(${direction * (draggableRect.height + ITEMS_GAP)}px)`; // Use constant for gap
    } else {
      item.style.transform = '';
    }
  });
}

/**
 * Retrieves and caches all list items.
 * @returns {HTMLElement[]} Array of list items.
 */
function getAllItems() {
  // Always get fresh items from the current listContainer
  if (!listContainer) return [];
  items = Array.from(listContainer.querySelectorAll('.js-item'));
  return items;
}

/**
 * Retrieves idle (non-dragged) items.
 * @returns {HTMLElement[]} Array of idle list items.
 */
function getIdleItems() {
  return getAllItems().filter((item) => item.classList.contains('is-idle'));
}

/**
 * Checks if an idle item was originally above the draggable item.
 * @param {HTMLElement} item - The item element.
 * @returns {boolean} True if the item was originally above.
 */
function isItemAbove(item) {
  return item.hasAttribute('data-is-above');
}

/**
 * Checks if an idle item is toggled during dragging.
 * @param {HTMLElement} item - The item element.
 * @returns {boolean} True if the item is toggled.
 */
function isItemToggled(item) {
  return item.hasAttribute('data-is-toggled');
}

/**
 * Applies the new order to the list items based on their toggle states.
 */
function applyNewItemsOrder() {
  const reorderedItems = [];
  getAllItems().forEach((item, index) => {
    if (item === draggableItem) return;
    if (!isItemToggled(item)) {
      reorderedItems[index] = item;
    } else {
      const newIndex = isItemAbove(item) ? index + 1 : index - 1;
      reorderedItems[newIndex] = item;
    }
  });

  for (let index = 0; index < getAllItems().length; index++) {
    if (typeof reorderedItems[index] === 'undefined') {
      reorderedItems[index] = draggableItem;
    }
  }

  reorderedItems.forEach((item) => {
    listContainer.appendChild(item);
  });
}

/**
 * Resets the draggable item back to its idle state.
 */
function unsetDraggableItem() {
  if (!draggableItem) return;
  draggableItem.style.transform = '';
  draggableItem.classList.remove('is-draggable');
  draggableItem.classList.add('is-idle');
  draggableItem = null;
}

/**
 * Clears toggle states and inline styles from idle items.
 */
function unsetItemState() {
  getIdleItems().forEach((item) => {
    delete item.dataset.isAbove;
    delete item.dataset.isToggled;
    item.style.transform = '';
  });
}

/**
 * Disables page scroll and text selection during dragging.
 */
function disablePageScroll() {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.body.style.userSelect = 'none';
}

/**
 * Re-enables page scroll and text selection after dragging.
 */
function enablePageScroll() {
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';
}

/**
 * Performs cleanup actions after the drag operation.
 */
function cleanup() {
  items = [];
  unsetDraggableItem();
  unsetItemState();
  enablePageScroll();
}
