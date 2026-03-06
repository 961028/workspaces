# Test Plan — Workspace Manager Extension

## Testing Strategy

**Framework:** A lightweight test harness with mocked `browser.*` APIs, since these functions run in a Firefox/Chrome extension context. Tests should mock `browser.storage.local`, `browser.tabs`, `browser.windows`, `browser.contextMenus`, `browser.tabGroups`, `browser.runtime`, `browser.theme`, and the DOM where needed.

**Categories:**

- **Unit tests** — individual functions with mocked dependencies
- **Integration tests** — message routing, handler chains, component wiring
- **DOM tests** — popup/options UI rendering and interaction (jsdom or similar)

---

## 1. background.js

### 1.1 `getWorkspaces()`

| #   | Test Case                                                                  | Type |
| --- | -------------------------------------------------------------------------- | ---- |
| 1   | Returns `{ workspaces: {}, nextId: 1 }` when storage is empty              | Unit |
| 2   | Returns stored workspaces and nextId when data exists                      | Unit |
| 3   | Logs error and returns defaults when `browser.storage.local.get()` rejects | Unit |

### 1.2 `setWorkspaces(workspaces, nextId)`

| #   | Test Case                                             | Type |
| --- | ----------------------------------------------------- | ---- |
| 1   | Calls `browser.storage.local.set()` with correct keys | Unit |
| 2   | Logs error when storage write rejects                 | Unit |

### 1.3 `unsetWindowIdForClosedWorkspaces(closedWindowId)`

| #   | Test Case                                                    | Type |
| --- | ------------------------------------------------------------ | ---- |
| 1   | Clears `windowId` on workspace matching the closed window ID | Unit |
| 2   | Does nothing when no workspace matches the closed window ID  | Unit |
| 3   | Handles multiple workspaces — only clears the matching one   | Unit |
| 4   | Persists changes via `setWorkspaces()`                       | Unit |

### 1.4 `queryGroupRanges(windowId, tabs)`

| #   | Test Case                                                                               | Type |
| --- | --------------------------------------------------------------------------------------- | ---- |
| 1   | Returns group range descriptors with correct start/end indices, title, color, collapsed | Unit |
| 2   | Returns empty array when no tab groups exist                                            | Unit |
| 3   | Returns empty array and logs warning when `browser.tabGroups` is unavailable            | Unit |
| 4   | Handles multiple non-contiguous groups in the same window                               | Unit |
| 5   | Correctly maps tab indices to position in the `tabs` array                              | Unit |

### 1.5 `sanitizeUrls(urls)`

| #   | Test Case                                     | Type |
| --- | --------------------------------------------- | ---- |
| 1   | Allows `http://` URLs through                 | Unit |
| 2   | Allows `https://` URLs through                | Unit |
| 3   | Allows `about:blank` through                  | Unit |
| 4   | Filters out `chrome://` URLs                  | Unit |
| 5   | Filters out `moz-extension://` URLs           | Unit |
| 6   | Filters out `file://` URLs                    | Unit |
| 7   | Filters out `javascript:` URLs                | Unit |
| 8   | Filters out `data:` URLs                      | Unit |
| 9   | Returns empty array when all URLs are blocked | Unit |
| 10  | Logs warning for each blocked URL             | Unit |
| 11  | Handles empty input array                     | Unit |

### 1.6 `scheduleWorkspaceUpdate(windowId)`

| #   | Test Case                                                               | Type |
| --- | ----------------------------------------------------------------------- | ---- |
| 1   | Adds windowId to `pendingUpdates` set                                   | Unit |
| 2   | Clears existing timer and sets a new one (debounce behavior)            | Unit |
| 3   | Multiple calls with different window IDs accumulate in `pendingUpdates` | Unit |
| 4   | Timer calls `processPendingUpdates()` after debounce delay              | Unit |

### 1.7 `processPendingUpdates()`

| #   | Test Case                                                                       | Type        |
| --- | ------------------------------------------------------------------------------- | ----------- |
| 1   | Clears `pendingUpdates` set after processing                                    | Integration |
| 2   | Calls `updateWorkspaceForWindow()` for each pending window that has a workspace | Integration |
| 3   | Skips windows that don't belong to any workspace                                | Integration |
| 4   | Calls `setWorkspaces()` once after processing all updates                       | Integration |
| 5   | Does nothing when `pendingUpdates` is empty                                     | Unit        |
| 6   | Handles errors from `browser.tabs.query()` gracefully                           | Unit        |

