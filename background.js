/* ===== CONSTANTS & GLOBALS ===== */
/**
 * Debounce delay in milliseconds.
 * @constant {number}
 */
const DEBOUNCE_DELAY = 800;

/** @type {Set<number>} Set of window IDs pending an update */
let pendingUpdates = new Set();
/** @type {number|null} Timeout identifier for debounced updates */
let updateTimer = null;
/** @type {Object<number, number>} Mapping of window IDs to last active timestamp */
let windowLastActive = {};

/* ===== STORAGE HELPERS ===== */
/**
 * Retrieves workspaces and the next available ID from storage.
 * @returns {Promise<{workspaces: Object, nextId: number}>} The stored workspaces and next available ID.
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
 * @param {Object} workspaces - The workspaces object.
 * @param {number} nextId - The next available ID.
 * @returns {Promise<void>}
 */
async function setWorkspaces(workspaces, nextId) {
  try {
    await browser.storage.local.set({ workspaces, nextId });
  } catch (error) {
    console.error("Error saving workspaces to storage:", error);
  }
}

/**
 * Unsets the windowId for all workspaces associated with a closed window.
 * This marks those workspaces as not currently open in any window.
 * @param {number} closedWindowId - The ID of the window that was closed.
 * @returns {Promise<void>}
 */
async function unsetWindowIdForClosedWorkspaces(closedWindowId) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    let anyWorkspaceUpdated = false;
    Object.keys(workspaces).forEach((workspaceId) => {
      if (workspaces[workspaceId].windowId === closedWindowId) {
        workspaces[workspaceId].windowId = null;
        anyWorkspaceUpdated = true;
      }
    });
    if (anyWorkspaceUpdated) {
      await setWorkspaces(workspaces, nextId);
      console.info("Unset windowId for workspace(s) associated with closed window", closedWindowId);
    }
  } catch (error) {
    console.error("Error unsetting windowId for closed window", closedWindowId, error);
  }
}

/* ===== URL HELPER ===== */
/**
 * Sanitizes an array of URL strings.
 * Allows only 'http://', 'https://', or the exact value 'about:blank'.
 * @param {Array<string>} urls - The array of URL strings.
 * @returns {Array<string>} The sanitized URLs.
 */
function sanitizeUrls(urls) {
  return urls.map((url) => {
    // If the URL starts with an allowed scheme or is exactly 'about:blank', return it.
    if (url.startsWith("http://") || url.startsWith("https://") || url === "about:blank") {
      return url;
    }
    // Otherwise, warn and replace with "about:blank".
    console.warn("Blocked URL, replaced with about:blank:", url);
    return "about:blank";
  });
}

/* ===== DEBOUNCING LOGIC ===== */
/**
 * Schedules a workspace update for the specified window using debouncing.
 * Uses an early return if the windowId is invalid.
 * @param {number} windowId - The window ID that requires an update.
 */
function scheduleWorkspaceUpdate(windowId) {
  if (typeof windowId !== "number" || windowId < 0) return; // (Rule 2 & 7: Early return & validation)

  pendingUpdates.add(windowId);

  // Clear any existing timer to avoid scheduling duplicate updates.
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(processPendingUpdates, DEBOUNCE_DELAY);
}

/**
 * Processes all pending workspace updates in a single batch.
 * Retrieves the latest workspace data, updates each pending window with current tab info, and persists changes.
 * @returns {Promise<void>}
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
 * Updates the workspace data for a given window with the current tab information.
 * Only updates workspaces for the specified window.
 * @param {Object} workspaces - An object containing workspace entries.
 * @param {number} winId - The window ID to update.
 * @param {Array<Object>} tabs - The array of tab objects.
 */
