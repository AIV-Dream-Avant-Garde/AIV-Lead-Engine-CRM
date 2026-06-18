/* ── THEME: warm light (default) ↔ branded dark. Persisted to localStorage. ── */

function crmTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// CartoDB basemap that matches the active theme (light = Positron, dark = dark_all).
function mapTileUrl() {
  return crmTheme() === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('aiv-theme', theme); } catch (e) {}
  // Toggle button glyph: show where you'll go (moon in light, sun in dark).
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.textContent = theme === 'dark' ? '☀' : '☾';
    b.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
  // Re-skin any live maps to match.
  try { if (window._dshTiles) _dshTiles.setUrl(mapTileUrl()); } catch (e) {}
  try { if (window._scTiles)  _scTiles.setUrl(mapTileUrl());  } catch (e) {}
  setTimeout(() => {
    try { if (window._dshMap) _dshMap.invalidateSize(); } catch (e) {}
    try { if (window._scMap)  _scMap.invalidateSize();  } catch (e) {}
  }, 80);
}

function toggleTheme() { applyTheme(crmTheme() === 'dark' ? 'light' : 'dark'); }

function initTheme() {
  let t = 'light';
  try { t = localStorage.getItem('aiv-theme') || 'light'; } catch (e) {}
  applyTheme(t);
}
