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
