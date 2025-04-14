/* ===== CONSTANTS & GLOBALS ===== */
const DEBOUNCE_DELAY = 800; // Debounce delay in milliseconds.
let pendingUpdates = new Set();
let updateTimer = null;
let windowLastActive = {};


/* ===== STORAGE HELPERS ===== */
/**
 * Retrieves workspaces and the next available ID from storage.
 * @returns {Promise<{workspaces: Object, nextId: number}>} Workspace data.
 */
async function getWorkspaces() {
  try {
    const data = await browser.storage.local.get(["workspaces", "nextId"]);
    return {
      workspaces: data.workspaces || {},
      nextId: data.nextId || 1,
    };
  } catch (error) {
    console.error("Error fetching workspaces from storage:", error);
    return { workspaces: {}, nextId: 1 };
  }
}

/**
 * Saves workspaces and nextId to storage.
 * @param {Object} workspaces - Workspaces object.
 * @param {number} nextId - Next available ID.
 */
async function setWorkspaces(workspaces, nextId) {
  try {
    await browser.storage.local.set({ workspaces, nextId });
  } catch (error) {
    console.error("Error saving workspaces to storage:", error);
  }
}


/* ===== URL HELPER ===== */
/**
 * Sanitizes URLs to allow only http, https, or about:blank protocols.
 * @param {Array<string>} urls - List of URL strings.
 * @returns {Array<string>} Sanitized URLs.
 */
function sanitizeUrls(urls) {
  return urls.map((url) => {
    if (url.startsWith("http://") || url.startsWith("https://") || url === "about:blank") {
      return url;
    }
    console.warn("Blocked URL, replaced with about:blank:", url);
    return "about:blank";
  });
}


/* ===== DEBOUNCING LOGIC ===== */
/**
 * Schedules a workspace update for a specific window using debouncing.
 * Uses early return for invalid window IDs.
 * @param {number} windowId - The ID of the window that requires an update.
 */
function scheduleWorkspaceUpdate(windowId) {
  // Early return for invalid windowId.
  if (typeof windowId !== "number" || windowId < 0) return;
  
  pendingUpdates.add(windowId);

  // Clear any existing timer to avoid multiple scheduled updates.
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  
  updateTimer = setTimeout(processPendingUpdates, DEBOUNCE_DELAY);
}

/**
 * Processes all pending workspace updates in a single batch.
 * Retrieves workspace data, updates each pending window, and persists changes.
 */
async function processPendingUpdates() {
  const { workspaces, nextId } = await getWorkspaces();
  for (const winId of pendingUpdates) {
    try {
      const tabs = await browser.tabs.query({ windowId: winId });
      updateWorkspaceForWindow(workspaces, winId, tabs);
      console.info("Updated workspace for window", winId);
    } catch (error) {
      console.error("Error updating workspace for window", winId, error);
    }
  }
  await setWorkspaces(workspaces, nextId);
  pendingUpdates.clear();
  updateTimer = null;
}

/**
 * Updates the workspace data for a given window with current tab information.
 * Maps tab URLs and updates the workspace title based on the active tab if no custom title is set.
 * @param {Object} workspaces - An object of workspaces keyed by workspace ID.
 * @param {number} winId - The ID of the window to update.
 * @param {Array<Object>} tabs - Array of tab objects.
 */
function updateWorkspaceForWindow(workspaces, winId, tabs) {
  if (!tabs.length) return; // Early exit for empty tab arrays.
  
  // Select the active tab; if none, use the last tab.
  const activeTab = tabs.find((tab) => tab.active) || tabs[tabs.length - 1];
  
  Object.keys(workspaces).forEach((wsId) => {
    if (workspaces[wsId].windowId === winId) {
      workspaces[wsId].tabs = tabs.map((tab) => tab.url);
      // Update title only if no custom title is set.
      if (workspaces[wsId].customTitle === undefined) {
        workspaces[wsId].title = activeTab ? activeTab.title : "";
      }
    }
  });
}


