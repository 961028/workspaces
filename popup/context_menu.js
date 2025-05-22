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
 * Displays the context menu at the mouse event position, ensuring it stays within bounds.
 * @param {MouseEvent} e - The right-click event.
 * @param {number} workspaceId - The workspace ID for the menu.
 */
function showContextMenu(e, workspaceId) {
  if (!contextMenuEl) {
    console.error("Context menu not initialized.");
    return;
  }

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

  // Apply the calculated position and make the menu visible
  contextMenuEl.style.left = `${left}px`;
  contextMenuEl.style.top = `${top}px`;
  contextMenuEl.style.visibility = "visible";
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
