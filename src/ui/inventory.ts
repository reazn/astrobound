import {
  EQUIP_SLOTS, EQUIP_SLOT_LABEL, RARITY_LABEL, CATEGORY_ORDER, CATEGORY_LABEL,
  itemHasGearDetails,
  type EquipSlot, type ItemDef, type ItemCategory,
} from "../content/items";
import {
  type InvLoc, type PlayerInventory, type ItemStack,
  resolveItem, stackAt, tryMove, tryEquip, tryUnequip, splitStack, takeStack,
  findEmptyBagSlot, sortBag, consolidateStacks,
} from "../inventory/playerInventory";
import {
  setSlotPreview, clearAllSlotPreviews, mountItemPreview, stopItemPreview,
  paintItemToCanvas, hasItemPreview,
} from "./itemPreview";

export interface InventoryUI {
  readonly open: boolean;
  setOpen(open: boolean): void;
  refresh(): void;
  dispose(): void;
}

export interface InventoryCallbacks {
  onToggle: (open: boolean) => void;
  canOpen?: () => boolean;
  onDropItem?: (itemId: string, qty: number) => void;
}

type ItemRarity = ItemDef["rarity"];

const OVERLAY_CLASS = "hidden fixed inset-0 z-[45] select-none bg-transparent font-sans text-[#f4f1e8] pointer-events-none";
const CHROME_CLASS = "absolute inset-y-0 left-1/2 box-border flex w-[min(1080px,100%)] -translate-x-1/2 items-center justify-between gap-7 px-[22px] pointer-events-none max-[720px]:left-0 max-[720px]:w-full max-[720px]:translate-x-0 max-[720px]:flex-col max-[720px]:justify-between max-[720px]:p-3";
const PANEL_CLASS = "pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/8 bg-[rgba(20,24,34,0.94)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]";
const EQUIP_PANEL_CLASS = `${PANEL_CLASS} max-h-[80vh] w-[108px] shrink-0 self-center px-3 py-4 max-[720px]:w-[min(320px,calc(100vw-28px))]`;
const BAG_PANEL_CLASS = `${PANEL_CLASS} h-[80vh] max-h-[80vh] w-[min(380px,42vw)] px-3.5 py-4 max-[720px]:h-[42vh] max-[720px]:w-[min(320px,calc(100vw-28px))]`;
const SECTION_TITLE_CLASS = "mb-3 shrink-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#f4f1e8]/55";
const BAG_HEADER_CLASS = "-mx-3.5 -mt-4 mb-3 shrink-0 border-b border-white/8 bg-white/[0.03] px-3.5 pb-3 pt-4";
const BAG_TITLE_ROW_CLASS = "mb-2.5 flex items-center justify-between";
const BAG_TITLE_CLASS = "m-0 text-xl font-semibold tracking-[0.02em] text-[#f4f1e8]";
const TOOLS_CLASS = "flex items-center gap-2";
const SEARCH_CLASS = "h-8 min-w-0 flex-1 rounded-[10px] border border-white/8 bg-[rgba(8,10,18,0.55)] px-3 text-[13px] text-[#f4f1e8] outline-none placeholder:text-[#f4f1e8]/55 focus:border-[rgba(232,98,58,0.55)]";
const ICON_BUTTON_CLASS = "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-white/8 bg-[rgba(8,10,18,0.45)] p-0 text-[#f4f1e8] hover:border-[rgba(232,98,58,0.5)] hover:bg-[rgba(232,98,58,0.12)] hover:text-[#e8623a]";
const HINT_CLASS = "text-xs text-[#f4f1e8]/55";
const KBD_CLASS = "inline-block rounded-md border border-white/8 bg-[rgba(8,10,18,0.4)] px-1.5 py-0.5 font-mono text-[10px] text-[#f4f1e8]";
const EQUIP_GRID_CLASS = "flex flex-col gap-2";
const BAG_SCROLL_CLASS = "min-h-0 flex-1 overflow-auto pr-0.5";
const BAG_LIST_CLASS = "flex flex-col gap-3.5";
const CATEGORY_CLASS = "";
const CATEGORY_TITLE_CLASS = "mb-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#f4f1e8]/55";
const CATEGORY_GRID_CLASS = "grid grid-cols-4 gap-2 max-[720px]:grid-cols-5";
const EMPTY_CLASS = "px-2 py-6 text-center text-[13px] text-[#f4f1e8]/55";
const SLOT_BASE_CLASS = "relative flex aspect-square min-h-16 w-full items-center justify-center overflow-hidden rounded-[10px] border-2 p-0 hover:border-[rgba(232,98,58,0.45)]";
const SLOT_LABEL_CLASS = "pointer-events-none absolute left-[5px] top-1 z-[2] text-[8px] uppercase tracking-[0.08em] text-[#f4f1e8]/55 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]";
const SLOT_ICON_CLASS = "pointer-events-none absolute inset-0 flex [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full";
const QTY_CLASS = "pointer-events-none absolute bottom-[3px] right-[5px] z-[2] font-mono text-[10px] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]";
const DRAGGING_CLASS = "opacity-[0.35]";
const TOOLTIP_CLASS = "fixed z-[60] w-[300px] overflow-hidden rounded-xl border border-white/8 bg-[rgba(20,24,34,0.96)] p-0 text-[#f4f1e8] shadow-[0_20px_60px_rgba(0,0,0,0.5)] pointer-events-none";
const TIP_HERO_CLASS = "grid grid-cols-[72px_1fr] items-center gap-3 border-b border-white/8 p-3.5";
const TIP_ART_CLASS = "flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[10px] border border-current bg-[rgba(8,10,18,0.55)] [&>canvas]:!h-full [&>canvas]:!w-full [&>svg]:h-[34px] [&>svg]:w-[34px]";
const TIP_NAME_CLASS = "text-base font-semibold leading-[1.15] text-inherit";
const TIP_META_CLASS = "mt-1 text-[11px] uppercase tracking-[0.06em] opacity-90";
const TIP_GS_CLASS = "flex items-baseline gap-2.5 px-3 pt-3";
const TIP_GS_VALUE_CLASS = "font-mono text-[28px] font-bold leading-none tracking-normal text-[#e8623a]";
const TIP_GS_LABEL_CLASS = "text-[11px] uppercase tracking-[0.14em] text-[#f4f1e8]/55";
const TIP_DESC_CLASS = "mx-3.5 mb-3.5 mt-2.5 text-[13px] leading-[1.45] text-[#f4f1e8]/80";
const TIP_STACK_CLASS = "flex flex-col gap-1.5 px-3 pb-3";
const TIP_EMPTY_SOCKET_CLASS = "rounded-lg border border-dashed border-white/8 bg-[rgba(8,10,18,0.4)] px-[9px] py-2 text-[11px] text-[#f4f1e8]/55 opacity-70";
const GHOST_BASE_CLASS = "fixed z-[70] box-border flex h-16 w-16 items-center justify-center overflow-hidden rounded-[10px] border-2 shadow-[0_12px_28px_rgba(0,0,0,0.5)] pointer-events-none [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full";
const GHOST_QTY_CLASS = "pointer-events-none absolute bottom-0.5 right-[3px] z-[2] font-mono text-[11px] font-bold text-[#f4f1e8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]";
const MENU_CLASS = "fixed z-[1000] min-w-[180px] rounded-xl border border-white/8 bg-[rgba(20,24,34,0.98)] p-1.5 font-sans text-[#f4f1e8] shadow-[0_20px_60px_rgba(0,0,0,0.5)] pointer-events-auto";
const MENU_BUTTON_CLASS = "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-0 bg-transparent px-3 py-[9px] text-left font-sans text-[13px] text-[#f4f1e8] transition-[background,color] duration-100 hover:bg-[rgba(232,98,58,0.18)] hover:text-[#ffb08a] focus-visible:bg-[rgba(232,98,58,0.18)] focus-visible:text-[#ffb08a] disabled:cursor-default disabled:opacity-[0.35] disabled:hover:bg-transparent disabled:hover:text-[#f4f1e8]";
const MENU_CHEVRON_CLASS = "text-base leading-none opacity-[0.65]";
const MENU_BACK_CLASS = `${MENU_BUTTON_CLASS} mb-1 justify-start gap-1.5 rounded-none border-b border-white/8 text-xs tracking-[0.04em] text-[#f4f1e8]/55`;
const MENU_SPLIT_CLASS = "px-2 pb-1.5 pt-2.5";
const MENU_SPLIT_ROW_CLASS = "mb-2 grid grid-cols-[28px_1fr_28px] items-center gap-2";
const MENU_SPLIT_COUNT_CLASS = "text-center font-mono text-xs text-[#e8623a]";
const RANGE_CLASS = "w-full accent-[#e8623a]";
const MENU_PRIMARY_CLASS = `${MENU_BUTTON_CLASS} block justify-center border border-[rgba(232,98,58,0.4)] bg-[rgba(232,98,58,0.16)] text-center`;

