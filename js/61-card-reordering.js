// ============================================
// Drag & drop dos itens da fatura
// ============================================

const CARD_DRAG_THRESHOLD = 4;   // px antes de considerar arraste (evita roubar cliques)
const CARD_DRAG_EDGE = 72;       // zona de autoscroll perto das bordas da viewport
const CARD_DRAG_SPEED = 16;      // px por frame no autoscroll

const cardDrag = {
  pointerId: null,
  handle: null,
  row: null,
  list: null,
  placeholder: null,
  entryId: null,
  itemId: null,
  startY: 0,
  lastY: 0,
  grabOffset: 0,
  borderTop: 0,
  rowHeight: 0,
  startIds: [],
  started: false,
  raf: 0
};

// Linhas que participam da ordenação: ignora o vazio e a linha flutuante
// (o placeholder carrega o data-item-id do item arrastado, ocupando o lugar dele).
const cardDragRowsOf = (list) => [...list.children].filter((li) =>
  li.classList.contains('card-item')
  && !li.classList.contains('card-item--empty')
  && !li.classList.contains('card-item--dragging'));

const cardDragIdsOf = (list) => cardDragRowsOf(list).map((li) => li.dataset.itemId);

const resetCardDrag = () => {
  cardDrag.pointerId = null;
  cardDrag.handle = null;
  cardDrag.row = null;
  cardDrag.list = null;
  cardDrag.placeholder = null;
  cardDrag.entryId = null;
  cardDrag.itemId = null;
  cardDrag.startIds = [];
  cardDrag.started = false;
  cardDrag.raf = 0;
};

const activateCardDrag = () => {
  const { row, list } = cardDrag;
  const rect = row.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const style = getComputedStyle(list);

  // A linha flutuante é absoluta dentro da lista (top/left contam da borda interna),
  // então guardamos a borda para casar com a posição original.
  cardDrag.borderTop = parseFloat(style.borderTopWidth) || 0;
  cardDrag.rowHeight = rect.height;
  cardDrag.startIds = cardDragIdsOf(list);
  cardDrag.grabOffset = cardDrag.startY - rect.top;

  const placeholder = document.createElement('li');
  placeholder.className = 'card-item card-item--placeholder';
  placeholder.dataset.itemId = cardDrag.itemId;
  placeholder.style.height = `${rect.height}px`;
  list.insertBefore(placeholder, row);
  cardDrag.placeholder = placeholder;

  row.classList.add('card-item--dragging');
  row.style.width = `${rect.width}px`;
  row.style.height = `${rect.height}px`;
  row.style.left = `${rect.left - listRect.left - (parseFloat(style.borderLeftWidth) || 0)}px`;

  document.body.classList.add('is-dragging-card-item');
  cardDrag.started = true;
  cardDrag.raf = requestAnimationFrame(cardDragAutoScroll);
  moveCardDrag(cardDrag.startY);
};

const moveCardDrag = (clientY) => {
  const { row, list, placeholder } = cardDrag;
  const listRect = list.getBoundingClientRect();
  const rawTop = clientY - cardDrag.grabOffset - listRect.top - cardDrag.borderTop;
  const maxTop = Math.max(list.clientHeight - cardDrag.rowHeight, 0);

  // O visual fica preso dentro da lista...
  row.style.top = `${Math.min(Math.max(rawTop, 0), maxTop)}px`;

  // ...mas o alvo usa o centro sem limite: preso, o centro empataria exatamente com o
  // meio da primeira/última linha e as pontas ficariam inalcançáveis.
  const center = clientY - cardDrag.grabOffset + cardDrag.rowHeight / 2;
  const targets = cardDragRowsOf(list).filter((li) => li !== placeholder);
  const ref = targets.find((li) => {
    const r = li.getBoundingClientRect();
    return center < r.top + r.height / 2;
  }) ?? null;

  if (placeholder.nextElementSibling !== ref) list.insertBefore(placeholder, ref);
};

