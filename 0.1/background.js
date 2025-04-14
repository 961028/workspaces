// background.js

// Listen for runtime messages and route to the appropriate handler
browser.runtime.onMessage.addListener((request, sender) => {
    console.log("Received message:", request, "from sender:", sender);
    switch (request.command) {
        case "save":
            console.log("Handling 'save' command for workspace:", request.name);
            return saveWorkspace(request.name);
        case "open":
            console.log("Handling 'open' command for workspace:", request.name);
            return openWorkspace(request.name);
        case "delete":
            console.log("Handling 'delete' command for workspace:", request.name);
            return deleteWorkspace(request.name);
        default:
            console.log("Unknown command received:", request.command);
            return;
    }
});

// Save the current window's tabs as a workspace, including the window ID.
async function saveWorkspace(name) {
    try {
        console.log(`Starting saveWorkspace for workspace: "${name}"`);
        // Get current window details
        const currentWindow = await browser.windows.getCurrent();
        console.log("Current window retrieved:", currentWindow);
        // Query all tabs in the current window
        const tabs = await browser.tabs.query({ currentWindow: true });
        console.log("Tabs retrieved in current window:", tabs);
        const urls = tabs.map(tab => tab.url);
        // Save an object that links the workspace to its window and tabs.
        const workspaceData = {
            windowId: currentWindow.id,
            tabs: urls
        };
        console.log("Saving workspace data:", workspaceData);
        await browser.storage.local.set({ [name]: workspaceData });
        console.log(`Workspace "${name}" saved successfully.`);
        return { status: "ok" };
    } catch (error) {
        console.error("Error saving workspace:", error);
        return { error: error.message };
    }
}

// Open a workspace by name, checking if it's already open.
async function openWorkspace(name) {
    try {
        console.log(`Attempting to open workspace: "${name}"`);
        // Retrieve the workspace data from storage.
        const data = await browser.storage.local.get(name);
        console.log("Retrieved workspace data:", data);
        const workspace = data[name];
        if (!workspace) {
            console.log(`Workspace "${name}" not found.`);
            return { error: `Workspace "${name}" not found` };
        }

        // If the workspace has an associated window ID, check if that window exists.
        if (workspace.windowId) {
            console.log(`Workspace "${name}" has associated windowId: ${workspace.windowId}`);
            try {
                // Try to get the window with the stored window ID.
                const win = await browser.windows.get(workspace.windowId);
                console.log(`Found window with ID ${workspace.windowId}:`, win);
                // If found, bring that window to the foreground.
                await browser.windows.update(workspace.windowId, { focused: true });
                console.log(`Window ${workspace.windowId} focused.`);
                return { status: `Workspace "${name}" is already open and has been focused.` };
            } catch (err) {
                // If the window doesn't exist, proceed to create a new one.
                console.log(`Window ID ${workspace.windowId} not found. Creating a new window for workspace "${name}".`);
            }
        }

        // If no valid window ID exists, create a new window.
        console.log(`Creating a new window for workspace "${name}" with saved tabs:`, workspace.tabs);
        const newWindow = await browser.windows.create({ focused: true });
        // Retrieve the new window with its tabs populated.
        const newWindowPopulated = await browser.windows.get(newWindow.id, { populate: true });
        console.log("New window created:", newWindowPopulated);

        // Process each saved URL from the workspace.
        let firstTabUpdated = false;
        for (const url of workspace.tabs) {
            let finalUrl = url;
            // Check for the illegal URL and replace it.
            if (url === "about:debugging#/runtime/this-firefox") {
                console.log(`Illegal URL encountered: "${url}". Replacing with "about:blank".`);
                finalUrl = "about:blank";
            }
            try {
                if (!firstTabUpdated) {
                    // Update the default tab in the new window.
                    const firstTabId = newWindowPopulated.tabs[0].id;
                    console.log(`Updating first tab (ID: ${firstTabId}) with URL: ${finalUrl}`);
                    const updatedTab = await browser.tabs.update(firstTabId, { url: finalUrl });
                    console.log("First tab updated successfully:", updatedTab);
                    firstTabUpdated = true;
                } else {
                    // Create a new tab for subsequent URLs.
                    console.log(`Creating a new tab in window ${newWindowPopulated.id} with URL: ${finalUrl}`);
                    const createdTab = await browser.tabs.create({ url: finalUrl, windowId: newWindowPopulated.id });
                    console.log("New tab created successfully:", createdTab);
                }
            } catch (err) {
                console.error(`Error opening URL "${finalUrl}":`, err);
                // Fallback: Open an empty tab if there's an error.
                if (!firstTabUpdated) {
                    const firstTabId = newWindowPopulated.tabs[0].id;
                    console.log(`Fallback: Updating first tab (ID: ${firstTabId}) to "about:blank" due to error.`);
                    const updatedTab = await browser.tabs.update(firstTabId, { url: "about:blank" });
                    console.log("Fallback: First tab updated to about:blank:", updatedTab);
                    firstTabUpdated = true;
                } else {
                    console.log(`Fallback: Creating a new tab with "about:blank" due to error.`);
                    const createdTab = await browser.tabs.create({ url: "about:blank", windowId: newWindowPopulated.id });
                    console.log("Fallback: New tab created with about:blank:", createdTab);
                }
            }
        }

        // Update the workspace with the new window ID.
        workspace.windowId = newWindowPopulated.id;
        console.log(`Updating workspace "${name}" with new windowId: ${newWindowPopulated.id}`);
        await browser.storage.local.set({ [name]: workspace });

        console.log(`Workspace "${name}" opened in a new window.`);
        return { status: `Workspace "${name}" opened in a new window.` };
    } catch (error) {
        console.error("Error opening workspace:", error);
        return { error: error.message };
    }
}