const RARITY_SLOT_CLASSES: Record<ItemRarity | "none", string> = {
  none: "cursor-default border-white/8 bg-[rgba(8,10,18,0.5)] text-[#f4f1e8]",
  common: "cursor-grab border-[#b8b0a4]/45 bg-[#b8b0a4]/15 text-[#b8b0a4]",
  uncommon: "cursor-grab border-[#6fbf73]/50 bg-[#6fbf73]/15 text-[#6fbf73]",
  rare: "cursor-grab border-[#4a9eff]/55 bg-[#4a9eff]/20 text-[#4a9eff]",
  epic: "cursor-grab border-[#b56bff]/55 bg-[#b56bff]/20 text-[#b56bff]",
  legendary: "cursor-grab border-[#e8a23a]/60 bg-[#e8a23a]/20 text-[#e8a23a]",
};

const RARITY_TIP_HERO_CLASSES: Record<ItemRarity, string> = {
  common: "bg-[#b8b0a4]/15 text-[#b8b0a4]",
  uncommon: "bg-[#6fbf73]/15 text-[#6fbf73]",
  rare: "bg-[#4a9eff]/20 text-[#4a9eff]",
  epic: "bg-[#b56bff]/20 text-[#b56bff]",
  legendary: "bg-[#e8a23a]/20 text-[#e8a23a]",
};