### 1.8 `updateWorkspaceForWindow(workspaces, winId, tabs)`

| #   | Test Case                                                       | Type |
| --- | --------------------------------------------------------------- | ---- |
| 1   | Updates workspace `tabs` array with current tab URLs and titles | Unit |
| 2   | Updates workspace `groupRanges` via `queryGroupRanges()`        | Unit |
| 3   | Updates workspace `title` to reflect the active tab's title     | Unit |
| 4   | Handles window with no tabs (empty array)                       | Unit |

### 1.9 `handleGetState(sendResponse)`

| #   | Test Case                                                                | Type        |
| --- | ------------------------------------------------------------------------ | ----------- |
| 1   | Returns saved workspaces and unsaved windows                             | Integration |
| 2   | Marks saved workspaces with correct `isOpen` status based on windowId    | Integration |
| 3   | Unsaved windows exclude windows that are currently tracked as workspaces | Integration |
| 4   | Unsaved windows are sorted by last active time (most recent first)       | Integration |
| 5   | Sends error via sendResponse when getWorkspaces() fails                  | Unit        |

### 1.10 `handleSaveWindow(windowId, sendResponse)`

| #   | Test Case                                                    | Type        |
| --- | ------------------------------------------------------------ | ----------- |
| 1   | Creates a new workspace entry from the window's current tabs | Integration |
| 2   | Increments `nextId` after creating workspace                 | Integration |
| 3   | Saves tab URLs, titles, and group ranges                     | Integration |
| 4   | Assigns the window ID to the new workspace                   | Integration |
| 5   | Sends success response                                       | Integration |
| 6   | Sends error response when window has no tabs                 | Unit        |

### 1.11 `handleOpenWorkspace(workspaceId, sendResponse)`

| #   | Test Case                                              | Type        |
| --- | ------------------------------------------------------ | ----------- |
| 1   | Focuses existing window when workspace is already open | Integration |
| 2   | Creates new window with workspace tabs when not open   | Integration |
| 3   | Sanitizes URLs before opening tabs                     | Integration |
| 4   | Restores tab groups (groupRanges) in the opened window | Integration |
| 5   | Sets window title preface from workspace customTitle   | Integration |
| 6   | Updates workspace `windowId` to the new window         | Integration |
| 7   | Sends error when workspace ID is not found             | Unit        |
| 8   | Handles workspace with no tabs gracefully              | Unit        |

### 1.12 `handleUnsaveWorkspace(workspaceId, sendResponse)`

| #   | Test Case                                         | Type |
| --- | ------------------------------------------------- | ---- |
| 1   | Removes workspace from storage                    | Unit |
| 2   | Persists updated workspaces via `setWorkspaces()` | Unit |
| 3   | Sends success response                            | Unit |
| 4   | Sends error when workspace ID is not found        | Unit |

### 1.13 `handleRenameWorkspace(workspaceId, newTitle, sendResponse)`

| #   | Test Case                                                   | Type        |
| --- | ----------------------------------------------------------- | ----------- |
| 1   | Sets `customTitle` on the workspace                         | Unit        |
| 2   | Updates window title preface if workspace is currently open | Integration |
| 3   | Persists updated workspace                                  | Unit        |
| 4   | Sends error when workspace ID is not found                  | Unit        |
| 5   | Handles empty string as newTitle                            | Unit        |

### 1.14 `handleUpdateOrder(newOrder, sendResponse)`

| #   | Test Case                                                       | Type |
| --- | --------------------------------------------------------------- | ---- |
| 1   | Assigns `order` property to each workspace based on array index | Unit |
| 2   | Persists reordered workspaces                                   | Unit |
| 3   | Handles partial order array (fewer IDs than workspaces)         | Unit |
| 4   | Sends success response                                          | Unit |

### 1.15 `focusWindow(windowId, sendResponse)`

