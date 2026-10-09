import { el, onClickOutside } from '../dom.js';
import { isBigPaste, createPaste } from '../paste.js'; // smart paste

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|ini|xml|html|css|js|mjs|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|ps1|sql|log|env|conf)$/i;

const DOC_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>'; // smart paste
const FOLDER_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

const readAs = (file, how) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  how === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
});

// The message box: Enter to send, Shift+Enter for a new line, Send/Stop button,
// and attachments from the button, paste or drag-and-drop (all the same path).
// Where folders are supported, the attach button opens a menu: Attach files or Connect folder.
export function createComposer({ form, input, send, attach, fileInput, tray, dropZone, overlay, menu, onConnectFolder, onDisconnectFolder, onSend, onStop, notify }) {
  let files = [];
  let folderName = null;
  let folderEditable = false; // write mode
  let busy = false;

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 200)}px`;
  }

  function removeButton(label, onClick) {
    const remove = el('button', 'tray-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', label);
    remove.addEventListener('click', onClick);
    return remove;
  }

  function folderChip() {
    const chip = el('span', 'tray-chip folder');
    chip.title = folderEditable ? 'Connected folder (can edit, with your approval)' : 'Connected folder (read-only)';
    chip.innerHTML = FOLDER_ICON;
    chip.append(el('span', 'tray-name', folderName));
    if (folderEditable) { chip.classList.add('can-edit'); chip.append(el('span', 'folder-mode', 'can edit')); } // write mode
    chip.append(removeButton(`Disconnect folder ${folderName}`, onDisconnectFolder));
    return chip;
  }

  function renderTray() {
    tray.hidden = !files.length && !folderName;
    tray.replaceChildren(...(folderName ? [folderChip()] : []), ...files.map((f, i) => {
      if (f.kind === 'paste') return pasteChip(f, i); // smart paste
      const chip = el('span', 'tray-chip');
      if (f.kind === 'image') {
        const img = el('img');
        img.src = f.dataUrl;
        img.alt = '';
        chip.append(img);
      }
      chip.append(el('span', 'tray-name', f.name), removeButton(`Remove ${f.name}`, () => { files.splice(i, 1); renderTray(); input.focus(); }));
      return chip;
    }));
  }

  // smart paste: a big paste shows as a chip; the model searches and reads it as needed.
  function pasteChip(f, i) {
    const chip = el('span', 'tray-chip paste');
    chip.title = `Pasted text, ${f.lines.toLocaleString('en-US')} lines. Kept in this tab only; the model searches and reads it as needed.`;
    chip.innerHTML = DOC_ICON;
    chip.append(el('span', 'tray-name', f.name), removeButton(`Remove pasted text (${f.name})`, () => { files.splice(i, 1); renderTray(); input.focus(); }));
    return chip;
  }

  async function add(list) {
    for (const file of list) {
      try {
        if (file.type.startsWith('image/')) {
          if (file.size > MAX_IMAGE) { notify(`${file.name} is larger than 10 MB.`); continue; }
          files.push({ kind: 'image', name: file.name || 'pasted-image.png', dataUrl: await readAs(file, 'url') });
        } else if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
          if (file.size > MAX_TEXT) { notify(`${file.name} is larger than 512 KB.`); continue; }
          files.push({ kind: 'text', name: file.name, text: await readAs(file, 'text') });
        } else {
          notify(`${file.name} can't be attached: only images and text files are supported.`);
        }
      } catch {
        notify(`Couldn't read ${file.name}.`);
      }
    }
    renderTray();
  }

  function submit() {
    if (busy) return onStop();
    const text = input.value.trim();
    if (!text && !files.length) return;
    if (onSend({ text, files }) === false) return;
    input.value = '';
    files = [];
    renderTray();
    autosize();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  input.addEventListener('paste', (e) => {
    const pasted = [...(e.clipboardData?.files ?? [])];
    if (!pasted.length) {
      // smart paste
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!isBigPaste(text)) return;
      e.preventDefault();
      try { files.push(createPaste(text)); } catch (err) { notify(err.message); }
      renderTray();
      return;
    }
    if (!e.clipboardData.types.includes('text/plain')) e.preventDefault();
    add(pasted);
  });
  attach.addEventListener('click', () => {
    if (!onConnectFolder) return fileInput.click();
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  fileInput.addEventListener('change', () => { add([...fileInput.files]); fileInput.value = ''; });

  let stopOutside = null;
  function openMenu() {
    const r = attach.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.bottom = `${attach.ownerDocument.defaultView.innerHeight - r.top + 6}px`;
    menu.hidden = false;
    attach.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
    stopOutside = onClickOutside([menu, attach], closeMenu);
  }
  function closeMenu() {
    menu.hidden = true;
    attach.setAttribute('aria-expanded', 'false');
    stopOutside?.();
    stopOutside = null;
  }
  if (onConnectFolder) {
    attach.setAttribute('aria-haspopup', 'menu');
    attach.setAttribute('aria-expanded', 'false');
    attach.setAttribute('aria-label', 'Attach files or connect a folder');
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-action]');
      if (!item) return;
      closeMenu();
      if (item.dataset.action === 'files') fileInput.click();
      else onConnectFolder(item.dataset.action === 'folder-edit');
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMenu(); attach.focus(); }
    });
    window.addEventListener('resize', closeMenu);
  }

  const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
  let depth = 0;
  dropZone.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; overlay.hidden = false; } });
  dropZone.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.hidden = true; } });
  dropZone.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  dropZone.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    add([...e.dataTransfer.files]);
    input.focus();
  });

  return {
    setBusy(value) {
      busy = value;
      send.classList.toggle('stop', busy);
      send.setAttribute('aria-label', busy ? 'Stop' : 'Send');
    },
    focus: () => input.focus(),
    setFolder(name, editable = false) {
      folderName = name || null;
      folderEditable = Boolean(name && editable);
      renderTray();
    },
  };
}
