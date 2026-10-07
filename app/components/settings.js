import { $ } from '../dom.js';
import { createPicker } from './picker.js';
import { listThemes, applyTheme, warmFonts } from '../theme.js';

// The settings dialog: connection, system prompt, theme, and local data.
export function createSettings({ getSettings, onSave, onTest, onForgetKey, onDeleteAll, onExport, onImport }) {
  const dialog = $('settings');
  const fields = { baseUrl: $('set-base-url'), apiKey: $('set-api-key'), systemPrompt: $('set-system') };
  const status = $('settings-status');

  const showStats = $('set-stats');
  showStats.addEventListener('change', () => onSave({ showStats: showStats.checked }, { quiet: true }));

  const themes = createPicker($('theme-picker'), {
    label: 'Theme',
    onOpen: warmFonts,
    onSelect: (id) => { applyTheme(id); onSave({ theme: id }, { quiet: true }); },
  });

  const read = () => ({
    baseUrl: fields.baseUrl.value.trim(),
    apiKey: fields.apiKey.value.trim(),
    systemPrompt: fields.systemPrompt.value,
  });

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = `settings-status ${kind}`;
  }

  async function run(fn) {
    try { setStatus(...(await fn())); } catch (e) { setStatus(e.message, 'bad'); }
  }

  $('save-settings').addEventListener('click', () => run(() => onSave(read())));
  $('test-conn').addEventListener('click', () => run(() => onTest(read())));
  $('forget-key').addEventListener('click', () => { fields.apiKey.value = ''; run(onForgetKey); });
  $('delete-all').addEventListener('click', () => run(onDeleteAll));
  $('export-btn').addEventListener('click', () => run(onExport));
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) run(() => onImport(file));
  });
  $('close-settings').addEventListener('click', () => dialog.close());
  // Clicking the dimmed backdrop (outside the dialog box) closes it.
  dialog.addEventListener('click', (e) => {
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target === dialog && outside) dialog.close();
  });

  return {
    open(message = '') {
      const s = getSettings();
      for (const [key, input] of Object.entries(fields)) input.value = s[key];
      themes.set(listThemes(), s.theme);
      showStats.checked = s.showStats;
      setStatus(message);
      if (!dialog.open) dialog.showModal();
    },
  };
}