const cardDragAutoScroll = () => {
  if (!cardDrag.started) return;

  const y = cardDrag.lastY;
  const bottomGap = window.innerHeight - y;
  let dy = 0;
  if (y < CARD_DRAG_EDGE) dy = -CARD_DRAG_SPEED * (1 - Math.max(y, 0) / CARD_DRAG_EDGE);
  else if (bottomGap < CARD_DRAG_EDGE) dy = CARD_DRAG_SPEED * (1 - Math.max(bottomGap, 0) / CARD_DRAG_EDGE);

  if (dy) {
    const before = window.scrollY;
    window.scrollBy(0, dy);
    if (window.scrollY !== before) moveCardDrag(y);
  }

  cardDrag.raf = requestAnimationFrame(cardDragAutoScroll);
};

const finishCardDrag = (commit) => {
  if (cardDrag.raf) cancelAnimationFrame(cardDrag.raf);

  const { row, list, placeholder, entryId, itemId, startIds, started, handle, pointerId } = cardDrag;
  try { handle?.releasePointerCapture?.(pointerId); } catch { /* já liberado */ }

  if (!started) { resetCardDrag(); return; }

  const ids = cardDragIdsOf(list);
  const alive = list.isConnected; // uma re-renderização no meio do arraste invalida a ordem
  placeholder.remove();
  row.classList.remove('card-item--dragging');
  row.removeAttribute('style');
  document.body.classList.remove('is-dragging-card-item');
  resetCardDrag();

  // Cancelado: o item nunca saiu do lugar no DOM, só o placeholder se movia
  if (!commit || !alive || ids.join('|') === startIds.join('|')) return;

  pendingCardItemFocusId = itemId;
  if (!reorderCardItems(entryId, ids)) pendingCardItemFocusId = null;
};

const handleCardItemPointerDown = (e) => {
  if (cardDrag.pointerId !== null) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const handle = e.target.closest('[data-card-drag]');
  if (!handle) return;

  const row = handle.closest('.card-item');
  const list = row?.parentElement;
  const panel = row?.closest('.card-items-panel');
  if (!row || !list?.classList.contains('card-items-list') || !panel) return;
  if (cardDragRowsOf(list).length < 2) return;

  e.preventDefault();
  cardDrag.pointerId = e.pointerId;
  cardDrag.handle = handle;
  cardDrag.row = row;
  cardDrag.list = list;
  cardDrag.entryId = panel.dataset.cardId;
  cardDrag.itemId = row.dataset.itemId;
  cardDrag.startY = e.clientY;
  cardDrag.lastY = e.clientY;
  cardDrag.started = false;
  handle.focus({ preventScroll: true }); // habilita ↑ ↓ logo após clicar no handle
  try { handle.setPointerCapture?.(e.pointerId); } catch { /* sem captura: cai nos listeners do document */ }
};

const handleCardItemPointerMove = (e) => {
  if (cardDrag.pointerId === null || e.pointerId !== cardDrag.pointerId) return;

  cardDrag.lastY = e.clientY;

  if (!cardDrag.started) {
    if (Math.abs(e.clientY - cardDrag.startY) < CARD_DRAG_THRESHOLD) return;
    activateCardDrag();
  }

  e.preventDefault();
  moveCardDrag(e.clientY);
};

const handleCardItemPointerUp = (e) => {
  if (cardDrag.pointerId === null || e.pointerId !== cardDrag.pointerId) return;
  finishCardDrag(e.type === 'pointerup');
};

const bindCardDragEvents = () => {
  document.addEventListener('pointermove', handleCardItemPointerMove, { passive: false });
  document.addEventListener('pointerup', handleCardItemPointerUp);
  document.addEventListener('pointercancel', handleCardItemPointerUp);
  window.addEventListener('blur', () => { if (cardDrag.pointerId !== null) finishCardDrag(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardDrag.pointerId !== null) finishCardDrag(false);
  });
};

const focusCardItemHandle = (itemId) => {
  const handles = [...document.querySelectorAll(`.card-item[data-item-id="${itemId}"] [data-card-drag]`)];
  (handles.find((el) => el.offsetParent !== null) ?? handles[0])?.focus();
};
