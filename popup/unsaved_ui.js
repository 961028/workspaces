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
  }).catch(() => { });

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
