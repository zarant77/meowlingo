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
async function refresh() {
  try { const data = await window.meowlingo.snapshot(); document.getElementById('status').textContent = `${data.running ? 'Running' : 'Stopped'} · ${data.clients} connected phone(s)`;
    const logs = document.getElementById('logs'); const bottom = logs.scrollHeight - logs.scrollTop - logs.clientHeight < 30;
    logs.textContent = data.logs.join('\n'); if (bottom) logs.scrollTop = logs.scrollHeight;
  } catch (error) { document.getElementById('status').textContent = error.message; }
}
loadSettings(); refresh(); setInterval(refresh, 1000);
