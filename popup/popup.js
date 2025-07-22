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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initPopup();
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
    <img src="default-favicon.png" alt="?" class="favicon">
    <div class="title-stack">
      <span class="label">${workspace.title || "(No Title)"}</span>
      <span class="subtitle">${subtitle}</span>
    </div>
    <button class="edit-btn" data-wsid="${workspace.id}">Edit</button>
  `;

  setFavicon(li, workspace.windowId, workspace.favicon || "default-favicon.png");

  // Pointer/click/context menu logic remains, but can be further modularized if needed
  let pointerDragging = false;
  let pointerStartX = 0, pointerStartY = 0;
  const DRAG_THRESHOLD = 5;
  function isContextMenuOpenForThis() {
    return (
      contextMenuEl &&
      contextMenuEl.style.display === "block" &&
      contextMenuOpenForWorkspaceId == workspace.id
    );
  }
  function isContextMenuOpenForOther() {
    return (
      contextMenuEl &&
      contextMenuEl.style.display === "block" &&
      contextMenuOpenForWorkspaceId != workspace.id
    );
  }
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
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      pointerDragging = true;
    }
  });
  li.addEventListener("pointerup", (e) => {
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu")) return;
    if (isContextMenuOpenForOther()) {
      hideContextMenu();
      pointerDragging = false;
      return;
    }
    if (isContextMenuOpenForThis()) {
      hideContextMenu();
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
    if (isContextMenuOpenForThis()) {
      hideContextMenu();
      return;
    }
    if (isContextMenuOpenForOther()) {
      hideContextMenu();
    }
    showContextMenu(e, workspace.id);
  });
  const editBtn = li.querySelector(".edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (isContextMenuOpenForThis()) {
        hideContextMenu();
        return;
      }
      if (isContextMenuOpenForOther()) {
        hideContextMenu();
      }
      const rect = editBtn.getBoundingClientRect();
      showContextMenu(
        { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {} },
        parseInt(workspace.id, 10)
      );
    });
    editBtn.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (isContextMenuOpenForThis()) {
        hideContextMenu();
        return;
      }
      if (isContextMenuOpenForOther()) {
        hideContextMenu();
      }
      const rect = editBtn.getBoundingClientRect();
      showContextMenu(
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
    //list.innerHTML = "<li>No unsaved windows</li>";
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
  // Calculate tab count subtitle
  const tabCount = Array.isArray(win.tabs) ? win.tabs.length : 0;
  const subtitle = tabCount === 1 ? "1 Tab" : `${tabCount} Tabs`;
  li.innerHTML = `<img src="default-favicon.png" alt="?" class="favicon">
                  <div class="title-stack">
                    <span class="label">${win.title || "(Error: No Title)"}</span>
                    <span class="subtitle">${subtitle}</span>
                  </div>
                  <button class="save-btn" data-wid="${win.windowId}">Save</button>`;

  setFavicon(li, win.windowId, "default-favicon.png");

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
let contextMenuEl; // Global context menu element
let contextMenuOpenForWorkspaceId = null; // Track which workspace the context menu is open for

/**
 * Creates a context menu item element with the given label, class, and click handler.
 * @param {string} label - The text label for the menu item.
 * @param {string} className - The CSS class for the menu item.
 * @param {Function} onClick - The click event handler.
 * @returns {HTMLElement} The created menu item element.
 */
function createContextMenuItem(label, className, onClick) {
  const item = document.createElement("div");
  item.textContent = label;
  item.className = className;
  item.addEventListener("click", onClick);
  return item;
}

/**
 * Creates and appends the custom context menu to the document body.
 */
function createContextMenu() {
  try {
    contextMenuEl = document.createElement("div");
    contextMenuEl.id = "context-menu";

    // Use modular item creation
    const renameItem = createContextMenuItem("Rename", "context-menu-item", onRenameClick);
    const unsaveItem = createContextMenuItem("Unsave", "context-menu-item", onUnsaveClick);

    contextMenuEl.appendChild(renameItem);
    contextMenuEl.appendChild(unsaveItem);
    document.body.appendChild(contextMenuEl);
  } catch (error) {
    console.error("Error creating context menu:", error);
    if (typeof showStatus === 'function') {
      showStatus("Failed to create context menu.", true);
    }
  }
}

/**
 * Displays the context menu at the mouse event position, ensuring it stays within bounds.
 * @param {MouseEvent} e - The right-click event.
 * @param {number} workspaceId - The workspace ID for the menu.
 */
function showContextMenu(e, workspaceId) {
  if (!contextMenuEl) {
    console.error("Context menu not initialized.");
    if (typeof showStatus === 'function') {
      showStatus("Context menu not initialized.", true);
    }
    return;
  }
  try {
    // Temporarily make the context menu visible to calculate its dimensions
    contextMenuEl.style.visibility = "hidden";
    contextMenuEl.style.display = "block";

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = contextMenuEl.offsetWidth;
    const menuHeight = contextMenuEl.offsetHeight;

    let left = e.clientX;
    let top = e.clientY;

    // Ensure the menu is within 20px of the viewport bounds
    if (left + menuWidth > viewportWidth - 20) {
      left = viewportWidth - menuWidth - 20;
    }
    if (top + menuHeight > viewportHeight - 20) {
      top = viewportHeight - menuHeight - 20;
    }
    if (left < 20) {
      left = 20;
    }
    if (top < 20) {
      top = 20;
    }

    contextMenuEl.style.left = `${left}px`;
    contextMenuEl.style.top = `${top}px`;
    contextMenuEl.style.visibility = "visible";
    contextMenuEl.style.display = "block";
    contextMenuOpenForWorkspaceId = workspaceId;
    contextMenuEl.dataset.wsid = workspaceId;
  } catch (error) {
    console.error("Error showing context menu:", error);
    if (typeof showStatus === 'function') {
      showStatus("Failed to show context menu.", true);
    }
  }
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

// disable the default context menu everywhere
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
/**
 * Retrieves and applies the current theme to the popup.
 * @returns {Promise<void>}
 */
async function setInitialStyle() {
  try {
    const theme = await browser.theme.getCurrent();
    applyThemeStyle(theme);
    //console.info("Theme applied successfully:", theme);
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
  docStyle.setProperty("--Menu", colors.popup);
  docStyle.setProperty("--MenuText", colors.popup_text);
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
 * This section implements a pointer-based drag-and-drop reordering widget for list items.
 * It is modular and does not interfere with the existing drag-and-drop logic above.
 *
 * To use, add the 'js-list' class to a <ul> or <ol> and 'js-item' to its <li> children.
 */

'use strict';

// Global variables and cached elements for the widget
let listContainer = null; // The container element for the draggable list
let draggableItem = null; // The item currently being dragged
let pointerStartX = 0; // X position where pointer started
let pointerStartY = 0; // Y position where pointer started
let items = []; // Cached list of items

function setupPointerDnD() {
  const list = getDomElement("saved-list");
  if (!list) return;
  listContainer = list;
  list.onpointerdown = null;
  list.addEventListener('pointerdown', pointerDownHandler);
}

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

function initDraggableItem() {
  if (!draggableItem) return;
  draggableItem.classList.remove('is-idle');
  draggableItem.classList.add('is-draggable');
}

function initItemsState() {
  getIdleItems().forEach((item, index) => {
    if (getAllItems().indexOf(draggableItem) > index) {
      item.dataset.isAbove = 'true';
    }
  });
}

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

function getAllItems() {
  if (!listContainer) return [];
  items = Array.from(listContainer.querySelectorAll('.js-item'));
  return items;
}

function getIdleItems() {
  return getAllItems().filter((item) => item.classList.contains('is-idle'));
}

function isItemAbove(item) {
  return item.hasAttribute('data-is-above');
}

function isItemToggled(item) {
  return item.hasAttribute('data-is-toggled');
}

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

function unsetDraggableItem() {
  if (!draggableItem) return;
  draggableItem.style.transform = '';
  draggableItem.classList.remove('is-draggable');
  draggableItem.classList.add('is-idle');
  draggableItem = null;
}

function unsetItemState() {
  getIdleItems().forEach((item) => {
    delete item.dataset.isAbove;
    delete item.dataset.isToggled;
    item.style.transform = '';
  });
}

function disablePageScroll() {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.body.style.userSelect = 'none';
}

function enablePageScroll() {
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';
}

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
        onButtonClick(e);
      });
    }
  }
}