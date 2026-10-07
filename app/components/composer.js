import { el } from '../dom.js';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|ini|xml|html|css|js|mjs|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|ps1|sql|log|env|conf)$/i;

const readAs = (file, how) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  how === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
});

// The message box: Enter to send, Shift+Enter for a new line, Send/Stop button,
// and attachments from the button, paste or drag-and-drop (all the same path).
export function createComposer({ form, input, send, attach, fileInput, tray, dropZone, overlay, onSend, onStop, notify }) {
  let files = [];
  let busy = false;

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 140)}px`;
  }

  function renderTray() {
    tray.hidden = !files.length;
    tray.replaceChildren(...files.map((f, i) => {
      const chip = el('span', 'tray-chip');
      if (f.kind === 'image') {
        const img = el('img');
        img.src = f.dataUrl;
        img.alt = '';
        chip.append(img);
      }
      chip.append(el('span', 'tray-name', f.name));
      const remove = el('button', 'tray-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${f.name}`);
      remove.addEventListener('click', () => { files.splice(i, 1); renderTray(); input.focus(); });
      chip.append(remove);
      return chip;
    }));
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
    if (!pasted.length) return;
    if (!e.clipboardData.types.includes('text/plain')) e.preventDefault();
    add(pasted);
  });
  attach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { add([...fileInput.files]); fileInput.value = ''; });

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
  };
}