| #   | Test Case                                             | Type |
| --- | ----------------------------------------------------- | ---- |
| 1   | Calls `browser.windows.update()` with `focused: true` | Unit |
| 2   | Sends success response on completion                  | Unit |
| 3   | Sends error response when window doesn't exist        | Unit |

### 1.16 `handleExportWorkspaces(sendResponse)`

| #   | Test Case                                     | Type |
| --- | --------------------------------------------- | ---- |
| 1   | Returns workspaces and nextId in response     | Unit |
| 2   | Returns empty object when no workspaces exist | Unit |

### 1.17 `handleImportWorkspace(msg, sendResponse)`

| #   | Test Case                                                            | Type |
| --- | -------------------------------------------------------------------- | ---- |
| 1   | Accepts valid import data with correct structure                     | Unit |
| 2   | Sanitizes all tab URLs during import                                 | Unit |
| 3   | Rejects import with missing `workspaces` key                         | Unit |
| 4   | Rejects import with missing `nextId` key                             | Unit |
| 5   | Rejects import with invalid workspace structure (missing tabs array) | Unit |
| 6   | Persists imported data via `setWorkspaces()`                         | Unit |
| 7   | Sends success/error response appropriately                           | Unit |

### 1.18 Message Router (`browser.runtime.onMessage`)

| #   | Test Case                                                              | Type        |
| --- | ---------------------------------------------------------------------- | ----------- |
| 1   | Routes `getState` to `handleGetState()`                                | Integration |
| 2   | Routes `saveWindow` to `handleSaveWindow()` with windowId              | Integration |
| 3   | Routes `openWorkspace` to `handleOpenWorkspace()` with workspaceId     | Integration |
| 4   | Routes `unsaveWorkspace` to `handleUnsaveWorkspace()` with workspaceId | Integration |
| 5   | Routes `renameWorkspace` to `handleRenameWorkspace()` with id/newTitle | Integration |
| 6   | Routes `updateOrder` to `handleUpdateOrder()` with newOrder            | Integration |
| 7   | Routes `focusWindow` to `focusWindow()` with windowId                  | Integration |
| 8   | Routes `exportWorkspaces` to `handleExportWorkspaces()`                | Integration |
| 9   | Routes `importWorkspaces` to `handleImportWorkspace()`                 | Integration |
| 10  | Logs warning for unknown action                                        | Unit        |
| 11  | Returns `true` to keep sendResponse alive for async handlers           | Unit        |

### 1.19 `registerTabListeners()`

| #   | Test Case                                                                                             | Type        |
| --- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Registers listeners for onCreated, onRemoved, onUpdated, onMoved, onAttached, onDetached, onActivated | Unit        |
| 2   | Each listener calls `scheduleWorkspaceUpdate()` with the correct windowId                             | Integration |

### 1.20 `registerWindowListeners()`

| #   | Test Case                                                                    | Type |
| --- | ---------------------------------------------------------------------------- | ---- |
| 1   | Registers onRemoved listener that calls `unsetWindowIdForClosedWorkspaces()` | Unit |
| 2   | Registers onFocusChanged listener that updates `windowLastActive`            | Unit |
| 3   | onFocusChanged ignores `WINDOW_ID_NONE`                                      | Unit |

### 1.21 `registerTabGroupListeners()`

| #   | Test Case                                                                     | Type        |
| --- | ----------------------------------------------------------------------------- | ----------- |
| 1   | Registers listeners for tabGroup events when `browser.tabGroups` is available | Unit        |
| 2   | Does nothing when `browser.tabGroups` is unavailable                          | Unit        |
| 3   | Each listener calls `scheduleWorkspaceUpdate()`                               | Integration |

### 1.22 `createMainMenu(title)`

| #   | Test Case                                             | Type |
| --- | ----------------------------------------------------- | ---- |
| 1   | Creates a context menu item with the provided title   | Unit |
| 2   | Uses default title when none provided                 | Unit |
| 3   | Handles duplicate creation gracefully (ignores error) | Unit |

### 1.23 `contextMenus.onShown` listener

| #   | Test Case                                                    | Type        |
| --- | ------------------------------------------------------------ | ----------- |
| 1   | Builds submenu with one entry per open window                | Integration |
| 2   | Omits the current tab's window from the submenu              | Integration |
| 3   | Labels each submenu entry with the window's active tab title | Integration |
| 4   | Stores window mappings in `lastSubmenuWindows`               | Integration |

