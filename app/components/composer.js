import { el, onClickOutside } from '../dom.js';
import { isBigPaste, createPaste } from '../paste.js'; // smart paste

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|ini|xml|html|css|js|mjs|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|ps1|sql|log|env|conf)$/i;

const DOC_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>'; // smart paste
const GITLAB_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21l-9-7 3-10 3 7h6l3-7 3 10z"/></svg>'; // gitlab
const FOLDER_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const BRANCH_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-6 4-11.2 8.2"/></svg>'; // git

const readAs = (file, how) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  how === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
});

// The message box: Enter to send, Shift+Enter for a new line, Send/Stop button,
// and attachments from the button, paste or drag-and-drop (all the same path).
// Where folders are supported, the attach button opens a menu: Attach files or Connect folder.
export function createComposer({ form, input, send, attach, fileInput, tray, dropZone, overlay, menu, onConnectFolder, onDisconnectFolder, onConnectGitlab, onDisconnectGitlab, onSend, onStop, onReplyNote = () => false, notify }) {
  let files = [];
  let folderName = null;
  let folderEditable = false; // write mode
  let folderGit = null; // git: { branch, ahead, behind }
  let gitlabProject = null; // gitlab: { path, ref }
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
    chip.innerHTML = folderGit ? BRANCH_ICON : FOLDER_ICON; // git
    chip.append(el('span', 'tray-name', folderName));
    if (folderGit) gitParts(chip); // git
    if (folderEditable) { chip.classList.add('can-edit'); chip.append(el('span', 'folder-mode', 'can edit')); } // write mode
    chip.append(removeButton(`Disconnect folder ${folderName}`, onDisconnectFolder));
    return chip;
  }

  function renderTray() {
    tray.hidden = !files.length && !folderName && !gitlabProject;
    tray.replaceChildren(...(folderName ? [folderChip()] : []), ...(gitlabProject ? [gitlabChip()] : []), ...files.map((f, i) => { // gitlab
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

  // git: "slop · main ⇡2⇣1": the branch, and commits to push and to pull (as of the last fetch).
  function gitParts(chip) {
    const { branch, ahead, behind } = folderGit;
    chip.classList.add('git');
    chip.append(el('span', 'git-sep', '·'), el('span', 'git-branch', branch));
    const sync = `${ahead ? `⇡${ahead}` : ''}${behind ? `⇣${behind}` : ''}`;
    if (sync) chip.append(el('span', 'git-sync', sync));
    const counts = [ahead && `${ahead} to push`, behind && `${behind} to pull`].filter(Boolean).join(', ');
    chip.title += `\nGit branch ${branch}${counts ? `: ${counts} (as of your last fetch)` : ''}`;
  }

  // gitlab: "team/app · main", the GitLab project connected to this chat.
  function gitlabChip() {
    const chip = el('span', 'tray-chip gitlab');
    chip.title = `GitLab project ${gitlabProject.path} on ${gitlabProject.ref} (read-only)`;
    chip.innerHTML = GITLAB_ICON;
    chip.append(el('span', 'tray-name', gitlabProject.path), el('span', 'git-sep', '·'), el('span', 'git-branch', gitlabProject.ref), removeButton(`Disconnect GitLab project ${gitlabProject.path}`, onDisconnectGitlab));
    return chip;
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
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    // write mode: while a reply waits for you, Enter sends what you typed to it instead of stopping it.
    if (busy && input.value.trim()) {
      if (onReplyNote(input.value.trim())) { input.value = ''; autosize(); }
      return;
    }
    submit();
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
  // The menu opens when it has more than "Attach files" to offer (folders, GitLab); otherwise the button picks files.
  if (!onConnectFolder) for (const item of menu.querySelectorAll('[data-action^="folder"]')) item.hidden = true;
  const hasMenu = () => [...menu.querySelectorAll('button[data-action]')].some((b) => b.dataset.action !== 'files' && !b.hidden);
  attach.addEventListener('click', () => {
    if (!hasMenu()) return fileInput.click();
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
  // The button's label says what it does now: open the menu, or just pick files.
  const labelAttach = () => {
    if (hasMenu()) {
      attach.setAttribute('aria-haspopup', 'menu');
      attach.setAttribute('aria-expanded', String(!menu.hidden));
      attach.setAttribute('aria-label', onConnectFolder ? 'Attach files or connect a folder' : 'Attach files or connect a GitLab project');
    } else {
      attach.removeAttribute('aria-haspopup');
      attach.removeAttribute('aria-expanded');
      attach.setAttribute('aria-label', 'Attach images or text files');
    }
  };
  labelAttach();
  {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('button[data-action]');
      if (!item) return;
      closeMenu();
      if (item.dataset.action === 'files') fileInput.click();
      else if (item.dataset.action === 'gitlab') onConnectGitlab?.(); // gitlab
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
    setGitlab(project) { gitlabProject = project || null; renderTray(); labelAttach(); }, // gitlab
    setFolder(name, editable = false, git = null) {
      folderName = name || null;
      folderEditable = Boolean(name && editable);
      folderGit = name ? git : null; // git
      renderTray();
    },
  };
}
