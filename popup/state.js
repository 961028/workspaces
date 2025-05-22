// state.js
// ===== STATE LOADING =====
/**
 * Loads the state by retrieving the current window and fetching workspace data.
 * @returns {Promise<void>}
 */
async function loadState() {
  try {
    const currentWindow = await browser.windows.getLastFocused();
    if (!currentWindow || !currentWindow.id) {
      console.warn("Could not retrieve current window info.");
      showStatus("Failed to retrieve window information.", true);
      return;
    }
    const currentWindowId = currentWindow.id;
    const response = await browser.runtime.sendMessage({ action: "getState" });
    if (response && response.success) {
      updateSavedList(response.saved, currentWindowId);
      updateUnsavedList(response.unsaved, currentWindowId);
    } else {
      showStatus(response?.error || "Failed to retrieve state.", true);
    }
  } catch (err) {
    console.error("State load error:", err);
    showStatus(err.message || "Error retrieving state.", true);
  }
}

// ===== MESSAGE SENDER =====
/**
 * Sends a message to the background script and processes the response.
 * @param {Object} message - The message payload.
 * @returns {Promise<void>}
 */
async function sendMessage(message) {
  if (!message || typeof message !== "object") {
    console.error("Invalid message object:", message);
    showStatus("Invalid message data.", true);
    return;
  }
  try {
    const response = await browser.runtime.sendMessage(message);
    if (response && response.success) {
      showStatus(response.message || "Action completed.", false);
    } else {
      showStatus(response?.error || "Action failed.", true);
    }
    await loadState();
  } catch (error) {
    console.error("Error in sendMessage:", error);
    showStatus(error.message || "Communication error with background script.", true);
  }
}
