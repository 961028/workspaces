// background.js
// Workspace Manager Background Script
// This script manages workspace data storage, listens to tab/window events,
// processes messages from the popup, and implements debouncing to batch updates.


/* ===== CONSTANTS & GLOBALS ===== */
const DEBOUNCE_DELAY = 800;
let pendingUpdates = new Set();
let updateTimer = null;
let windowLastActive = {};


/* ===== STORAGE HELPERS ===== */

/**
 * Retrieves workspaces and the next available ID from storage.
 * @returns {Promise<{workspaces: Object, nextId: number}>}
 */
async function getWorkspaces() {
  try {
    const data = await browser.storage.local.get(["workspaces", "nextId"]);
    return {
      workspaces: data.workspaces || {},
      nextId: data.nextId || 1
    };
  } catch (error) {
    console.error("Error fetching workspaces:", error);
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
    console.error("Error setting workspaces:", error);
  }
}

/* ===== URL HELPER ===== */

/**
 * Sanitizes URLs to allow only http, https, or about:blank.
 * @param {Array<string>} urls - List of URL strings.
 * @returns {Array<string>} Sanitized URLs.
 */
function sanitizeUrls(urls) {
  return urls.map(url => {
    if (url.startsWith("http://") || url.startsWith("https://") || url === "about:blank") {
      return url;
    }
    console.warn("Blocked URL, replaced with about:blank:", url);
    return "about:blank";
  });
}

/* ===== DEBOUNCING LOGIC ===== */

/**
 * Schedules an update for a window with debouncing.
 * @param {number} windowId - Window ID to update.
 */
function scheduleWorkspaceUpdate(windowId) {
  if (!windowId) return;
  pendingUpdates.add(windowId);
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(processPendingUpdates, DEBOUNCE_DELAY);
}

/**
 * Processes all pending workspace updates in a single batch.
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
 * Updates a workspace with the latest tab data for the specified window.
 * @param {Object} workspaces - Workspaces data.
 * @param {number} winId - Window ID.
 * @param {Array<Object>} tabs - List of tabs for the window.
 */
function updateWorkspaceForWindow(workspaces, winId, tabs) {
  const activeTab = tabs.find(tab => tab.active) || tabs[tabs.length - 1];
  Object.keys(workspaces).forEach(wsId => {
    if (workspaces[wsId].windowId === winId) {
      workspaces[wsId].tabs = tabs.map(tab => tab.url);
      if (!workspaces[wsId].customTitle) {
        workspaces[wsId].title = activeTab ? activeTab.title : "";
      }
    }
  });
}

/* ===== MESSAGE HANDLERS ===== */

/**
 * Handles retrieval of the current state, including saved and unsaved windows.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleGetState(sendResponse) {
  try {
    const { workspaces } = await getWorkspaces();
    const openWindows = await browser.windows.getAll({ populate: true });
    const savedWorkspaces = Object.values(workspaces);
    const savedWindowIds = savedWorkspaces.map(ws => ws.windowId).filter(id => id !== null);
    
    const unsavedWindows = openWindows
      .filter(win => !savedWindowIds.includes(win.id))
      .map(win => {
        const activeTab = win.tabs.find(tab => tab.active) || win.tabs[0];
        return {
          windowId: win.id,
          title: activeTab && activeTab.title ? activeTab.title : "(No Tabs)",
          lastActive: windowLastActive[win.id] || 0
        };
      });
    
    // Sort unsaved windows by most recent activity.
    unsavedWindows.sort((a, b) => b.lastActive - a.lastActive);
    sendResponse({ success: true, saved: savedWorkspaces, unsaved: unsavedWindows });
  } catch (error) {
    console.error("Error in getState:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Saves a window as a new workspace.
 * @param {number} windowId - ID of the window to save.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleSaveWindow(windowId, sendResponse) {
  try {
    const tabs = await browser.tabs.query({ windowId });
    if (!tabs || tabs.length === 0) {
      return sendResponse({ success: false, error: "Window has no tabs." });
    }
    const { workspaces, nextId } = await getWorkspaces();
    const activeTab = tabs.find(tab => tab.active) || tabs[0];
    const newWorkspace = {
      id: nextId,
      windowId,
      tabs: tabs.map(tab => tab.url),
      title: activeTab && activeTab.title ? activeTab.title : ""
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
 * Opens a saved workspace by focusing its window or creating a new one.
 * @param {number} workspaceId - ID of the workspace.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleOpenWorkspace(workspaceId, sendResponse) {
  try {
    const { workspaces } = await getWorkspaces();
    const workspace = workspaces[workspaceId];
    if (!workspace) return sendResponse({ success: false, error: "Workspace not found." });
    
    // Try to focus the existing window.
    if (workspace.windowId) {
      try {
        await browser.windows.update(workspace.windowId, { focused: true });
        console.info("Focused existing window", workspace.windowId);
        return sendResponse({ success: true, message: "Window focused." });
      } catch (focusError) {
        console.warn("Could not focus window, reopening workspace.", focusError);
      }
    }
    // Open a new window if the old one is gone.
    const sanitizedUrls = sanitizeUrls(workspace.tabs);
    const newWindow = await browser.windows.create({ url: sanitizedUrls });
    workspace.windowId = newWindow.id;
    workspaces[workspaceId] = workspace;
    await setWorkspaces(workspaces, (await getWorkspaces()).nextId);
    console.info(`Opened workspace ${workspaceId} in new window ${newWindow.id}`);
    sendResponse({ success: true, message: "New window opened.", windowId: newWindow.id });
  } catch (error) {
    console.error("Error opening workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Removes a workspace without closing the associated window.
 * @param {number} workspaceId - ID of the workspace to remove.
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
    console.info("Un-saved workspace", workspaceId);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error unsaving workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Renames a workspace and saves a custom title.
 * @param {number} workspaceId - ID of the workspace.
 * @param {string} newTitle - New title for the workspace.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleRenameWorkspace(workspaceId, newTitle, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }
    workspaces[workspaceId].customTitle = newTitle; // Prevent auto-update.
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
 * Updates the order of saved workspaces.
 * @param {Array<number>} newOrder - Array of workspace IDs in the desired order.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleUpdateOrder(newOrder, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    newOrder.forEach((wsId, index) => {
      if (workspaces[wsId]) {
        workspaces[wsId].order = index;
      }
    });
    // Assign remaining workspaces an order value.
    Object.keys(workspaces).forEach(wsId => {
      if (!newOrder.includes(Number(wsId))) {
        workspaces[wsId].order = newOrder.length;
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
 * @param {number} windowId - ID of the window to focus.
 * @param {Function} sendResponse - Callback to send the response.
 */