### 1.24 `contextMenus.onClicked` listener

| #   | Test Case                                                               | Type        |
| --- | ----------------------------------------------------------------------- | ----------- |
| 1   | Moves highlighted/active tabs to the selected target window             | Integration |
| 2   | Handles case where no highlighted tabs exist (falls back to active tab) | Integration |
| 3   | Looks up target window from `lastSubmenuWindows` mapping                | Integration |

### 1.25 `setWindowTitlePrefaceForWorkspace(workspace, windowId)`

| #   | Test Case                                                | Type |
| --- | -------------------------------------------------------- | ---- |
| 1   | Sets window titlePreface to `customTitle` when it exists | Unit |
| 2   | Clears titlePreface when customTitle is empty/null       | Unit |
| 3   | Handles missing/closed window gracefully (logs warning)  | Unit |

---

## 2. popup/popup.js

### 2.1 `PopupApp`

#### `init()`

| #   | Test Case                                                   | Type        |
| --- | ----------------------------------------------------------- | ----------- |
| 1   | Calls `contextMenu.create()`                                | Integration |
| 2   | Calls `loadState()`                                         | Integration |
| 3   | Attaches click listener on document that hides context menu | DOM         |

#### `loadState()`

| #   | Test Case                                                              | Type        |
| --- | ---------------------------------------------------------------------- | ----------- |
| 1   | Queries `browser.windows.getLastFocused()` for current window ID       | Integration |
| 2   | Sends `getState` message to background                                 | Integration |
| 3   | Calls `updateSavedList()` and `updateUnsavedList()` with response data | Integration |
| 4   | Shows error status when background responds with error                 | DOM         |

#### `sendMessage(message)`

| #   | Test Case                                              | Type        |
| --- | ------------------------------------------------------ | ----------- |
| 1   | Sends message via `browser.runtime.sendMessage()`      | Unit        |
| 2   | Shows success status on successful response            | DOM         |
| 3   | Shows error status when background responds with error | DOM         |
| 4   | Reloads state after message completes                  | Integration |

#### `persistSavedOrder()`

| #   | Test Case                                           | Type        |
| --- | --------------------------------------------------- | ----------- |
| 1   | Reads workspace IDs from DOM list items in order    | DOM         |
| 2   | Sends `updateOrder` message with extracted ID array | Integration |

### 2.2 `WorkspaceList`

#### `updateSavedList(saved, currentWindowId)`

| #   | Test Case                                                       | Type |
| --- | --------------------------------------------------------------- | ---- |
| 1   | Renders one list item per saved workspace                       | DOM  |
| 2   | Renders empty state when no saved workspaces                    | DOM  |
| 3   | Highlights the workspace whose window matches `currentWindowId` | DOM  |
| 4   | Calls `setupPointerDnD()` after rendering                       | DOM  |

#### `createSavedListItem(workspace, currentWindowId)`

| #   | Test Case                                                          | Type |
| --- | ------------------------------------------------------------------ | ---- |
| 1   | Creates `<li>` with workspace title as text                        | DOM  |
| 2   | Sets `data-workspace-id` attribute                                 | DOM  |
| 3   | Marks item as active when `workspace.windowId === currentWindowId` | DOM  |
| 4   | Shows tab count badge                                              | DOM  |
| 5   | Adds click handler that sends `openWorkspace` message              | DOM  |
| 6   | Adds context menu handler that calls `contextMenu.show()`          | DOM  |
| 7   | Calls `setFavicon()` to load workspace icon                        | DOM  |

#### `updateUnsavedList(unsaved, currentWindowId)`

| #   | Test Case                                                   | Type |
| --- | ----------------------------------------------------------- | ---- |
| 1   | Renders one list item per unsaved window                    | DOM  |
| 2   | Renders empty state / hides section when no unsaved windows | DOM  |
| 3   | Shows `<hr>` separator only when both lists have items      | DOM  |
| 4   | Marks the current window's item as active                   | DOM  |

#### `createUnsavedListItem(win, currentWindowId)`

