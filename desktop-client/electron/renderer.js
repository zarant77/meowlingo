const form = document.getElementById('settings');
const result = document.getElementById('result');
async function loadSettings() {
  try { const values = await window.meowlingo.settings(); for (const [key, value] of Object.entries(values)) form.elements.namedItem(key).value = value; }
  catch (error) { result.textContent = error.message; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
  try { await window.meowlingo.save(Object.fromEntries(new FormData(form))); result.textContent = 'Settings saved. Client restarted.'; }
  catch (error) { result.textContent = error.message; } finally { button.disabled = false; }
});
document.getElementById('open-config').onclick = () => window.meowlingo.openConfig();
document.getElementById('accessibility-settings').onclick = async () => {
  try { await window.meowlingo.accessibilitySettings(); }
  catch (error) { result.textContent = error.message; }
};
async function refresh() {
  try { const data = await window.meowlingo.snapshot(); document.getElementById('status').textContent = `${data.running ? 'Running' : 'Stopped'} · ${data.clients} connected phone(s)`;
    document.getElementById('accessibility-warning').hidden = !data.requiresAccessibility || data.accessibilityTrusted;
    document.getElementById('permission-details').textContent = data.permissionMessage || '';
    const logs = document.getElementById('logs'); const bottom = logs.scrollHeight - logs.scrollTop - logs.clientHeight < 30;
    logs.textContent = data.logs.join('\n'); if (bottom) logs.scrollTop = logs.scrollHeight;
  } catch (error) { document.getElementById('status').textContent = error.message; }
}
loadSettings(); refresh(); setInterval(refresh, 1000);

document.getElementById('clear-translation-cache').onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { await window.meowlingo.clearTranslationCache(); result.textContent = 'Server translation and explanation cache cleared.'; }
  catch (error) { result.textContent = error.message; }
  finally { button.disabled = false; }
};
