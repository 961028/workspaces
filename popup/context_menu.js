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
 * Uses modular item creation for single responsibility and easier reuse.
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