| #   | Test Case                                                       | Type |
| --- | --------------------------------------------------------------- | ---- |
| 1   | Creates `<li>` with window title as text                        | DOM  |
| 2   | Adds save button that sends `saveWindow` message with window ID | DOM  |
| 3   | Adds click handler that sends `focusWindow` message             | DOM  |
| 4   | Marks item as active when `win.id === currentWindowId`          | DOM  |
| 5   | Calls `setFavicon()` with the window's active tab               | DOM  |

#### `handleDragStartUnsaved(e)`

| #   | Test Case                                   | Type |
| --- | ------------------------------------------- | ---- |
| 1   | Sets drag data with window ID on drag event | DOM  |

#### `setFavicon(li, windowId, fallback)`

| #   | Test Case                                               | Type |
| --- | ------------------------------------------------------- | ---- |
| 1   | Queries background for active tab in the window         | Unit |
| 2   | Sets favicon `<img>` src to the tab's favIconUrl        | DOM  |
| 3   | Falls back to default icon when no favIconUrl available | DOM  |
| 4   | Handles missing active tab gracefully                   | Unit |

### 2.3 `ContextMenu`

#### `create()`

| #   | Test Case                                           | Type |
| --- | --------------------------------------------------- | ---- |
| 1   | Creates menu element with Rename and Unsave options | DOM  |
| 2   | Appends menu to DOM body                            | DOM  |

#### `show(e, workspaceId)`

| #   | Test Case                                          | Type |
| --- | -------------------------------------------------- | ---- |
| 1   | Sets menu `display` to visible                     | DOM  |
| 2   | Positions menu at pointer coordinates              | DOM  |
| 3   | Stores `currentWorkspaceId` for later use          | Unit |
| 4   | Adjusts position when menu would overflow viewport | DOM  |

#### `hide()`

| #   | Test Case                   | Type |
| --- | --------------------------- | ---- |
| 1   | Hides the context menu      | DOM  |
| 2   | Clears `currentWorkspaceId` | Unit |

#### `onRenameClick()`

| #   | Test Case                                                     | Type        |
| --- | ------------------------------------------------------------- | ----------- |
| 1   | Opens prompt dialog with current workspace title              | DOM         |
| 2   | Sends `renameWorkspace` message with new title when confirmed | Integration |
| 3   | Does nothing when prompt is cancelled                         | Unit        |
| 4   | Does nothing when prompt returns empty string                 | Unit        |

#### `onUnsaveClick()`

| #   | Test Case                                                | Type        |
| --- | -------------------------------------------------------- | ----------- |
| 1   | Sends `unsaveWorkspace` message with stored workspace ID | Integration |

#### `isOpenForWorkspace(workspaceId)`

| #   | Test Case                                                    | Type |
| --- | ------------------------------------------------------------ | ---- |
| 1   | Returns `true` when menu is visible and matches workspace ID | Unit |
| 2   | Returns `false` when menu is hidden                          | Unit |
| 3   | Returns `false` when menu is open for a different workspace  | Unit |

#### `isOpenForOtherWorkspace(workspaceId)`

| #   | Test Case                                                     | Type |
| --- | ------------------------------------------------------------- | ---- |
| 1   | Returns `true` when menu is visible for a different workspace | Unit |
| 2   | Returns `false` when menu is hidden                           | Unit |
| 3   | Returns `false` when menu is open for the same workspace      | Unit |

### 2.4 `DragAndDropManager`

#### `pointerDownHandler(e)`

| #   | Test Case                                          | Type |
| --- | -------------------------------------------------- | ---- |
| 1   | Initiates drag state on pointerdown                | DOM  |
| 2   | Captures pointer on the dragging element           | DOM  |
| 3   | Calls `disablePageScroll()`                        | DOM  |
| 4   | Calls `initDraggableItem()` and `initItemsState()` | DOM  |

#### `pointerMoveHandler(e)`

| #   | Test Case                                         | Type |
| --- | ------------------------------------------------- | ---- |
| 1   | Updates dragging item transform to follow pointer | DOM  |
| 2   | Calls `updateIdleItemsStateAndPosition()`         | DOM  |

#### `pointerUpHandler(e)`