function sameLoc(a: InvLoc, b: InvLoc): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "bag" && b.kind === "bag") return a.index === b.index;
  if (a.kind === "equip" && b.kind === "equip") return a.slot === b.slot;
  return false;
}

export function createInventoryUI(
  root: HTMLElement,
  inv: PlayerInventory,
  callbacks: InventoryCallbacks,
): InventoryUI {
  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  overlay.innerHTML =
    `<div class="${CHROME_CLASS}">` +
    `<aside class="${EQUIP_PANEL_CLASS}">` +
    `<h2 class="${SECTION_TITLE_CLASS}">Equipped</h2>` +
    `<div class="${EQUIP_GRID_CLASS}" id="sb-inv-equip"></div>` +
    `</aside>` +
    `<section class="${BAG_PANEL_CLASS}">` +
    `<div class="${BAG_HEADER_CLASS}">` +
    `<div class="${BAG_TITLE_ROW_CLASS}">` +
    `<h2 class="${BAG_TITLE_CLASS}">Inventory</h2>` +
    `<span class="${HINT_CLASS}"><kbd class="${KBD_CLASS}">Tab</kbd></span>` +
    `</div>` +
    `<div class="${TOOLS_CLASS}">` +
    `<input type="search" class="${SEARCH_CLASS}" id="sb-inv-search" placeholder="Search…" autocomplete="off" spellcheck="false" />` +
    `<button type="button" class="${ICON_BUTTON_CLASS}" id="sb-inv-sort" title="Sort">` +
    `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 7h12v2H8V7zm-4 0h2v2H4V7zm4 6h8v2H8v-2zm-4 0h2v2H4v-2zm4 6h4v2H8v-2zm-4 0h2v2H4v-2z"/></svg>` +
    `</button>` +
    `<button type="button" class="${ICON_BUTTON_CLASS}" id="sb-inv-stack" title="Stack">` +
    `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2L3 7l9 5 9-5-9-5zm0 9.5L4.5 7.2 3 8l9 5 9-5-1.5-.8L12 11.5zM3 13l9 5 9-5-1.5-.8L12 16.5 4.5 12.2 3 13z"/></svg>` +
    `</button>` +
    `</div>` +
    `</div>` +
    `<div class="${BAG_SCROLL_CLASS}"><div class="${BAG_LIST_CLASS}" id="sb-inv-bag"></div></div>` +
    `</section>` +
    `</div>` +
    `<div class="${TOOLTIP_CLASS}" id="sb-inv-tip" hidden></div>` +
    `<div class="${GHOST_BASE_CLASS} ${RARITY_SLOT_CLASSES.none}" id="sb-inv-ghost" hidden></div>`;
  root.appendChild(overlay);

  const menu = document.createElement("div");
  menu.className = MENU_CLASS;
  menu.hidden = true;
  document.body.appendChild(menu);

  const equipRoot = overlay.querySelector("#sb-inv-equip") as HTMLElement;
  const bagRoot = overlay.querySelector("#sb-inv-bag") as HTMLElement;
  const tip = overlay.querySelector("#sb-inv-tip") as HTMLElement;
  const ghost = overlay.querySelector("#sb-inv-ghost") as HTMLElement;
  const searchInput = overlay.querySelector("#sb-inv-search") as HTMLInputElement;
  const ghostCanvas = document.createElement("canvas");
  ghostCanvas.width = 72;
  ghostCanvas.height = 72;
  ghost.appendChild(ghostCanvas);
  const ghostQty = document.createElement("span");
  ghostQty.className = GHOST_QTY_CLASS;
  ghost.appendChild(ghostQty);

  let isOpen = false;
  let dragFrom: InvLoc | null = null;
  let dragPointerId: number | null = null;
  let pending: {
    loc: InvLoc;
    el: HTMLElement;
    pointerId: number;
    x: number;
    y: number;
  } | null = null;
  let menuLoc: InvLoc | null = null;
  let searchQuery = "";
  const DRAG_THRESHOLD = 6;

  const equipCells = new Map<EquipSlot, HTMLElement>();
  const bagCells = new Map<number, HTMLElement>();

  for (const slot of EQUIP_SLOTS) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `${SLOT_BASE_CLASS} ${RARITY_SLOT_CLASSES.none}`;
    cell.dataset.invSlot = "1";
    cell.dataset.equip = slot;
    cell.title = EQUIP_SLOT_LABEL[slot];
    cell.innerHTML =
      `<span class="${SLOT_LABEL_CLASS}">${EQUIP_SLOT_LABEL[slot]}</span>` +
      `<span data-inv-icon class="${SLOT_ICON_CLASS}"></span>`;
    equipRoot.appendChild(cell);
    equipCells.set(slot, cell);
    bindSlot(cell, { kind: "equip", slot });
  }

  overlay.querySelector("#sb-inv-sort")!.addEventListener("click", () => {
    sortBag(inv);
    paint();
  });
  overlay.querySelector("#sb-inv-stack")!.addEventListener("click", () => {
    consolidateStacks(inv);
    paint();
  });
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    paint();
  });
  searchInput.addEventListener("pointerdown", (e) => e.stopPropagation());
  menu.addEventListener("pointerdown", (e) => e.stopPropagation());

  function bindSlot(el: HTMLElement, loc: InvLoc) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      hideMenu();
      const stack = stackAt(inv, loc);
      if (!stack) return;
      e.preventDefault();
      beginPending(loc, el, e);
    });
    el.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragFrom) return;
      cancelPending();
      const stack = stackAt(inv, loc);
      const item = resolveItem(stack);
      if (!stack || !item) return;
      if (loc.kind === "bag" && item.equipSlot) {
        tryEquip(inv, { kind: "bag", index: loc.index });
        tip.hidden = true;
        stopItemPreview();
        paint();
      }
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragFrom) return;
      cancelPending();
      const stack = stackAt(inv, loc);
      if (!stack) {
        hideMenu();
        return;
      }
      tip.hidden = true;
      stopItemPreview();
      showMenu(loc, e.clientX, e.clientY);
    });
    el.addEventListener("pointerenter", (e) => {
      if (dragFrom || menuLoc || pending) return;
      const stack = stackAt(inv, loc);
      const item = resolveItem(stack);
      if (!item) return;
      showTip(item, stack!.qty, e.clientX, e.clientY);
    });
    el.addEventListener("pointerleave", () => {
      if (!dragFrom && !menuLoc) {
        tip.hidden = true;
        stopItemPreview();
      }
    });
  }

  function beginPending(loc: InvLoc, el: HTMLElement, e: PointerEvent) {
    cancelPending();
    pending = {
      loc,
      el,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    };
    window.addEventListener("pointermove", onPendingMove);
    window.addEventListener("pointerup", onPendingUp);
    window.addEventListener("pointercancel", onPendingUp);
  }

  function cancelPending() {
    if (!pending) return;
    window.removeEventListener("pointermove", onPendingMove);
    window.removeEventListener("pointerup", onPendingUp);
    window.removeEventListener("pointercancel", onPendingUp);
    pending = null;
  }

  function onPendingMove(e: PointerEvent) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    const dx = e.clientX - pending.x;
    const dy = e.clientY - pending.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    const { loc, el } = pending;
    cancelPending();
    startDrag(loc, el, e);
  }

  function onPendingUp(e: PointerEvent) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    cancelPending();
  }

  function startDrag(loc: InvLoc, el: HTMLElement, e: PointerEvent) {
    const stack = stackAt(inv, loc);
    if (!stack) return;
    dragFrom = loc;
    dragPointerId = e.pointerId;
    el.classList.add(DRAGGING_CLASS);
    const icon = el.querySelector("[data-inv-icon]") as HTMLElement | null;
    if (icon) setSlotPreview(icon, null);
    const item = resolveItem(stack);
    ghost.hidden = false;
    ghost.removeAttribute("hidden");
    ghost.className = `${GHOST_BASE_CLASS} ${RARITY_SLOT_CLASSES[item?.rarity ?? "common"]}`;
    ghostQty.textContent = stack.qty > 1 ? String(stack.qty) : "";
    if (item && hasItemPreview(item.id)) paintItemToCanvas(item.id, ghostCanvas);
    else ghostCanvas.getContext("2d")?.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
    moveGhost(e.clientX, e.clientY);
    tip.hidden = true;
    stopItemPreview();
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e: PointerEvent) {
    if (!dragFrom || (dragPointerId != null && e.pointerId !== dragPointerId)) return;
    moveGhost(e.clientX, e.clientY);
  }

  function onDragEnd(e: PointerEvent) {
    if (dragPointerId != null && e.pointerId !== dragPointerId) return;
    const from = dragFrom;
    if (from) {
      const target = slotFromPoint(e.clientX, e.clientY);
      if (target) tryMove(inv, from, target);
    }
    endDrag();
    paint();
  }

  function endDrag() {
    cancelPending();
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragEnd);
    if (dragFrom) elFor(dragFrom)?.classList.remove(DRAGGING_CLASS);
    dragFrom = null;
    dragPointerId = null;
    ghost.hidden = true;
    ghost.setAttribute("hidden", "");
    ghost.className = `${GHOST_BASE_CLASS} ${RARITY_SLOT_CLASSES.none}`;
    ghostQty.textContent = "";
    ghostCanvas.getContext("2d")?.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
  }

  function moveGhost(x: number, y: number) {
    ghost.style.left = `${x + 12}px`;
    ghost.style.top = `${y + 12}px`;
  }

  function hideMenu() {
    menu.hidden = true;
    menu.setAttribute("hidden", "");
    menuLoc = null;
    menu.innerHTML = "";
  }

  function showMenu(loc: InvLoc, x: number, y: number) {
    const stack = stackAt(inv, loc);
    const item = resolveItem(stack);
    if (!stack || !item) {
      hideMenu();
      return;
    }
    menuLoc = loc;
    tip.hidden = true;
    stopItemPreview();
    renderMenuRoot(loc, stack.qty, item, x, y);
  }

  function placeMenu(x: number, y: number) {
    menu.hidden = false;
    menu.removeAttribute("hidden");
    const pad = 8;
    const mw = menu.offsetWidth || 180;
    const mh = menu.offsetHeight || 160;
    menu.style.left = `${Math.min(x, window.innerWidth - mw - pad)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - mh - pad)}px`;
  }

  function renderMenuRoot(loc: InvLoc, qty: number, item: ItemDef, x: number, y: number) {
    menu.innerHTML = "";
    menu.className = MENU_CLASS;

    const addAction = (label: string, enabled: boolean, run: () => void, chevron = false) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = MENU_BUTTON_CLASS;
      btn.innerHTML = chevron
        ? `<span>${label}</span><span class="${MENU_CHEVRON_CLASS}">›</span>`
        : label;
      btn.disabled = !enabled;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!enabled) return;
        run();
      });
      menu.appendChild(btn);
    };

    if (loc.kind === "bag" && item.equipSlot) {
      addAction("Equip", true, () => {
        tryEquip(inv, { kind: "bag", index: loc.index });
        hideMenu();
        paint();
      });
    }
    if (loc.kind === "equip") {
      addAction("Unequip", findEmptyBagSlot(inv) >= 0, () => {
        tryUnequip(inv, { kind: "equip", slot: loc.slot });
        hideMenu();
        paint();
      });
    }
    if (item.stackable && qty > 1) {
      addAction("Split", findEmptyBagSlot(inv) >= 0, () => {
        renderMenuSplit(loc, qty, x, y);
      }, true);
    }
    addAction("Drop", true, () => {
      const taken = takeStack(inv, loc.kind === "bag"
        ? { kind: "bag", index: loc.index }
        : { kind: "equip", slot: loc.slot });
      if (taken) callbacks.onDropItem?.(taken.itemId, taken.qty);
      hideMenu();
      paint();
    });

    placeMenu(x, y);
  }

  function renderMenuSplit(loc: InvLoc, qty: number, x: number, y: number) {
    menu.innerHTML = "";
    menu.className = MENU_CLASS;

    const back = document.createElement("button");
    back.type = "button";
    back.className = MENU_BACK_CLASS;
    back.innerHTML = `<span class="${MENU_CHEVRON_CLASS} mr-0.5">‹</span><span>Split</span>`;
    back.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const stack = stackAt(inv, loc);
      const item = resolveItem(stack);
      if (!stack || !item) {
        hideMenu();
        return;
      }
      renderMenuRoot(loc, stack.qty, item, x, y);
    });
    menu.appendChild(back);

    const body = document.createElement("div");
    body.className = MENU_SPLIT_CLASS;
    const row = document.createElement("div");
    row.className = MENU_SPLIT_ROW_CLASS;
    const keepEl = document.createElement("span");
    keepEl.className = MENU_SPLIT_COUNT_CLASS;
    const range = document.createElement("input");
    range.type = "range";
    range.className = RANGE_CLASS;
    range.min = "1";
    range.max = String(qty - 1);
    range.value = String(Math.max(1, Math.floor(qty / 2)));
    const moveEl = document.createElement("span");
    moveEl.className = MENU_SPLIT_COUNT_CLASS;
    const sync = () => {
      const move = Number(range.value);
      moveEl.textContent = String(move);
      keepEl.textContent = String(qty - move);
    };
    sync();
    range.addEventListener("input", sync);
    range.addEventListener("pointerdown", (e) => e.stopPropagation());
    row.append(keepEl, range, moveEl);

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = MENU_PRIMARY_CLASS;
    ok.textContent = "Confirm";
    ok.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitStack(inv, loc.kind === "bag"
        ? { kind: "bag", index: loc.index }
        : { kind: "equip", slot: loc.slot }, Number(range.value));
      hideMenu();
      paint();
    });

    body.append(row, ok);
    menu.appendChild(body);
    placeMenu(x, y);
  }

  function elFor(loc: InvLoc): HTMLElement | undefined {
    if (loc.kind === "bag") return bagCells.get(loc.index);
    return equipCells.get(loc.slot);
  }

  function slotFromPoint(x: number, y: number): InvLoc | null {
    const prev = ghost.hidden;
    ghost.hidden = true;
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    ghost.hidden = prev;
    const slot = hit?.closest?.("[data-inv-slot]") as HTMLElement | null;
    if (!slot || !overlay.contains(slot)) return null;
    if (slot.dataset.equip) {
      return { kind: "equip", slot: slot.dataset.equip as EquipSlot };
    }
    if (slot.dataset.bag != null) {
      return { kind: "bag", index: Number(slot.dataset.bag) };
    }
    return null;
  }

  function showTip(item: ItemDef, qty: number, x: number, y: number) {
    stopItemPreview();
    tip.hidden = false;
    tip.className = TOOLTIP_CLASS;
    const gear = itemHasGearDetails(item);
    const traitSlots = Math.max(0, item.traitSlots ?? 0);
    const gemSlots = Math.max(0, item.gemSlots ?? 0);
    let body =
      `<div class="${TIP_HERO_CLASS} ${RARITY_TIP_HERO_CLASSES[item.rarity]}">` +
      `<div class="${TIP_ART_CLASS}" id="sb-inv-tip-art"></div>` +
      `<div>` +
      `<div class="${TIP_NAME_CLASS}">${item.name}${qty > 1 ? ` ×${qty}` : ""}</div>` +
      `<div class="${TIP_META_CLASS}">${RARITY_LABEL[item.rarity]} · ${item.typeLabel}</div>` +
      `</div>` +
      `</div>`;
    if (gear && item.gearScore != null) {
      body +=
        `<div class="${TIP_GS_CLASS}">` +
        `<strong class="${TIP_GS_VALUE_CLASS}">${item.gearScore}</strong>` +
        `<span class="${TIP_GS_LABEL_CLASS}">Gear Score</span>` +
        `</div>`;
    }
    body += `<p class="${TIP_DESC_CLASS}">${item.description}</p>`;
    if (traitSlots > 0) {
      body += `<div class="${TIP_STACK_CLASS}">`;
      for (let i = 0; i < traitSlots; i++) {
        body += `<div class="${TIP_EMPTY_SOCKET_CLASS}">Empty trait slot</div>`;
      }
      body += `</div>`;
    }
    if (gemSlots > 0) {
      body += `<div class="${TIP_STACK_CLASS}">`;
      for (let i = 0; i < gemSlots; i++) {
        body += `<div class="${TIP_EMPTY_SOCKET_CLASS}">Empty gem slot</div>`;
      }
      body += `</div>`;
    }
    tip.innerHTML = body;

    const art = tip.querySelector("#sb-inv-tip-art") as HTMLElement | null;
    if (art) mountItemPreview(item.id, art);

    const pad = 16;
    const tw = tip.offsetWidth || 280;
    const th = tip.offsetHeight || 160;
    tip.style.left = `${Math.min(x + pad, window.innerWidth - tw - 10)}px`;
    tip.style.top = `${Math.min(y + pad, window.innerHeight - th - 10)}px`;
  }

  function paintSlot(el: HTMLElement, stack: ItemStack | null, loc: InvLoc) {
    const draggingHere = dragFrom ? sameLoc(dragFrom, loc) : false;
    const visual = draggingHere ? null : stack;
    const item = resolveItem(visual);
    const icon = el.querySelector("[data-inv-icon]") as HTMLElement;
    const qty = el.querySelector("[data-inv-qty]") as HTMLElement | null;
    const rarityClass = RARITY_SLOT_CLASSES[item?.rarity ?? "none"];
    const dragClass = draggingHere ? DRAGGING_CLASS : "";
    el.className = `${SLOT_BASE_CLASS} ${rarityClass} ${dragClass}`.trim();
    if (qty) qty.textContent = visual && visual.qty > 1 ? String(visual.qty) : "";
    setSlotPreview(icon, item?.id ?? null);
  }

  function rebuildBagList() {
    for (const el of bagCells.values()) {
      const icon = el.querySelector("[data-inv-icon]") as HTMLElement | null;
      if (icon) setSlotPreview(icon, null);
    }
    bagRoot.innerHTML = "";
    bagCells.clear();

    const byCat = new Map<ItemCategory, { index: number; stack: ItemStack }[]>();
    for (let i = 0; i < inv.bag.length; i++) {
      const stack = inv.bag[i];
      if (!stack) continue;
      const item = getItemSafe(stack.itemId);
      if (!item) continue;
      if (searchQuery) {
        const hay = `${item.name} ${item.typeLabel} ${CATEGORY_LABEL[item.category]}`.toLowerCase();
        if (!hay.includes(searchQuery)) continue;
      }
      const list = byCat.get(item.category) ?? [];
      list.push({ index: i, stack });
      byCat.set(item.category, list);
    }

    let any = false;
    for (const cat of CATEGORY_ORDER) {
      const entries = byCat.get(cat);
      if (!entries?.length) continue;
      any = true;
      const section = document.createElement("div");
      section.className = CATEGORY_CLASS;
      section.innerHTML = `<div class="${CATEGORY_TITLE_CLASS}">${CATEGORY_LABEL[cat]}</div>`;
      const grid = document.createElement("div");
      grid.className = CATEGORY_GRID_CLASS;
      for (const entry of entries) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `${SLOT_BASE_CLASS} ${RARITY_SLOT_CLASSES.none}`;
        cell.dataset.invSlot = "1";
        cell.dataset.bag = String(entry.index);
        cell.innerHTML = `<span data-inv-icon class="${SLOT_ICON_CLASS}"></span><span data-inv-qty class="${QTY_CLASS}"></span>`;
        grid.appendChild(cell);
        bagCells.set(entry.index, cell);
        bindSlot(cell, { kind: "bag", index: entry.index });
        paintSlot(cell, entry.stack, { kind: "bag", index: entry.index });
      }
      section.appendChild(grid);
      bagRoot.appendChild(section);
    }

    if (!any) {
      const empty = document.createElement("div");
      empty.className = EMPTY_CLASS;
      empty.textContent = searchQuery ? "No matching items" : "No items";
      bagRoot.appendChild(empty);
    }
  }

  function getItemSafe(id: string) {
    return resolveItem({ itemId: id, qty: 1 });
  }

  function paint() {
    ghost.hidden = true;
    ghost.setAttribute("hidden", "");
    ghost.className = `${GHOST_BASE_CLASS} ${RARITY_SLOT_CLASSES.none}`;
    for (const slot of EQUIP_SLOTS) {
      paintSlot(equipCells.get(slot)!, inv.equipment[slot], { kind: "equip", slot });
    }
    rebuildBagList();
  }

  const setOpen = (open: boolean) => {
    if (open === isOpen) return;
    if (open && callbacks.canOpen && !callbacks.canOpen()) return;
    isOpen = open;
    overlay.classList.toggle("hidden", !open);
    overlay.classList.toggle("block", open);
    endDrag();
    hideMenu();
    tip.hidden = true;
    stopItemPreview();
    if (open) paint();
    else {
      clearAllSlotPreviews();
      searchQuery = "";
      searchInput.value = "";
    }
    callbacks.onToggle(open);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Tab") {
      e.preventDefault();
      if (e.repeat) return;
      setOpen(!isOpen);
      return;
    }
    if (e.code === "Escape" && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      if (!menu.hidden) {
        hideMenu();
        return;
      }
      setOpen(false);
    }
  };

  const onDocPointer = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!menu.hidden) {
      if (menu.contains(t)) return;
      hideMenu();
    }
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onDocPointer, false);

  return {
    get open() { return isOpen; },
    setOpen,
    refresh: paint,
    dispose() {
      endDrag();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDocPointer, false);
      stopItemPreview();
      clearAllSlotPreviews();
      menu.remove();
      overlay.remove();
    },
  };
}