// Delete a saved workspace
async function deleteWorkspace(name) {
    try {
        console.log(`Deleting workspace: "${name}"`);
        // Remove the workspace entry from local storage
        await browser.storage.local.remove(name);
        console.log(`Workspace "${name}" deleted successfully.`);
        return { status: "ok" };
    } catch (error) {
        console.error("Error deleting workspace:", error);
        return { error: error.message };
    }
}

// Update the workspace associated with the given window ID.
async function updateWorkspaceForWindow(windowId) {
    try {
        console.log(`Updating workspace(s) for windowId: ${windowId}`);
        // Retrieve all stored workspaces.
        const allWorkspaces = await browser.storage.local.get();
        console.log("Retrieved all workspaces:", allWorkspaces);
        // Iterate over each workspace.
        for (const [name, workspace] of Object.entries(allWorkspaces)) {
            if (workspace && workspace.windowId === windowId) {
                console.log(`Workspace "${name}" is associated with windowId ${windowId}. Updating...`);
                // Get current tabs for this window.
                const tabs = await browser.tabs.query({ windowId: windowId });
                console.log(`Tabs currently in window ${windowId}:`, tabs);
                const urls = tabs.map(tab => tab.url);
                // Update the workspace's tab list.
                workspace.tabs = urls;
                console.log(`Updated tabs for workspace "${name}":`, urls);
                await browser.storage.local.set({ [name]: workspace });
                console.log(`Workspace "${name}" updated successfully.`);
            }
        }
    } catch (error) {
        console.error("Error updating workspace for window:", error);
    }
}

// Map to store debounce timers per window.
const windowDebounceTimers = {};

// Debounce function to delay execution of frequent updates.
function debounceForWindow(windowId, func, delay) {
    if (windowDebounceTimers[windowId]) {
        clearTimeout(windowDebounceTimers[windowId]);
    }
    windowDebounceTimers[windowId] = setTimeout(() => {
        console.log(`Debounce: Executing update for window ${windowId}`);
        func(windowId);
        delete windowDebounceTimers[windowId];
    }, delay);
}

// Listen for new tab creation.
browser.tabs.onCreated.addListener(tab => {
    console.log("Tab created:", tab);
    if (tab && tab.windowId) {
        console.log(`Tab created in windowId: ${tab.windowId}. Scheduling workspace update...`);
        debounceForWindow(tab.windowId, updateWorkspaceForWindow, 300);
    }
});

// Listen for tab removal.
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`Tab removed. Tab ID: ${tabId}`, removeInfo);
    if (removeInfo && removeInfo.windowId) {
        if (removeInfo.isWindowClosing) {
            console.log(`Tab removal due to window closing. Skipping workspace update for windowId: ${removeInfo.windowId}`);
        } else {
            console.log(`Tab removed from windowId: ${removeInfo.windowId}. Scheduling workspace update...`);
            debounceForWindow(removeInfo.windowId, updateWorkspaceForWindow, 300);
        }
    }
});

// Listen for tab updates (e.g., URL or title changes).
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    console.log(`Tab updated. Tab ID: ${tabId}`, changeInfo, tab);
    if (tab && tab.windowId) {
        console.log(`Tab updated in windowId: ${tab.windowId}. Scheduling workspace update...`);
        debounceForWindow(tab.windowId, updateWorkspaceForWindow, 300);
    }
});

// Listen for tab movement within the same window.
browser.tabs.onMoved.addListener((tabId, moveInfo) => {
    console.log(`Tab moved within window ${moveInfo.windowId}: Tab ID ${tabId} moved from index ${moveInfo.fromIndex} to ${moveInfo.toIndex}`);
    debounceForWindow(moveInfo.windowId, updateWorkspaceForWindow, 300);
});

// Listen for when a tab is detached from a window.
browser.tabs.onDetached.addListener((tabId, detachInfo) => {
    console.log(`Tab detached from window ${detachInfo.oldWindowId}: Tab ID ${tabId} detached from position ${detachInfo.oldPosition}`);
    debounceForWindow(detachInfo.oldWindowId, updateWorkspaceForWindow, 300);
});

// Listen for when a tab is attached to a new window.
browser.tabs.onAttached.addListener((tabId, attachInfo) => {
    console.log(`Tab attached to window ${attachInfo.newWindowId}: Tab ID ${tabId} attached at position ${attachInfo.newPosition}`);
    debounceForWindow(attachInfo.newWindowId, updateWorkspaceForWindow, 300);
});