/**
 * Displays a status message to the user and automatically clears it.
 * @param {string} message - The message text.
 * @param {boolean} isError - Whether the message indicates an error.
 */
function showStatus(message, isError) {
  const statusEl = getDomElement("status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = isError ? "error" : "success";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, STATUS_DISPLAY_TIME);
}
