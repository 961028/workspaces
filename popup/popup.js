// ===== popup-constants.js =====
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

/**
 * Default favicon URL for workspace and window items.
 * @constant {string}
 */
const DEFAULT_FAVICON = browser.runtime.getURL('icons/globe-16.svg');

/**
 * Margin in pixels to keep context menu within viewport bounds.
 * @constant {number}
 */
const CONTEXT_MENU_MARGIN = 20;

/**
 * Threshold in pixels to detect pointer drag for workspace items.
 * @constant {number}
 */
const POINTER_DRAG_THRESHOLD = 5;

// ===== popup-dom-utils.js =====
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

// ===== popup-init.js =====
class PopupApp {
  /**
   * Initializes the popup by setting up context menus, drag-and-drop listeners, loading state, and theme.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      contextMenu.create();
      await loadState();
      document.addEventListener("click", () => contextMenu.hide());
      await themeManager.setInitialStyle();
      themeManager.listenForThemeUpdates();
    } catch (error) {
      console.error("Error during popup initialization:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const app = new PopupApp();
  try {
    await app.init();
  } catch (error) {
    console.error("Error during DOMContentLoaded initialization:", error);
  }
});

// ===== popup-state.js =====
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

// ===== popup-saved-ui.js =====
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
    list.innerHTML = '<div class="empty-message">You don\'t have any saved windows yet.</div>';
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
  li.className = "saved-item js-item is-idle";
  if (workspace.windowId && workspace.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  // Calculate tab count subtitle
  const tabCount = Array.isArray(workspace.tabs) ? workspace.tabs.length : 0;
  const subtitle = tabCount === 1 ? "1 Tab" : `${tabCount} Tabs`;
  li.innerHTML = `
    <img src="${DEFAULT_FAVICON}" alt="?" class="favicon">
    <div class="title-stack">
      <span class="label">${workspace.title || "(No Title)"}</span>
      <span class="subtitle">${subtitle}</span>
    </div>
    <button class="edit-btn" data-wsid="${workspace.id}">Edit</button>
  `;

  setFavicon(li, workspace.windowId, workspace.favicon || DEFAULT_FAVICON);

  let pointerDragging = false;
  let pointerStartX = 0, pointerStartY = 0;
  li.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu") || e.button === 2) return;
    pointerDragging = false;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
  });
  li.addEventListener("pointermove", (e) => {
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu") || e.button === 2) return;
    const dx = Math.abs(e.clientX - pointerStartX);
    const dy = Math.abs(e.clientY - pointerStartY);
    if (dx > POINTER_DRAG_THRESHOLD || dy > POINTER_DRAG_THRESHOLD) {
      pointerDragging = true;
    }
  });
  li.addEventListener("pointerup", (e) => {
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu")) return;
    if (contextMenu.isOpenForOtherWorkspace(workspace.id)) {
      contextMenu.hide();
      pointerDragging = false;
      return;
    }
    if (contextMenu.isOpenForWorkspace(workspace.id)) {
      contextMenu.hide();
      pointerDragging = false;
      return;
    }
    if (!pointerDragging) {
      sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id, 10) });
    }
    pointerDragging = false;
  });
  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (contextMenu.isOpenForWorkspace(workspace.id)) {
      contextMenu.hide();
      return;
    }
    if (contextMenu.isOpenForOtherWorkspace(workspace.id)) {
      contextMenu.hide();
    }
    contextMenu.show(e, workspace.id);
  });
  const editBtn = li.querySelector(".edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (contextMenu.isOpenForWorkspace(workspace.id)) {
        contextMenu.hide();
        return;
      }
      if (contextMenu.isOpenForOtherWorkspace(workspace.id)) {
        contextMenu.hide();
      }
      const rect = editBtn.getBoundingClientRect();
      contextMenu.show(
        { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {} },
        parseInt(workspace.id, 10)
      );
    });
    editBtn.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (contextMenu.isOpenForWorkspace(workspace.id)) {
        contextMenu.hide();
        return;
      }
      if (contextMenu.isOpenForOtherWorkspace(workspace.id)) {
        contextMenu.hide();
      }
      const rect = editBtn.getBoundingClientRect();
      contextMenu.show(
        { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {} },
        parseInt(workspace.id, 10)
      );
    });
    editBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    editBtn.addEventListener("pointermove", (e) => { e.stopPropagation(); });
    editBtn.addEventListener("pointerup", (e) => { e.stopPropagation(); });
  }
  return li;
}

// ===== popup-unsaved-ui.js =====
/**
 * Updates the unsaved windows list in the popup.
 * @param {Array<Object>} unsaved - Array of unsaved window objects.
 * @param {number} currentWindowId - The active window ID.
 */
function updateUnsavedList(unsaved, currentWindowId) {
  const list = getDomElement("unsaved-list");
  const hr = document.querySelector("hr");
  if (!list) return;

  // Dynamically show or hide the <hr> element
  if (unsaved && unsaved.length > 0) {
    if (!hr) {
      const newHr = document.createElement("hr");
      list.parentNode.insertBefore(newHr, list);
    }
  } else if (hr) {
    hr.remove();
  }

  list.innerHTML = "";
  if (!Array.isArray(unsaved) || unsaved.length === 0) {
    // list.innerHTML = "<li>No unsaved windows</li>";
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
  li.className = "unsaved-item js-item is-idle";
  if (win.windowId && win.windowId === currentWindowId) {
    li.classList.add("highlight");
  }
  // Calculate tab count subtitle
  const tabCount = Array.isArray(win.tabs) ? win.tabs.length : 0;
  const subtitle = tabCount === 1 ? "1 Tab" : `${tabCount} Tabs`;
  li.innerHTML = `<img src="${DEFAULT_FAVICON}" alt="?" class="favicon">
                  <div class="title-stack">
                    <span class="label">${win.title || "(Error: No Title)"}</span>
                    <span class="subtitle">${subtitle}</span>
                  </div>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;

  setFavicon(li, win.windowId, DEFAULT_FAVICON);

  addListItemEvents(li, {
      onDragStart: handleDragStartUnsaved,
      onClick: () => {
        sendMessage({ action: "focusWindow", windowId: parseInt(win.windowId, 10) });
      },
      buttonSelector: ".save-btn",
      onButtonClick: () => {
        sendMessage({ action: "saveWindow", windowId: parseInt(win.windowId, 10) });
      }
    });
  return li;
}

// ===== popup-context-menu.js =====
// Refactored: ContextMenu class encapsulates all context menu logic
class ContextMenu {
  constructor() {
    this.contextMenuEl = null;
    this.contextMenuOpenForWorkspaceId = null;
  }

  createContextMenuItem(label, className, onClick) {
    const item = document.createElement("div");
    item.textContent = label;
    item.className = className;
    item.addEventListener("click", onClick);
    return item;
  }

  create() {
    try {
      this.contextMenuEl = document.createElement("div");
      this.contextMenuEl.id = "context-menu";
      const renameItem = this.createContextMenuItem("Rename", "context-menu-item", () => this.onRenameClick());
      const unsaveItem = this.createContextMenuItem("Unsave", "context-menu-item", () => this.onUnsaveClick());
      this.contextMenuEl.appendChild(renameItem);
      this.contextMenuEl.appendChild(unsaveItem);
      document.body.appendChild(this.contextMenuEl);
    } catch (error) {
      console.error("Error creating context menu:", error);
      if (typeof showStatus === 'function') {
        showStatus("Failed to create context menu.", true);
      }
    }
  }

  show(e, workspaceId) {
    if (!this.contextMenuEl) {
      console.error("Context menu not initialized.");
      if (typeof showStatus === 'function') {
        showStatus("Context menu not initialized.", true);
      }
      return;
    }
    try {
      this.contextMenuEl.style.visibility = "hidden";
      this.contextMenuEl.style.display = "block";
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = this.contextMenuEl.offsetWidth;
      const menuHeight = this.contextMenuEl.offsetHeight;
      let left = e.clientX;
      let top = e.clientY;
      if (left + menuWidth > viewportWidth - CONTEXT_MENU_MARGIN) {
        left = viewportWidth - menuWidth - CONTEXT_MENU_MARGIN;
      }
      if (top + menuHeight > viewportHeight - CONTEXT_MENU_MARGIN) {
        top = viewportHeight - menuHeight - CONTEXT_MENU_MARGIN;
      }
      if (left < CONTEXT_MENU_MARGIN) {
        left = CONTEXT_MENU_MARGIN;
      }
      if (top < CONTEXT_MENU_MARGIN) {
        top = CONTEXT_MENU_MARGIN;
      }
      this.contextMenuEl.style.left = `${left}px`;
      this.contextMenuEl.style.top = `${top}px`;
      this.contextMenuEl.style.visibility = "visible";
      this.contextMenuEl.style.display = "block";
      this.contextMenuOpenForWorkspaceId = workspaceId;
      this.contextMenuEl.dataset.wsid = workspaceId;
    } catch (error) {
      console.error("Error showing context menu:", error);
      if (typeof showStatus === 'function') {
        showStatus("Failed to show context menu.", true);
      }
    }
  }

  hide() {
    if (this.contextMenuEl) {
      this.contextMenuEl.style.display = "none";
      this.contextMenuOpenForWorkspaceId = null;
    } else {
      console.warn("Context menu element is not defined.");
    }
  }

  onRenameClick() {
    this.hide();
    const wsid = parseInt(this.contextMenuEl?.dataset.wsid, 10);
    const newTitle = prompt("Enter new name for workspace:");
    if (newTitle && newTitle.trim() !== "") {
      sendMessage({ action: "renameWorkspace", workspaceId: wsid, newTitle: newTitle.trim() });
    } else {
      console.info("Rename canceled due to empty input.");
    }
  }

  onUnsaveClick() {
    this.hide();
    const wsid = parseInt(this.contextMenuEl?.dataset.wsid, 10);
    sendMessage({ action: "unsaveWorkspace", workspaceId: wsid });
  }

  isOpenForWorkspace(workspaceId) {
    return (
      this.contextMenuEl &&
      this.contextMenuEl.style.display === "block" &&
      this.contextMenuOpenForWorkspaceId == workspaceId
    );
  }
  isOpenForOtherWorkspace(workspaceId) {
    return (
      this.contextMenuEl &&
      this.contextMenuEl.style.display === "block" &&
      this.contextMenuOpenForWorkspaceId != workspaceId
    );
  }
}

const contextMenu = new ContextMenu();

document.addEventListener('contextmenu', e => {
  e.preventDefault();
});

// ===== popup-status.js =====
/**
 * Displays a status message to the user and automatically clears it.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message indicates an error.
 */
function showStatus(message, isError) {
  try {
    const statusEl = getDomElement("status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError ? "error" : "success";
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
    }, STATUS_DISPLAY_TIME);
  } catch (error) {
    console.error("Error displaying status message:", error);
  }
}

// ===== popup-theme.js =====
class ThemeManager {
  async setInitialStyle() {
    try {
      const theme = await browser.theme.getCurrent();
      this.applyThemeStyle(theme);
    } catch (error) {
      console.error("Error retrieving initial theme:", error);
    }
  }

  applyThemeStyle(theme) {
    if (!theme || !theme.colors) {
      console.warn("Invalid theme or missing color information.");
      return;
    }
    const { colors } = theme;
    const docStyle = document.documentElement.style;
    docStyle.setProperty("--Menu", colors.popup);
    docStyle.setProperty("--MenuText", colors.popup_text);
  }

  listenForThemeUpdates() {
    browser.theme.onUpdated.addListener(async ({ theme, windowId }) => {
      try {
        const currentWindow = await browser.windows.getCurrent();
        if (!windowId || windowId === currentWindow.id) {
          this.applyThemeStyle(theme);
        } else {
          console.info("Theme update skipped for windowId:", windowId);
        }
      } catch (error) {
        console.error("Error handling theme update:", error);
      }
    });
  }
}

const themeManager = new ThemeManager();

// ===== popup-drag.js =====
/**
 * Handles drag start for unsaved window items.
 * Sets the dataTransfer payload and effect for the drag event.
 * @param {DragEvent} e - The drag event.
 */
function handleDragStartUnsaved(e) {
  try {
    if (!e?.dataTransfer || !e.currentTarget) return;
    e.dataTransfer.setData("unsavedWindowId", e.currentTarget.dataset.wid);
    e.dataTransfer.effectAllowed = "copy";
  } catch (error) {
    console.error("Error in handleDragStartUnsaved:", error);
    if (typeof showStatus === 'function') {
      showStatus("Failed to start drag operation.", true);
    }
  }
}

/**
 * Persists the new order of saved workspaces by sending the updated order to the background script.
 * Shows an error if the saved list element is not found.
 */
function persistSavedOrder() {
  try {
    const savedList = getDomElement("saved-list");
    if (!savedList) {
      console.error("Cannot persist order; saved list element not found.");
      if (typeof showStatus === 'function') {
        showStatus("Failed to persist order.", true);
      }
      return;
    }
    const order = Array.from(savedList.querySelectorAll("li.saved-item")).map((item) =>
      parseInt(item.dataset.wsid, 10)
    );
    sendMessage({ action: "updateOrder", newOrder: order });
  } catch (error) {
    console.error("Error in persistSavedOrder:", error);
    if (typeof showStatus === 'function') {
      showStatus("Failed to persist order.", true);
    }
  }
}

// ===== popup-drag-pointer.js =====
/**
 * Implements a pointer-based drag-and-drop reordering widget for list items.
 * To use, add the 'js-list' class to a <ul> or <ol> and 'js-item' to its <li> children.
 */

/**
 * Global variables and cached elements for the widget
 */
let listContainer = null; // The container element for the draggable list
let draggableItem = null; // The item currently being dragged
let pointerStartX = 0; // X position where pointer started
let pointerStartY = 0; // Y position where pointer started
let items = []; // Cached list of items

/**
 * Sets up pointer-based drag-and-drop for the saved list.
 */
function setupPointerDnD() {
  const list = getDomElement("saved-list");
  if (!list) return;
  listContainer = list;
  list.onpointerdown = null;
  list.addEventListener('pointerdown', pointerDownHandler);
}

/**
 * Handles pointer down event for drag start.
 * @param {PointerEvent} e
 */
function pointerDownHandler(e) {
  if (e.button !== 0) return;
  draggableItem = e.target.closest('.js-item');
  if (!draggableItem) return;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  disablePageScroll();
  initDraggableItem();
  initItemsState();

  draggableItem.setPointerCapture(e.pointerId);
  draggableItem.addEventListener('pointermove', pointerMoveHandler);
  draggableItem.addEventListener('pointerup', pointerUpHandler);
  draggableItem.addEventListener('pointercancel', pointerUpHandler);
}

/**
 * Handles pointer move event for dragging.
 * @param {PointerEvent} e
 */
function pointerMoveHandler(e) {
  if (!draggableItem) return;
  e.preventDefault();
  const currentX = e.clientX;
  const currentY = e.clientY;
  const offsetX = currentX - pointerStartX;
  const offsetY = currentY - pointerStartY;
  draggableItem.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  updateIdleItemsStateAndPosition();
}

/**
 * Handles pointer up event to finish dragging.
 * @param {PointerEvent} e
 */
function pointerUpHandler(e) {
  if (!draggableItem) return;
  draggableItem.removeEventListener('pointermove', pointerMoveHandler);
  draggableItem.removeEventListener('pointerup', pointerUpHandler);
  draggableItem.removeEventListener('pointercancel', pointerUpHandler);
  draggableItem.releasePointerCapture(e.pointerId);
  applyNewItemsOrder();
  persistSavedOrder();
  cleanup();
}

/**
 * Initializes the draggable item state.
 */
function initDraggableItem() {
  if (!draggableItem) return;
  draggableItem.classList.remove('is-idle');
  draggableItem.classList.add('is-draggable');
}

/**
 * Initializes the state of idle items for drag-and-drop.
 */
function initItemsState() {
  getIdleItems().forEach((item, index) => {
    if (getAllItems().indexOf(draggableItem) > index) {
      item.dataset.isAbove = 'true';
    }
  });
}

/**
 * Updates the state and position of idle items during drag.
 */
function updateIdleItemsStateAndPosition() {
  if (!draggableItem) return;
  const draggableRect = draggableItem.getBoundingClientRect();
  const draggableCenterY = draggableRect.top + draggableRect.height / 2;
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
  getIdleItems().forEach((item) => {
    if (isItemToggled(item)) {
      const direction = isItemAbove(item) ? 1 : -1;
      item.style.transform = `translateY(${direction * (draggableRect.height + ITEMS_GAP)}px)`;
    } else {
      item.style.transform = '';
    }
  });
}

/**
 * Returns all draggable items in the list.
 * @returns {HTMLElement[]}
 */
function getAllItems() {
  if (!listContainer) return [];
  items = Array.from(listContainer.querySelectorAll('.js-item'));
  return items;
}

/**
 * Returns all idle (non-dragged) items.
 * @returns {HTMLElement[]}
 */
function getIdleItems() {
  return getAllItems().filter((item) => item.classList.contains('is-idle'));
}

/**
 * Checks if an item is above the dragged item.
 * @param {HTMLElement} item
 * @returns {boolean}
 */
function isItemAbove(item) {
  return item.hasAttribute('data-is-above');
}

/**
 * Checks if an item is toggled for movement.
 * @param {HTMLElement} item
 * @returns {boolean}
 */
function isItemToggled(item) {
  return item.hasAttribute('data-is-toggled');
}

/**
 * Applies the new order of items after drag-and-drop.
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
 * Unsets the draggable item state and resets its style.
 */
function unsetDraggableItem() {
  if (!draggableItem) return;
  draggableItem.style.transform = '';
  draggableItem.classList.remove('is-draggable');
  draggableItem.classList.add('is-idle');
  draggableItem = null;
}

/**
 * Unsets the state of all idle items.
 */
function unsetItemState() {
  getIdleItems().forEach((item) => {
    delete item.dataset.isAbove;
    delete item.dataset.isToggled;
    item.style.transform = '';
  });
}

/**
 * Disables page scrolling and text selection during drag.
 */
function disablePageScroll() {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.body.style.userSelect = 'none';
}

/**
 * Enables page scrolling by removing the overflow:hidden style from the body.
 */
function enablePageScroll() {
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';
}

/**
 * Cleans up drag state and resets all items and page scroll.
 */
function cleanup() {
  items = [];
  unsetDraggableItem();
  unsetItemState();
  enablePageScroll();
}

// ===== popup-ui-helpers.js =====
/**
 * Shared popup UI helpers for workspace and window list items.
 * Provides reusable logic for creating list items and handling common events.
 */

/**
 * Sets the favicon for a list item if available from the browser tab or fallback.
 * @param {HTMLElement} li - The list item element.
 * @param {number} windowId - The window ID to query for favicon.
 * @param {string} [fallback] - Optional fallback favicon URL.
 */
function setFavicon(li, windowId, fallback) {
  const defaultFallback = browser.runtime.getURL('icons/globe-16.svg');
  const iconToUse = fallback || defaultFallback;
  if (windowId) {
    browser.tabs.query({ windowId, active: true }).then((tabs) => {
      const img = li.querySelector('.favicon');
      if (tabs && tabs[0] && tabs[0].favIconUrl) {
        if (img) img.src = tabs[0].favIconUrl;
      } else if (img) {
        img.src = iconToUse;
      }
    }).catch(() => {
      const img = li.querySelector('.favicon');
      if (img) img.src = iconToUse;
    });
  } else {
    const img = li.querySelector('.favicon');
    if (img) img.src = iconToUse;
  }
}

/**
 * Adds drag and click event listeners to a list item for workspace/window actions.
 * @param {HTMLElement} li - The list item element.
 * @param {Object} options - Options for event handling.
 * @param {Function} [options.onDragStart] - Handler for drag start.
 * @param {Function} [options.onClick] - Handler for click (excluding button clicks).
 * @param {string} [options.buttonSelector] - Selector for action button inside li.
 * @param {Function} [options.onButtonClick] - Handler for button click.
 */
function addListItemEvents(li, { onDragStart, onClick, buttonSelector, onButtonClick }) {
  if (onDragStart) {
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', onDragStart);
  }
  if (onClick) {
    li.addEventListener('click', (e) => {
      if (buttonSelector && e.target.classList.contains(buttonSelector.replace('.', ''))) return;
      onClick(e);
    });
  }
  if (buttonSelector && onButtonClick) {
    const btn = li.querySelector(buttonSelector);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onButtonClick(e);
      });
    }
  }
}