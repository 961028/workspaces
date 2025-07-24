/**
 * Global constant defining status message display time in milliseconds.
 * @constant {number}
 */
const STATUS_DISPLAY_TIME = 3000;

/**
 * Gap between items in pixels for pointer-based drag-and-drop.
 * @constant {number}
 */
const ITEMS_GAP = 8;

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

/**
 * Loads the state by retrieving the current window and fetching workspace data.
 * @returns {Promise<void>}
 */
async function loadState() {
  try {
    const currentWindow = await browser.windows.getLastFocused();
    if (!currentWindow || !currentWindow.id) {
      console.warn("Could not retrieve current window info.");
      statusBar.show("Failed to retrieve window information.", true);
      return;
    }
    const currentWindowId = currentWindow.id;
    const response = await browser.runtime.sendMessage({ action: "getState" });
    if (response && response.success) {
      workspaceList.updateSavedList(response.saved, currentWindowId);
      workspaceList.updateUnsavedList(response.unsaved, currentWindowId);
    } else {
      statusBar.show(response?.error || "Failed to retrieve state.", true);
    }
  } catch (err) {
    console.error("State load error:", err);
    statusBar.show(err.message || "Error retrieving state.", true);
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
    statusBar.show("Invalid message data.", true);
    return;
  }
  try {
    const response = await browser.runtime.sendMessage(message);
    if (response && response.success) {
      statusBar.show(response.message || "Action completed.", false);
    } else {
      statusBar.show(response?.error || "Action failed.", true);
    }
    await loadState();
  } catch (error) {
    console.error("Error in sendMessage:", error);
    statusBar.show(error.message || "Communication error with background script.", true);
  }
}

class WorkspaceList {
  constructor(getDomElement, dragAndDropManager, statusBar) {
    this.getDomElement = getDomElement;
    this.dragAndDropManager = dragAndDropManager;
    this.statusBar = statusBar;
    this.faviconCache = {};
  }

  updateSavedList(saved, currentWindowId) {
    const list = this.getDomElement("saved-list");
    if (!list) return;
    list.innerHTML = "";
    list.classList.add("js-list");
    if (!Array.isArray(saved) || saved.length === 0) {
      list.innerHTML = '<div class="empty-message">You don\'t have any saved windows yet.</div>';
      return;
    }
    saved.sort((a, b) => (a.order || 0) - (b.order || 0));
    saved.forEach((ws) => {
      list.appendChild(this.createSavedListItem(ws, currentWindowId));
    });
    if (!list._dndInitialized) {
      this.dragAndDropManager.setupPointerDnD();
      list._dndInitialized = true;
    }
  }

  createSavedListItem(workspace, currentWindowId) {
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
    this.setFavicon(li, workspace.windowId, workspace.favicon || DEFAULT_FAVICON);

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

  updateUnsavedList(unsaved, currentWindowId) {
    const list = this.getDomElement("unsaved-list");
    const hr = document.querySelector("hr");
    if (!list) return;
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
      return;
    }
    unsaved.forEach((win) => {
      list.appendChild(this.createUnsavedListItem(win, currentWindowId));
    });
  }

  createUnsavedListItem(win, currentWindowId) {
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
    const tabCount = Array.isArray(win.tabs) ? win.tabs.length : 0;
    const subtitle = tabCount === 1 ? "1 Tab" : `${tabCount} Tabs`;
    li.innerHTML = `<img src="${DEFAULT_FAVICON}" alt="?" class="favicon">
                    <div class="title-stack">
                      <span class="label">${win.title || "(Error: No Title)"}</span>
                      <span class="subtitle">${subtitle}</span>
                    </div>
                    <button class="save-btn" data-wid="${win.windowId}">Save</button>`;
    this.setFavicon(li, win.windowId, DEFAULT_FAVICON);
    this.dragAndDropManager.addListItemEvents(li, {
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

  setFavicon(li, windowId, fallback) {
    const defaultFallback = DEFAULT_FAVICON;
    const iconToUse = fallback || defaultFallback;
    const img = li.querySelector('.favicon');
    if (!img) return;
    if (windowId) {
      if (this.faviconCache[windowId]) {
        img.src = this.faviconCache[windowId];
        return;
      }
      browser.tabs.query({ windowId, active: true }).then((tabs) => {
        if (tabs && tabs[0] && tabs[0].favIconUrl) {
          this.faviconCache[windowId] = tabs[0].favIconUrl;
          img.src = tabs[0].favIconUrl;
        } else {
          this.faviconCache[windowId] = iconToUse;
          img.src = iconToUse;
        }
      }).catch(() => {
        this.faviconCache[windowId] = iconToUse;
        img.src = iconToUse;
      });
    } else {
      img.src = iconToUse;
    }
  }
}

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
      statusBar.show("Failed to create context menu.", true);
    }
  }

  show(e, workspaceId) {
    if (!this.contextMenuEl) {
      console.error("Context menu not initialized.");
      statusBar.show("Context menu not initialized.", true);
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
      statusBar.show("Failed to show context menu.", true);
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

document.addEventListener('contextmenu', e => {
  e.preventDefault();
});

class StatusBar {
  constructor(statusId = "status") {
    this.statusEl = getDomElement(statusId);
    this.timeoutId = null;
  }

  show(message, isError) {
    try {
      if (!this.statusEl) return;
      this.statusEl.textContent = message;
      this.statusEl.className = isError ? "error" : "success";
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      this.timeoutId = setTimeout(() => {
        this.statusEl.textContent = "";
        this.statusEl.className = "";
      }, STATUS_DISPLAY_TIME);
    } catch (error) {
      console.error("Error displaying status message:", error);
    }
  }
}

function showStatus(message, isError) {
  statusBar.show(message, isError);
}

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
    statusBar.show("Failed to start drag operation.", true);
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
      statusBar.show("Failed to persist order.", true);
      return;
    }
    const order = Array.from(savedList.querySelectorAll("li.saved-item")).map((item) =>
      parseInt(item.dataset.wsid, 10)
    );
    sendMessage({ action: "updateOrder", newOrder: order });
  } catch (error) {
    console.error("Error in persistSavedOrder:", error);
    statusBar.show("Failed to persist order.", true);
  }
}

