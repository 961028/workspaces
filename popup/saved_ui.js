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

  // --- Improved pointer/click/drag/context menu logic ---
  let pointerDragging = false;
  let pointerStartX = 0, pointerStartY = 0;
  const DRAG_THRESHOLD = 5;

  // Helper: is context menu open for this workspace?
  function isContextMenuOpenForThis() {
    return (
      contextMenuEl &&
      contextMenuEl.style.display === "block" &&
      contextMenuOpenForWorkspaceId == workspace.id
    );
  }

  // Helper: is context menu open for another workspace?
  function isContextMenuOpenForOther() {
    return (
      contextMenuEl &&
      contextMenuEl.style.display === "block" &&
      contextMenuOpenForWorkspaceId != workspace.id
    );
  }

  li.addEventListener("pointerdown", (e) => {
    // Ignore if pointerdown is on the edit button, context menu, or initiated with the right mouse button
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu") || e.button === 2) return;
    pointerDragging = false;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
  });

  li.addEventListener("pointermove", (e) => {
    // Ignore if pointermove is on the edit button, context menu, or initiated with the right mouse button
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu") || e.button === 2) return;
    const dx = Math.abs(e.clientX - pointerStartX);
    const dy = Math.abs(e.clientY - pointerStartY);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      pointerDragging = true;
    }
  });

  li.addEventListener("pointerup", (e) => {
    // Ignore if pointerup is on the edit button or context menu
    if (e.target.closest(".edit-btn") || e.target.closest("#context-menu")) return;

    // If context menu is open for another workspace, close it and do nothing else
    if (isContextMenuOpenForOther()) {
      hideContextMenu();
      pointerDragging = false;
      return;
    }

    // If context menu is open for this workspace, close it and do nothing else
    if (isContextMenuOpenForThis()) {
      hideContextMenu();
      pointerDragging = false;
      return;
    }

    // If not dragging, open workspace
    if (!pointerDragging) {
      sendMessage({ action: "openWorkspace", workspaceId: parseInt(workspace.id, 10) });
    }
    pointerDragging = false;
  });

  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    // If context menu is already open for this workspace, close it
    if (isContextMenuOpenForThis()) {
      hideContextMenu();
      return;
    }
    // If context menu is open for another workspace, close it and open for this
    if (isContextMenuOpenForOther()) {
      hideContextMenu();
    }
    showContextMenu(e, workspace.id);
  });

  const editBtn = li.querySelector(".edit-btn");
  if (editBtn) {
    // Left click on edit button: open context menu for this workspace
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      // If context menu is already open for this workspace, close it
      if (isContextMenuOpenForThis()) {
        hideContextMenu();
        return;
      }
      // If context menu is open for another workspace, close it first
      if (isContextMenuOpenForOther()) {
        hideContextMenu();
      }
      const rect = editBtn.getBoundingClientRect();
      showContextMenu(
        { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {} },
        parseInt(workspace.id, 10)
      );
    });

    // Right click on edit button: open context menu for this workspace
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

    // Prevent drag on edit button from triggering drag logic
    editBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    editBtn.addEventListener("pointermove", (e) => {
      e.stopPropagation();
    });
    editBtn.addEventListener("pointerup", (e) => {
      e.stopPropagation();
    });
  }

  return li;
}