function focusWindow(windowId, sendResponse) {
  browser.windows.update(windowId, { focused: true })
    .then(() => {
      console.info("Focused window", windowId);
      sendResponse({ success: true });
    })
    .catch(error => {
      console.error("Error focusing window", windowId, error);
      sendResponse({ success: false, error: error.message });
    });
}

function handleExportWorkspaces(sendResponse) {
  (async () => {
    try {
      const { workspaces, nextId } = await getWorkspaces();
      sendResponse({ success: true, data: { workspaces, nextId } });
    } catch (error) {
      console.error("Error exporting workspaces:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();
}

function handleImportWorkspace(msg, sendResponse) {
  (async () => {
    try {
      const importedData = msg.data;
      // Validate the structure of the imported data.
      if (!importedData ||
        typeof importedData !== "object" ||
        !importedData.workspaces ||
        importedData.nextId === undefined) {
        return sendResponse({ success: false, error: "Invalid import data." });
      }
      await setWorkspaces(importedData.workspaces, importedData.nextId);
      console.info("Imported workspaces successfully.");
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error importing workspaces:", error);
      sendResponse({ success: false, error: error.message });
    }
  })();
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
 * Registers listeners for tab events to schedule workspace updates.
 */
function registerTabListeners() {
  browser.tabs.onCreated.addListener(tab => scheduleWorkspaceUpdate(tab.windowId));
  browser.tabs.onRemoved.addListener((tabId, info) => scheduleWorkspaceUpdate(info.windowId));
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title) scheduleWorkspaceUpdate(tab.windowId);
  });
  browser.tabs.onMoved.addListener((tabId, info) => scheduleWorkspaceUpdate(info.windowId));
  browser.tabs.onAttached.addListener((tabId, info) => scheduleWorkspaceUpdate(info.newWindowId));
  browser.tabs.onDetached.addListener((tabId, info) => scheduleWorkspaceUpdate(info.oldWindowId));
  browser.tabs.onActivated.addListener(info => scheduleWorkspaceUpdate(info.windowId));
}

/**
 * Registers listeners for window events.
 */
function registerWindowListeners() {
  browser.windows.onCreated.addListener(win => {
    console.info("Window created:", win.id);
  });
  
  browser.windows.onRemoved.addListener(windowId => {
    markWorkspaceClosed(windowId);
  });
  
  browser.windows.onFocusChanged.addListener(windowId => {
    if (windowId > 0) {
      windowLastActive[windowId] = Date.now();
      console.info("Updated last active time for window", windowId);
    }
  });
}

/**
 * Marks workspaces as closed when their window is removed.
 * @param {number} windowId - ID of the closed window.
 */
function markWorkspaceClosed(windowId) {
  getWorkspaces().then(({ workspaces, nextId }) => {
    let updated = false;
    Object.keys(workspaces).forEach(wsId => {
      if (workspaces[wsId].windowId === windowId) {
        workspaces[wsId].windowId = null;
        updated = true;
      }
    });
    if (updated) {
      setWorkspaces(workspaces, nextId);
      console.info("Marked workspace(s) as closed for window", windowId);
    }
  });
}

// Register event listeners.
registerTabListeners();
registerWindowListeners();