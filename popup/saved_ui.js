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