class DragAndDropManager {
  constructor() {
    this.listContainer = null;
    this.draggableItem = null;
    this.pointerStartX = 0;
    this.pointerStartY = 0;
    this.items = [];
  }

  setupPointerDnD() {
    const list = getDomElement("saved-list");
    if (!list) return;
    this.listContainer = list;
    this.listContainer.onpointerdown = null;
    this.listContainer.addEventListener('pointerdown', this.pointerDownHandler.bind(this));
  }

  pointerDownHandler(e) {
    if (e.button !== 0) return;
    this.draggableItem = e.target.closest('.js-item');
    if (!this.draggableItem) return;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.disablePageScroll();
    this.initDraggableItem();
    this.initItemsState();
    this.draggableItem.setPointerCapture(e.pointerId);
    this.draggableItem.addEventListener('pointermove', this.pointerMoveHandler.bind(this));
    this.draggableItem.addEventListener('pointerup', this.pointerUpHandler.bind(this));
    this.draggableItem.addEventListener('pointercancel', this.pointerUpHandler.bind(this));
  }

  pointerMoveHandler(e) {
    if (!this.draggableItem) return;
    e.preventDefault();
    const currentX = e.clientX;
    const currentY = e.clientY;
    const offsetX = currentX - this.pointerStartX;
    const offsetY = currentY - this.pointerStartY;
    this.draggableItem.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    this.updateIdleItemsStateAndPosition();
  }

  pointerUpHandler(e) {
    if (!this.draggableItem) return;
    this.draggableItem.removeEventListener('pointermove', this.pointerMoveHandler.bind(this));
    this.draggableItem.removeEventListener('pointerup', this.pointerUpHandler.bind(this));
    this.draggableItem.removeEventListener('pointercancel', this.pointerUpHandler.bind(this));
    this.draggableItem.releasePointerCapture(e.pointerId);
    this.applyNewItemsOrder();
    persistSavedOrder();
    this.cleanup();
  }

  initDraggableItem() {
    if (!this.draggableItem) return;
    this.draggableItem.classList.remove('is-idle');
    this.draggableItem.classList.add('is-draggable');
  }

  initItemsState() {
    this.getIdleItems().forEach((item, index) => {
      if (this.getAllItems().indexOf(this.draggableItem) > index) {
        item.dataset.isAbove = 'true';
      }
    });
  }

  updateIdleItemsStateAndPosition() {
    if (!this.draggableItem) return;
    const draggableRect = this.draggableItem.getBoundingClientRect();
    const draggableCenterY = draggableRect.top + draggableRect.height / 2;
    this.getIdleItems().forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const itemCenterY = itemRect.top + itemRect.height / 2;
      if (this.isItemAbove(item)) {
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
    this.getIdleItems().forEach((item) => {
      if (this.isItemToggled(item)) {
        const direction = this.isItemAbove(item) ? 1 : -1;
        item.style.transform = `translateY(${direction * (draggableRect.height + ITEMS_GAP)}px)`;
      } else {
        item.style.transform = '';
      }
    });
  }

  getAllItems() {
    if (!this.listContainer) return [];
    this.items = Array.from(this.listContainer.querySelectorAll('.js-item'));
    return this.items;
  }

  getIdleItems() {
    return this.getAllItems().filter((item) => item.classList.contains('is-idle'));
  }

  isItemAbove(item) {
    return item.hasAttribute('data-is-above');
  }

  isItemToggled(item) {
    return item.hasAttribute('data-is-toggled');
  }

  applyNewItemsOrder() {
    const reorderedItems = [];
    this.getAllItems().forEach((item, index) => {
      if (item === this.draggableItem) return;
      if (!this.isItemToggled(item)) {
        reorderedItems[index] = item;
      } else {
        const newIndex = this.isItemAbove(item) ? index + 1 : index - 1;
        reorderedItems[newIndex] = item;
      }
    });
    for (let index = 0; index < this.getAllItems().length; index++) {
      if (typeof reorderedItems[index] === 'undefined') {
        reorderedItems[index] = this.draggableItem;
      }
    }
    reorderedItems.forEach((item) => {
      this.listContainer.appendChild(item);
    });
  }

  unsetDraggableItem() {
    if (!this.draggableItem) return;
    this.draggableItem.style.transform = '';
    this.draggableItem.classList.remove('is-draggable');
    this.draggableItem.classList.add('is-idle');
    this.draggableItem = null;
  }

  unsetItemState() {
    this.getIdleItems().forEach((item) => {
      delete item.dataset.isAbove;
      delete item.dataset.isToggled;
      item.style.transform = '';
    });
  }

  disablePageScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';
  }

  enablePageScroll() {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.style.userSelect = '';
  }

  cleanup() {
    this.items = [];
    this.unsetDraggableItem();
    this.unsetItemState();
    this.enablePageScroll();
  }

  addListItemEvents(li, { onDragStart, onClick, buttonSelector, onButtonClick }) {
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
}

const dragAndDropManager = new DragAndDropManager();
const statusBar = new StatusBar();
const workspaceList = new WorkspaceList(getDomElement, dragAndDropManager, statusBar);
const themeManager = new ThemeManager();
const contextMenu = new ContextMenu();