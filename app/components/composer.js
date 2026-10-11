import { el, onClickOutside, onWidthChange } from '../dom.js';
import { isBigPaste, createPaste } from '../paste.js'; // smart paste

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|ini|xml|html|css|js|mjs|ts|jsx|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|ps1|sql|log|env|conf)$/i;

const DOC_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>'; // smart paste
const GITLAB_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21l-9-7 3-10 3 7h6l3-7 3 10z"/></svg>'; // gitlab
const FOLDER_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const PEEK_ICON = '<svg class="icon peek" viewBox="0 0 24 24" aria-hidden="true"><g class="peek-eyes"><ellipse cx="9.8" cy="7" rx="1.5" ry="1.85"/><ellipse cx="14.2" cy="7" rx="1.5" ry="1.85"/></g><path d="M5 9h14v11H5z"/><path class="peek-lid" d="M4 6h16v3H4z"/><path d="M10 13h4"/></svg>'; // sandbox
const BRANCH_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-6 4-11.2 8.2"/></svg>'; // git

const readAs = (file, how) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  how === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
});

// The message box: Enter to send, Shift+Enter for a new line, Send/Stop button,
// and attachments from the button, paste or drag-and-drop (all the same path).
// The + button opens a menu (Attach files, Connect folder, …) when it has more than files to offer.
export function createComposer({ form, input, send, attach, fileInput, tray, dropZone, overlay, menu, onConnectFolder, onDisconnectFolder, onConnectGitlab, onDisconnectGitlab, onPickGitlabBranch, onToggleSandbox, onSend, onStop, notify }) {
  let files = [];
  let folderName = null;
  let folderGit = null; // git: { branch, ahead, behind }
  let gitlabProject = null; // gitlab: { path, ref }
  let sandbox = null; // sandbox: null (off), 'on' or 'running'
  let busy = false;

  // The box is as tall as its text (up to 200px), plus its own border, whatever the theme sets.
  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + input.offsetHeight - input.clientHeight, 200)}px`;
  }
  input.ownerDocument.fonts?.ready.then(autosize); // a font that loads late changes the line height

  function removeButton(label, onClick) {
    const remove = el('button', 'tray-remove', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', label);
    remove.addEventListener('click', onClick);
    return remove;
  }

  function folderChip() {
    const chip = el('span', 'tray-chip folder');
    chip.title = 'Connected folder (read-only)';
    chip.innerHTML = folderGit ? BRANCH_ICON : FOLDER_ICON; // git
    chip.append(el('span', 'tray-name', folderName));
    if (folderGit) gitParts(chip); // git
    chip.append(removeButton(`Disconnect folder ${folderName}`, onDisconnectFolder));
    return chip;
  }

  function renderTray() {
    tray.hidden = !files.length && !folderName && !gitlabProject && !sandbox;
    tray.replaceChildren(...(folderName ? [folderChip()] : []), ...(gitlabProject ? [gitlabChip()] : []), ...(sandbox ? [sandboxChip()] : []), ...files.map((f, i) => { // gitlab, sandbox
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
    const branch = el('button', 'gitlab-branch');
    branch.type = 'button';
    branch.append(el('span', 'git-branch', gitlabProject.ref), el('span', 'gitlab-caret', '▾'));
    branch.setAttribute('aria-label', `Branch ${gitlabProject.ref}, pick another`);
    branch.addEventListener('click', () => onPickGitlabBranch?.(chip));
    chip.append(el('span', 'tray-name', gitlabProject.path), el('span', 'git-sep', '·'), branch, removeButton(`Disconnect GitLab project ${gitlabProject.path}`, onDisconnectGitlab));
    return chip;
  }

  // sandbox: "Sandbox", on for this chat. Its box peeks out while code runs.
  function sandboxChip() {
    const chip = el('span', `tray-chip sandbox${sandbox === 'running' ? ' running' : ''}`);
    chip.title = sandbox === 'running' ? 'Sandbox: running code' : 'Sandbox: the model can run JavaScript here, with no network, page or storage';
    chip.innerHTML = PEEK_ICON;
    chip.append(el('span', 'tray-name', 'Sandbox'), removeButton('Turn off the sandbox', () => { onToggleSandbox(); input.focus(); }));
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
      attach.setAttribute('aria-label', 'Attach files and more');
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
      if (item.dataset.action === 'sandbox') return onToggleSandbox?.(); // sandbox: a switch, so the menu stays open and shows it change
      closeMenu();
      if (item.dataset.action === 'files') fileInput.click();
      else if (item.dataset.action === 'gitlab') onConnectGitlab?.(); // gitlab
      else onConnectFolder();
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMenu(); attach.focus(); }
    });
    onWidthChange(closeMenu);
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
    text: () => input.value,
    setText(text) { input.value = text; autosize(); },
    fit: autosize, // after a theme change
    setGitlab(project) { gitlabProject = project || null; renderTray(); labelAttach(); }, // gitlab
    setSandbox(value) { // sandbox
      if (value === sandbox) return;
      sandbox = value || null;
      menu.querySelector('[data-action="sandbox"]')?.setAttribute('aria-checked', String(Boolean(sandbox)));
      renderTray();
    },
    setFolder(name, git = null) {
      folderName = name || null;
      folderGit = name ? git : null; // git
      renderTray();
    },
  };
}