/* ===== MESSAGE HANDLERS ===== */
/**
 * Retrieves the current state, including saved and unsaved windows.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleGetState(sendResponse) {
  try {
    const { workspaces } = await getWorkspaces();
    const openWindows = await browser.windows.getAll({ populate: true });
    const savedWorkspaces = Object.values(workspaces);
    const savedWindowIds = savedWorkspaces.map((ws) => ws.windowId).filter((id) => id !== null);
    
    const unsavedWindows = openWindows
      .filter((win) => !savedWindowIds.includes(win.id))
      .map((win) => {
        const activeTab = win.tabs.find((tab) => tab.active) || win.tabs[0];
        return {
          windowId: win.id,
          title: activeTab && activeTab.title ? activeTab.title : "(No Tabs)",
          lastActive: windowLastActive[win.id] || 0,
        };
      });
    
    // Sort unsaved windows by most recent activity.
    unsavedWindows.sort((a, b) => b.lastActive - a.lastActive);
    sendResponse({ success: true, saved: savedWorkspaces, unsaved: unsavedWindows });
  } catch (error) {
    console.error("Error retrieving state:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Saves a window as a new workspace.
 * @param {number} windowId - The window's ID to save.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleSaveWindow(windowId, sendResponse) {
  try {
    const tabs = await browser.tabs.query({ windowId });
    if (!tabs || tabs.length === 0) {
      return sendResponse({ success: false, error: "Window has no tabs." });
    }
    const { workspaces, nextId } = await getWorkspaces();
    const activeTab = tabs.find((tab) => tab.active) || tabs[0];
    const newWorkspace = {
      id: nextId,
      windowId,
      tabs: tabs.map((tab) => tab.url),
      title: activeTab && activeTab.title ? activeTab.title : "",
    };
    workspaces[nextId] = newWorkspace;
    await setWorkspaces(workspaces, nextId + 1);
    console.info(`Saved window ${windowId} as workspace ${newWorkspace.id}`);
    sendResponse({ success: true, workspace: newWorkspace });
  } catch (error) {
    console.error("Error saving window", windowId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Opens a saved workspace by focusing its associated window or creating a new one.
 * @param {number} workspaceId - The workspace's unique identifier.
 * @param {Function} sendResponse - Callback function to send the response.
 */
