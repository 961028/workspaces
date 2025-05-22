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