| #   | Test Case                                        | Type        |
| --- | ------------------------------------------------ | ----------- |
| 1   | Calls `applyNewItemsOrder()` to commit DOM order | DOM         |
| 2   | Calls `persistSavedOrder()` to save to storage   | Integration |
| 3   | Calls `cleanup()` to reset state                 | DOM         |

#### `setupPointerDnD()`

| #   | Test Case                                         | Type |
| --- | ------------------------------------------------- | ---- |
| 1   | Adds pointerdown listener to saved list container | DOM  |
| 2   | Only triggers drag on list item children          | DOM  |

#### `initItemsState()`

| #   | Test Case                                               | Type |
| --- | ------------------------------------------------------- | ---- |
| 1   | Sets `data-is-above` on items above the dragging item   | DOM  |
| 2   | Clears `data-is-above` on items below the dragging item | DOM  |

#### `updateIdleItemsStateAndPosition()`

| #   | Test Case                                           | Type |
| --- | --------------------------------------------------- | ---- |
| 1   | Toggles items that the dragging item has moved past | DOM  |
| 2   | Applies vertical transform offset to toggled items  | DOM  |
| 3   | Resets transform on non-toggled items               | DOM  |

#### `applyNewItemsOrder()`

| #   | Test Case                                              | Type |
| --- | ------------------------------------------------------ | ---- |
| 1   | Reorders DOM children to match final drag position     | DOM  |
| 2   | Handles drag to first position                         | DOM  |
| 3   | Handles drag to last position                          | DOM  |
| 4   | Handles drag that returns to original position (no-op) | DOM  |

#### `getAllItems()` / `getIdleItems()`

| #   | Test Case                                                      | Type |
| --- | -------------------------------------------------------------- | ---- |
| 1   | `getAllItems()` returns all `.saved-item` elements in the list | DOM  |
| 2   | `getIdleItems()` excludes the currently dragging item          | DOM  |

#### `isItemAbove(item)` / `isItemToggled(item)`

| #   | Test Case                                                      | Type |
| --- | -------------------------------------------------------------- | ---- |
| 1   | `isItemAbove()` returns based on `data-is-above` attribute     | Unit |
| 2   | `isItemToggled()` returns based on `data-is-toggled` attribute | Unit |

#### `cleanup()`

| #   | Test Case                                           | Type |
| --- | --------------------------------------------------- | ---- |
| 1   | Calls `removePointerListeners()`                    | DOM  |
| 2   | Calls `unsetDraggableItem()` and `unsetItemState()` | DOM  |
| 3   | Calls `enablePageScroll()`                          | DOM  |
| 4   | Resets internal drag state variables                | Unit |

#### `addListItemEvents(li, options)`

| #   | Test Case                                                            | Type |
| --- | -------------------------------------------------------------------- | ---- |
| 1   | Registers click handler on the list item                             | DOM  |
| 2   | Registers click handler on the button (if `buttonSelector` provided) | DOM  |
| 3   | Distinguishes between click and drag (prevents click after drag)     | DOM  |

#### `disablePageScroll()` / `enablePageScroll()`

| #   | Test Case                                                             | Type |
| --- | --------------------------------------------------------------------- | ---- |
| 1   | `disablePageScroll()` sets `overflow: hidden` and `user-select: none` | DOM  |
| 2   | `enablePageScroll()` clears those styles                              | DOM  |

### 2.5 `StatusBar`

#### `show(message, isError)`

| #   | Test Case                                         | Type |
| --- | ------------------------------------------------- | ---- |
| 1   | Sets status element text to the message           | DOM  |
| 2   | Applies error class when `isError` is true        | DOM  |
| 3   | Applies success class when `isError` is false     | DOM  |
| 4   | Clears message after 3 seconds                    | DOM  |
| 5   | Resets previous timeout when called again quickly | DOM  |

### 2.6 `ThemeManager`

#### `setInitialStyle()`

| #   | Test Case                                                                   | Type |
| --- | --------------------------------------------------------------------------- | ---- |
| 1   | Calls `browser.theme.getCurrent()` and passes result to `applyThemeStyle()` | Unit |
| 2   | Handles missing `browser.theme` API gracefully                              | Unit |

#### `applyThemeStyle(theme)`

