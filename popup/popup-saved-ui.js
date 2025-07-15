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
    list.innerHTML = "You have no saved windows, try saving one!";
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
  li.innerHTML = `
    <img src="default-favicon.png" alt="?" class="favicon">
    <span class="label">${workspace.title || "(No Title)"}</span>
    <button class="edit-btn" data-wsid="${workspace.id}">Edit</button>
  `;

  // Use shared helper for favicon
  if (window.popupUiHelpers && window.popupUiHelpers.setFavicon) {
    window.popupUiHelpers.setFavicon(li, workspace.windowId, workspace.favicon || "default-favicon.png");
  }

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