async function updateWorkspaceForWindow(workspaces, winId, tabs) {
  if (!tabs.length) return; // (Rule 2: Use early return for empty arrays)

  // Determine the active tab (or fall back to the last tab if none is active)
  const activeTab = tabs.find((tab) => tab.active) || tabs[tabs.length - 1];
  let groupRanges = [];
  if (browser.tabGroups) {
    try {
      const groups = await browser.tabGroups.query({ windowId: winId });
      for (const group of groups) {
        // Find all tabs in this group
        const groupTabs = tabs.filter((tab) => tab.groupId === group.id);
        if (groupTabs.length > 0) {
          const indices = groupTabs.map((tab) => tab.index);
          groupRanges.push({
            start: Math.min(...indices),
            end: Math.max(...indices),
            title: group.title || '',
            color: group.color || '',
            collapsed: group.collapsed || false
          });
        }
      }
    } catch (e) {
      console.warn('Could not query tabGroups:', e);
    }
  }
  Object.keys(workspaces).forEach((wsId) => {
    if (workspaces[wsId].windowId === winId) {
      workspaces[wsId].tabs = tabs.map((tab) => tab.url);
      workspaces[wsId].groupRanges = groupRanges;
      // Only update title if no custom title has been set.
      if (workspaces[wsId].customTitle === undefined) {
        workspaces[wsId].title = activeTab ? activeTab.title : "";
      }
    }
  });
}

/* ===== MESSAGE HANDLERS ===== */
/**
 * Retrieves the current state—including saved and unsaved windows—and sends it in the response.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
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
 * Saves the specified window as a new workspace and sends the response.
 * @param {number} windowId - The ID of the window to save.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
 */
