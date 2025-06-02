/**
 * This section implements a pointer-based drag-and-drop reordering widget for list items.
 * It is modular and does not interfere with the existing drag-and-drop logic above.
 *
 * To use, add the 'js-list' class to a <ul> or <ol> and 'js-item' to its <li> children.
 *
 * All logic is self-contained and follows the project's coding standards.
 */

'use strict';

// Global variables and cached elements for the widget
let listContainer = null; // The container element for the draggable list
let draggableItem = null; // The item currently being dragged
let pointerStartX = 0; // X position where pointer started
let pointerStartY = 0; // Y position where pointer started
let items = []; // Cached list of items

function setupPointerDnD() {
  const list = getDomElement("saved-list");
  if (!list) return;
  listContainer = list;
  list.onpointerdown = null;
  list.addEventListener('pointerdown', pointerDownHandler);
}

function pointerDownHandler(e) {
  if (e.button !== 0) return;
  draggableItem = e.target.closest('.js-item');
  if (!draggableItem) return;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;

  disablePageScroll();
  initDraggableItem();
  initItemsState();

  draggableItem.setPointerCapture(e.pointerId);
  draggableItem.addEventListener('pointermove', pointerMoveHandler);
  draggableItem.addEventListener('pointerup', pointerUpHandler);
  draggableItem.addEventListener('pointercancel', pointerUpHandler);
}

function pointerMoveHandler(e) {
  if (!draggableItem) return;
  e.preventDefault();
  const currentX = e.clientX;
  const currentY = e.clientY;
  const offsetX = currentX - pointerStartX;
  const offsetY = currentY - pointerStartY;
  draggableItem.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  updateIdleItemsStateAndPosition();
}

function pointerUpHandler(e) {
  if (!draggableItem) return;
  draggableItem.removeEventListener('pointermove', pointerMoveHandler);
  draggableItem.removeEventListener('pointerup', pointerUpHandler);
  draggableItem.removeEventListener('pointercancel', pointerUpHandler);
  draggableItem.releasePointerCapture(e.pointerId);
  applyNewItemsOrder();
  persistSavedOrder();
  cleanup();
}

function initDraggableItem() {
  if (!draggableItem) return;
  draggableItem.classList.remove('is-idle');
  draggableItem.classList.add('is-draggable');
}

function initItemsState() {
  getIdleItems().forEach((item, index) => {
    if (getAllItems().indexOf(draggableItem) > index) {
      item.dataset.isAbove = 'true';
    }
  });
}

function updateIdleItemsStateAndPosition() {
  if (!draggableItem) return;
  const draggableRect = draggableItem.getBoundingClientRect();
  const draggableCenterY = draggableRect.top + draggableRect.height / 2;
  getIdleItems().forEach((item) => {
    const itemRect = item.getBoundingClientRect();
    const itemCenterY = itemRect.top + itemRect.height / 2;
    if (isItemAbove(item)) {
      if (draggableCenterY <= itemCenterY) {
        item.dataset.isToggled = 'true';
      } else {
        delete item.dataset.isToggled;
      }
    } else {
      if (draggableCenterY >= itemCenterY) {
        item.dataset.isToggled = 'true';
      } else {
        delete item.dataset.isToggled;
      }
    }
  });
  getIdleItems().forEach((item) => {
    if (isItemToggled(item)) {
      const direction = isItemAbove(item) ? 1 : -1;
      item.style.transform = `translateY(${direction * (draggableRect.height + ITEMS_GAP)}px)`;
    } else {
      item.style.transform = '';
    }
  });
}

function getAllItems() {
  if (!listContainer) return [];
  items = Array.from(listContainer.querySelectorAll('.js-item'));
  return items;
}

function getIdleItems() {
  return getAllItems().filter((item) => item.classList.contains('is-idle'));
}

function isItemAbove(item) {
  return item.hasAttribute('data-is-above');
}

function isItemToggled(item) {
  return item.hasAttribute('data-is-toggled');
}

function applyNewItemsOrder() {
  const reorderedItems = [];
  getAllItems().forEach((item, index) => {
    if (item === draggableItem) return;
    if (!isItemToggled(item)) {
      reorderedItems[index] = item;
    } else {
      const newIndex = isItemAbove(item) ? index + 1 : index - 1;
      reorderedItems[newIndex] = item;
    }
  });
  for (let index = 0; index < getAllItems().length; index++) {
    if (typeof reorderedItems[index] === 'undefined') {
      reorderedItems[index] = draggableItem;
    }
  }
  reorderedItems.forEach((item) => {
    listContainer.appendChild(item);
  });
}

function unsetDraggableItem() {
  if (!draggableItem) return;
  draggableItem.style.transform = '';
  draggableItem.classList.remove('is-draggable');
  draggableItem.classList.add('is-idle');
  draggableItem = null;
}

function unsetItemState() {
  getIdleItems().forEach((item) => {
    delete item.dataset.isAbove;
    delete item.dataset.isToggled;
    item.style.transform = '';
  });
}

function disablePageScroll() {
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
  document.body.style.userSelect = 'none';
}

function enablePageScroll() {
  document.body.style.overflow = '';
  document.body.style.touchAction = '';
  document.body.style.userSelect = '';
}

function cleanup() {
  items = [];
  unsetDraggableItem();
  unsetItemState();
  enablePageScroll();
}
