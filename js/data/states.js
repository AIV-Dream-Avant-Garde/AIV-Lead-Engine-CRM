/* ── DATA: US state bounding boxes + grid-tiling helpers ──────
   A "state campaign" blankets a whole state in overlapping Places search
   circles (tiles), so coverage is complete regardless of which cities we have
   in locations.js. The same tile math runs here (frontend: preview + tile
   count) and in Code.gs (backend: the actual per-tile search).               */

const STATE_BOUNDS = {
 'United States': {
  'Florida':        {minLat:24.40, maxLat:31.00, minLng:-87.63, maxLng:-79.97},
  'Georgia':        {minLat:30.36, maxLat:35.00, minLng:-85.61, maxLng:-80.84},
  'Texas':          {minLat:25.84, maxLat:36.50, minLng:-106.65, maxLng:-93.51},
  'California':     {minLat:32.53, maxLat:42.01, minLng:-124.41, maxLng:-114.13},
  'New York':       {minLat:40.50, maxLat:45.01, minLng:-79.76, maxLng:-71.86},
  'Illinois':       {minLat:36.97, maxLat:42.51, minLng:-91.51, maxLng:-87.02},
  'Arizona':        {minLat:31.33, maxLat:37.00, minLng:-114.82, maxLng:-109.05},
  'North Carolina': {minLat:33.84, maxLat:36.59, minLng:-84.32, maxLng:-75.46},
  'Tennessee':      {minLat:34.98, maxLat:36.68, minLng:-90.31, maxLng:-81.65},
  'Ohio':           {minLat:38.40, maxLat:41.98, minLng:-84.82, maxLng:-80.52},
  'Pennsylvania':   {minLat:39.72, maxLat:42.27, minLng:-80.52, maxLng:-74.69},
  'New Jersey':     {minLat:38.93, maxLat:41.36, minLng:-75.56, maxLng:-73.89},
  'Colorado':       {minLat:36.99, maxLat:41.00, minLng:-109.06, maxLng:-102.04},
  'Washington':     {minLat:45.54, maxLat:49.00, minLng:-124.85, maxLng:-116.92},
 },
};

// Grid dimensions for a bounding box at a given tile radius (meters). Centers are
// spaced at ~1.3× the radius so the circles overlap and fully cover the box.
function campaignGrid(bounds, radiusM) {
  const midLat  = (bounds.minLat + bounds.maxLat) / 2;
  const spacing = Math.max(1, radiusM) * 1.3;
  const mPerLat = 111320, mPerLng = 111320 * Math.cos(midLat * Math.PI / 180);
  const rows = Math.max(1, Math.ceil((bounds.maxLat - bounds.minLat) * mPerLat / spacing));
  const cols = Math.max(1, Math.ceil((bounds.maxLng - bounds.minLng) * mPerLng / spacing));
  return { rows, cols, count: rows * cols };
}

// Center lat/lng of tile `idx` (row-major) within the grid.
function campaignTile(bounds, rows, cols, idx) {
  const row  = Math.floor(idx / cols), col = idx % cols;
  const dLat = (bounds.maxLat - bounds.minLat) / rows;
  const dLng = (bounds.maxLng - bounds.minLng) / cols;
  return {
    lat: +(bounds.minLat + (row + 0.5) * dLat).toFixed(6),
    lng: +(bounds.minLng + (col + 0.5) * dLng).toFixed(6),
  };
}