async function handleSaveWindow(windowId, sendResponse) {
  try {
    const tabs = await browser.tabs.query({ windowId });
    if (!tabs || tabs.length === 0) {
      return sendResponse({ success: false, error: "Window has no tabs." });
    }
    let groupRanges = [];
    if (browser.tabGroups) {
      try {
        const groups = await browser.tabGroups.query({ windowId });
        for (const group of groups) {
          const groupTabs = tabs.filter((tab) => tab.groupId === group.id);
          if (groupTabs.length > 0) {
            const indices = groupTabs.map((tab) => tab.index);
            groupRanges.push({
              start: Math.min(...indices),
              end: Math.max(...indices),
              title: group.title || '',
              color: group.color || '',
              collapsed: group.collapsed || false
            });
          }
        }
      } catch (e) {
        console.warn('Could not query tabGroups:', e);
      }
    }
    const { workspaces, nextId } = await getWorkspaces();
    const activeTab = tabs.find((tab) => tab.active) || tabs[0];
    const newWorkspace = {
      id: nextId,
      windowId,
      tabs: tabs.map((tab) => tab.url),
      title: activeTab && activeTab.title ? activeTab.title : "",
      groupRanges
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
 * Opens a saved workspace by attempting to focus its existing window or creating a new one.
 * @param {number} workspaceId - The workspace's unique identifier.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
 */
async function handleOpenWorkspace(workspaceId, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    const workspace = workspaces[workspaceId];

    if (!workspace) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }

    // Attempt to focus the window if it already exists.
    if (workspace.windowId) {
      try {
        await browser.windows.update(workspace.windowId, { focused: true });
        console.info("Focused existing window", workspace.windowId);
        return sendResponse({ success: true, message: "Window focused." });
      } catch (focusError) {
        console.warn("Could not focus window, opening a new one instead:", focusError);
      }
    }

    // Sanitize URLs and open a new window.
    const sanitizedUrls = sanitizeUrls(workspace.tabs);
    const newWindow = await browser.windows.create({ url: sanitizedUrls });
    workspace.windowId = newWindow.id;
    workspaces[workspaceId] = workspace;
    // Wait for all tabs to be ready
    let tabs;
    for (let i = 0; i < 10; ++i) {
      tabs = await browser.tabs.query({ windowId: newWindow.id });
      if (tabs.length === sanitizedUrls.length) break;
      await new Promise((res) => setTimeout(res, 200));
    }
    // Reapply tab groups
    if (browser.tabGroups && Array.isArray(workspace.groupRanges)) {
      for (const group of workspace.groupRanges) {
        const groupTabs = tabs.filter(
          (tab) => tab.index >= group.start && tab.index <= group.end
        );
        if (groupTabs.length > 1) {
          const tabIds = groupTabs.map((tab) => tab.id);
          const groupId = await browser.tabs.group({ tabIds });
          await browser.tabGroups.update(groupId, {
            title: group.title,
            color: group.color,
            collapsed: group.collapsed
          });
        }
      }
    }
    await setWorkspaces(workspaces, nextId);
    console.info(`Opened workspace ${workspaceId} in new window ${newWindow.id}`);
    sendResponse({ success: true, message: "New window opened.", windowId: newWindow.id });
  } catch (error) {
    console.error("Error opening workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Removes the specified workspace from storage.
 * @param {number} workspaceId - The workspace's ID to remove.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
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
 * Renames a workspace by setting a custom title and updates the window's title.
 * @param {number} workspaceId - The workspace's ID.
 * @param {string} newTitle - The new title for the workspace.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
 */
async function handleRenameWorkspace(workspaceId, newTitle, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      return sendResponse({ success: false, error: "Workspace not found." });
    }

    // Update the workspace title
    workspaces[workspaceId].customTitle = newTitle;
    workspaces[workspaceId].title = newTitle;

    // If the workspace has an associated window, update the window's title
    if (workspaces[workspaceId].windowId) {
      try {
        const tabs = await browser.tabs.query({ windowId: workspaces[workspaceId].windowId });
        const activeTab = tabs.find((tab) => tab.active) || tabs[0];
        const tabTitle = activeTab?.title || "Untitled Tab";
        const fullTitle = `${newTitle} - `;

        await browser.windows.update(workspaces[workspaceId].windowId, { titlePreface: fullTitle });
        console.info(`Updated window title for workspace ${workspaceId}    to "${fullTitle}"`);
      } catch (error) {
        console.warn(`Failed to update window title for workspace ${workspaceId}:`, error);
      }
    }

    await setWorkspaces(workspaces, nextId);
    console.info(`Renamed workspace ${workspaceId} to ${newTitle}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error renaming workspace", workspaceId, error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Updates the order of workspaces based on the supplied new order.
 * @param {Array<number>} newOrder - An array of workspace IDs representing the desired order.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
 */
async function handleUpdateOrder(newOrder, sendResponse) {
  try {
    const { workspaces, nextId } = await getWorkspaces();
    // Update workspaces included in the new order.
    newOrder.forEach((wsId, index) => {
      if (workspaces[wsId]) {
        workspaces[wsId].order = index;
      }
    });
    // For any workspace not in newOrder, assign a sequential order.
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
 * Focuses the window with the specified ID.
 * @param {number} windowId - The ID of the window to focus.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
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
 * Exports the current workspaces and nextId.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
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
 * Validates the data structure before saving.
 * @param {Object} msg - The message containing the import data.
 * @param {Object} msg.data - The imported workspaces and nextId.
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {Promise<void>}
 */
async function handleImportWorkspace(msg, sendResponse) {
  try {
    const importedData = msg.data;
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
 * Routes incoming messages to the corresponding handler.
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
 
  browser.windows.onRemoved.addListener((windowId) => {
    unsetWindowIdForClosedWorkspaces(windowId);
  });
  
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId > 0) {
      windowLastActive[windowId] = Date.now();
      //console.info("Updated last active time for window", windowId);
    }
  });
}

/**
 * Registers tabGroups event listeners to schedule workspace updates for all relevant tab group changes.
 */
function registerTabGroupListeners() {
  if (!browser.tabGroups) return; // Defensive: not all browsers support tabGroups
  browser.tabGroups.onCreated.addListener((group) => {
    if (group.windowId != null) scheduleWorkspaceUpdate(group.windowId);
  });
  browser.tabGroups.onUpdated.addListener((group) => {
    if (group.windowId != null) scheduleWorkspaceUpdate(group.windowId);
  });
  browser.tabGroups.onMoved.addListener((group) => {
    if (group.windowId != null) scheduleWorkspaceUpdate(group.windowId);
  });
  browser.tabGroups.onRemoved.addListener((group) => {
    if (group.windowId != null) scheduleWorkspaceUpdate(group.windowId);
  });
}

// Register all event listeners.
registerTabListeners();
registerWindowListeners();
registerTabGroupListeners();