async function handleOpenWorkspace(workspaceId, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    const workspace = workspaces[workspaceId];
    
    if (!workspace) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }
    
    if (workspace.windowId) {
      try {
        await browser.windows.update(workspace.windowId, { focused: true });
        console.info("Focused existing window", workspace.windowId);
        return sendResponse({ success: true, message: "Window focused." });
      } catch (focusError) {
        console.warn("Could not focus window, proceeding to open a new window:", focusError);
      }
    }
    
    const sanitizedUrls = sanitizeUrls(workspace.tabs);
    const newWindow = await browser.windows.create({ url: sanitizedUrls });
    
    workspace.windowId = newWindow.id;
    workspaces[workspaceId] = workspace;
    await setWorkspaces(workspaces, nextId);
    
    console.info(`Opened workspace ${workspaceId} in new window ${newWindow.id}`);
    sendResponse({ success: true, message: "New window opened.", windowId: newWindow.id });
  } catch (error) {
    console.error("Error opening workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Removes a workspace without closing its associated window.
 * @param {number} workspaceId - The workspace's ID to remove.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleUnsaveWorkspace(workspaceId, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }
    delete workspaces[workspaceId];
    await setWorkspaces(workspaces, nextId);
    console.info("Removed workspace", workspaceId);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error removing workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Renames a workspace with a custom title.
 * @param {number} workspaceId - The workspace's ID.
 * @param {string} newTitle - The new workspace title.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleRenameWorkspace(workspaceId, newTitle, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }
    workspaces[workspaceId].customTitle = newTitle;
    workspaces[workspaceId].title = newTitle;
    await setWorkspaces(workspaces, nextId);
    console.info(`Renamed workspace ${workspaceId} to ${newTitle}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error renaming workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Updates the order of workspaces based on a new ordering array.
 * @param {Array<number>} newOrder - Array representing the desired order of workspace IDs.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleUpdateOrder(newOrder, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    
    // Set order for workspaces in newOrder.
    newOrder.forEach((wsId, index) => {
      if (workspaces[wsId]) {
        workspaces[wsId].order = index;
      }
    });
    
    // Assign sequential orders for workspaces not in newOrder.
    let order = newOrder.length;
    Object.keys(workspaces).forEach((wsId) => {
      if (!newOrder.includes(Number(wsId))) {
        workspaces[wsId].order = order++;
      }
    });
    
    await setWorkspaces(workspaces, nextId);
    console.info("Updated workspace order:", newOrder);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error updating workspace order:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Focuses a specified window.
 * @param {number} windowId - The window's ID to focus.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function focusWindow(windowId, sendResponse) {
  try {
    await browser.windows.update(windowId, { focused: true });
    console.info("Focused window", windowId);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error focusing window", windowId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Exports the current workspaces from storage.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleExportWorkspaces(sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    sendResponse({ success: true, data: { workspaces, nextId } });
  } catch (error) {
    console.error("Error exporting workspaces:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Imports workspace data into storage.
 * @param {Object} msg - Message containing the imported data.
 * @param {Object} msg.data - The imported workspaces and nextId.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleImportWorkspace(msg, sendResponse) {
  try {
    const importedData = msg.data;
    // Validate structure of import data.
    if (
      !importedData ||
      typeof importedData !== "object" ||
      !importedData.workspaces ||
      importedData.nextId === undefined
    ) {
      return sendResponse({ success: false, error: "Invalid import data." });
    }
    await setWorkspaces(importedData.workspaces, importedData.nextId);
    console.info("Imported workspaces successfully.");
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error importing workspaces:", error);
    sendResponse({ success: false, error: error.message });
  }
}


/* ===== MESSAGE ROUTER ===== */
/**
 * Routes incoming messages to the appropriate handler.
 */
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case "getState":
      handleGetState(sendResponse);
      break;
    case "saveWindow":
      handleSaveWindow(msg.windowId, sendResponse);
      break;
    case "openWorkspace":
      handleOpenWorkspace(msg.workspaceId, sendResponse);
      break;
    case "focusWindow":
      focusWindow(msg.windowId, sendResponse);
      break;
    case "unsaveWorkspace":
      handleUnsaveWorkspace(msg.workspaceId, sendResponse);
      break;
    case "renameWorkspace":
      handleRenameWorkspace(msg.workspaceId, msg.newTitle, sendResponse);
      break;
    case "updateOrder":
      handleUpdateOrder(msg.newOrder, sendResponse);
      break;
    case "exportWorkspaces":
      handleExportWorkspaces(sendResponse);
      break;
    case "importWorkspaces":
      handleImportWorkspace(msg, sendResponse);
      break;
    default:
      console.warn("Unknown action:", msg.action);
      sendResponse({ success: false, error: "Unknown action" });
  }
  // Return true to indicate asynchronous response handling.
  return true;
});


/* ===== EVENT LISTENERS ===== */
/**
 * Registers tab-related event listeners to schedule workspace updates.
 */
function registerTabListeners() {
  browser.tabs.onCreated.addListener((tab) => scheduleWorkspaceUpdate(tab.windowId));
  browser.tabs.onRemoved.addListener((tabId, info) => scheduleWorkspaceUpdate(info.windowId));
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title) scheduleWorkspaceUpdate(tab.windowId);
  });
  browser.tabs.onMoved.addListener((tabId, info) => scheduleWorkspaceUpdate(info.windowId));
  browser.tabs.onAttached.addListener((tabId, info) => scheduleWorkspaceUpdate(info.newWindowId));
  browser.tabs.onDetached.addListener((tabId, info) => scheduleWorkspaceUpdate(info.oldWindowId));
  browser.tabs.onActivated.addListener((info) => scheduleWorkspaceUpdate(info.windowId));
}

/**
 * Registers window-related event listeners for creation, removal, and focus changes.
 */
function registerWindowListeners() {
  browser.windows.onCreated.addListener((win) => {
    console.info("Window created:", win.id);
  });
  
  browser.windows.onRemoved.addListener((windowId) => {
    markWorkspaceClosed(windowId);
  });
  
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId > 0) {
      windowLastActive[windowId] = Date.now();
      console.info("Updated last active time for window", windowId);
    }
  });
}

/**
 * Marks workspaces as closed when their window is removed.
 * Now implemented as an async function for consistency.
 * @param {number} windowId - The ID of the closed window.
 */
async function markWorkspaceClosed(windowId) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    let updated = false;
    Object.keys(workspaces).forEach((wsId) => {
      if (workspaces[wsId].windowId === windowId) {
        workspaces[wsId].windowId = null;
        updated = true;
      }
    });
    if (updated) {
      await setWorkspaces(workspaces, nextId);
      console.info("Marked workspace(s) as closed for window", windowId);
    }
  } catch (error) {
    console.error("Error marking workspaces as closed for window", windowId, error);
  }
}

// Register all event listeners.
registerTabListeners();
registerWindowListeners();