export const $ = (id) => document.getElementById(id);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Calls `fn` when the window gets wider or narrower. A phone's keyboard only changes the height, so a
// popup that closes on this stays open while you type in it.
export function onWidthChange(fn, view = window) {
  let width = view.innerWidth;
  view.addEventListener('resize', () => {
    if (view.innerWidth === width) return;
    width = view.innerWidth;
    fn();
  });
}

// Closes a popup when you click outside it (`inside` is an element or a list, e.g. the popup and
// its button). It listens in whichever window those are in when the popup opens, so it keeps
// working when the chat is moved into the mini window. Returns a function that stops listening.
export function onClickOutside(inside, close) {
  const nodes = [].concat(inside);
  const doc = nodes[0].ownerDocument;
  const down = (e) => { if (!nodes.some((n) => n.contains(e.target))) close(); };
  doc.addEventListener('pointerdown', down);
  return () => doc.removeEventListener('pointerdown', down);
}