| #   | Test Case                                                     | Type |
| --- | ------------------------------------------------------------- | ---- |
| 1   | Sets `--Menu` CSS variable from `theme.colors.popup`          | DOM  |
| 2   | Sets `--MenuText` CSS variable from `theme.colors.popup_text` | DOM  |
| 3   | Does nothing when theme has no colors                         | Unit |
| 4   | Does nothing when theme is null/undefined                     | Unit |

#### `listenForThemeUpdates()`

| #   | Test Case                                         | Type        |
| --- | ------------------------------------------------- | ----------- |
| 1   | Registers listener on `browser.theme.onUpdated`   | Unit        |
| 2   | Calls `applyThemeStyle()` when theme updates fire | Integration |

### 2.7 `createPopupApp()`

| #   | Test Case                                                | Type        |
| --- | -------------------------------------------------------- | ----------- |
| 1   | Returns a `PopupApp` instance                            | Unit        |
| 2   | Wires `sendMessage` to `WorkspaceList` and `ContextMenu` | Integration |
| 3   | Wires `persistSavedOrder` to `DragAndDropManager`        | Integration |

---

## 3. options/options.js

### 3.1 `showStatus(msg, isError)`

| #   | Test Case                                        | Type |
| --- | ------------------------------------------------ | ---- |
| 1   | Sets `#status` element text to the message       | DOM  |
| 2   | Sets text color to red when `isError` is true    | DOM  |
| 3   | Sets text color to green when `isError` is false | DOM  |
| 4   | Clears message after 3 seconds                   | DOM  |

### 3.2 `processImportData(text)`

| #   | Test Case                                              | Type        |
| --- | ------------------------------------------------------ | ----------- |
| 1   | Parses valid JSON and sends `importWorkspaces` message | Integration |
| 2   | Shows success status when import succeeds              | DOM         |
| 3   | Shows error status when JSON is malformed              | Unit        |
| 4   | Shows error status when background returns error       | Integration |

### 3.3 `exportWorkspaces()`

| #   | Test Case                                              | Type        |
| --- | ------------------------------------------------------ | ----------- |
| 1   | Sends `exportWorkspaces` message to background         | Integration |
| 2   | Creates a Blob with JSON content and triggers download | DOM         |
| 3   | Uses correct filename (`workspaces-export.json`)       | Unit        |
| 4   | Shows success status after download                    | DOM         |
| 5   | Shows error status when export fails                   | Unit        |

### 3.4 DOMContentLoaded listener

| #   | Test Case                                                            | Type |
| --- | -------------------------------------------------------------------- | ---- |
| 1   | Binds click handler to export button                                 | DOM  |
| 2   | Binds click handler to import button that triggers file input        | DOM  |
| 3   | File input change handler reads file and calls `processImportData()` | DOM  |
| 4   | Handles drag-and-drop import of JSON files                           | DOM  |

---

## Test Count Summary

| File               | Unit   | Integration | DOM    | Total   |
| ------------------ | ------ | ----------- | ------ | ------- |
| background.js      | 48     | 30          | 0      | 78      |
| popup/popup.js     | 18     | 14          | 55     | 87      |
| options/options.js | 4      | 3           | 7      | 14      |
| **Total**          | **70** | **47**      | **62** | **179** |

---

## Mock Requirements

### `browser.*` API mocks needed

- `browser.storage.local` — `get()`, `set()`
- `browser.tabs` — `query()`, `move()`, `group()`
- `browser.windows` — `getAll()`, `create()`, `update()`, `get()`, `getLastFocused()`, `getCurrent()`, `WINDOW_ID_NONE`
- `browser.tabGroups` — `query()`, `group()`, `onCreated`, `onUpdated`, `onMoved`, `onRemoved`
- `browser.runtime` — `sendMessage()`, `onMessage`
- `browser.contextMenus` — `create()`, `removeAll()`, `refresh()`, `onShown`, `onClicked`
- `browser.theme` — `getCurrent()`, `onUpdated`

### DOM mocking

- jsdom or happy-dom for popup and options page DOM operations
- Stub `window.prompt()` for rename tests
- Stub `URL.createObjectURL()` and `document.createElement('a')` for export download tests

### Timer mocking

- Mock `setTimeout` / `clearTimeout` for debounce and status auto-clear tests
