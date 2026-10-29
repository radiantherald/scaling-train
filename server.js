const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Supabase environment variables (or Upstash fallback)
const SUPABASE_URL = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.replace(/\/+$/, '') : null;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || null;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const DEFAULT_PEOPLE = [
  { id: 1, name: "Thirumalai Kailsam", topic: "Mid-Year Review" },
  { id: 2, name: "Praveen Kumar", topic: "Mid-Year Review" },
  { id: 3, name: "Arpit Ayushman", topic: "Mid-Year Review" },
  { id: 4, name: "Sujit Maity", topic: "Mid-Year Review" },
  { id: 5, name: "Harish", topic: "Mid-Year Review" },
  { id: 6, name: "Harisankar V S", topic: "Mid-Year Review" },
  { id: 7, name: "Mira Haribabu", topic: "Mid-Year Review" },
  { id: 8, name: "Rishav Kumar", topic: "Mid-Year Review" },
  { id: 9, name: "Dhrubit Hajong", topic: "Mid-Year Review" },
  { id: 10, name: "Chaitraja Dase", topic: "Mid-Year Review" },
  { id: 11, name: "Minal Thombare", topic: "Mid-Year Review" },
  { id: 12, name: "Sri Balaji", topic: "Mid-Year Review" },
  { id: 13, name: "Kamalesh", topic: "Mid-Year Review" }
];

let memoryStore = {
  adminPassword: null,
  people: DEFAULT_PEOPLE,
  submissions: []
};

// Generic HTTPS request helper (Zero npm dependency)
function makeHttpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err }));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// ---------------- Supabase Integration ----------------
// Loads data from the `app_state` table in Supabase
async function loadFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/app_state?id=eq.1&select=data`);
    const res = await makeHttpsRequest({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (res && res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      return res.data[0].data;
    }
  } catch (err) {
    console.error('Error reading from Supabase:', err.message);
  }
  return null;
}

// Saves data into the `app_state` table in Supabase (upsert)
async function saveToSupabase(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/app_state`);
    const payload = JSON.stringify({ id: 1, data: data });

    await makeHttpsRequest({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, payload);
  } catch (err) {
    console.error('Error saving to Supabase:', err.message);
  }
}

// ---------------- Upstash Fallback ----------------
async function callUpstash(command, args = []) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const url = new URL(UPSTASH_URL);
    const postData = JSON.stringify([command, ...args]);
    const res = await makeHttpsRequest({
      hostname: url.hostname,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, postData);
    return res && res.data ? res.data.result : null;
  } catch (e) {
    return null;
  }
}

// ---------------- Unified Store Loader ----------------
async function loadStore() {
  // 1. Try Supabase first if configured
  if (SUPABASE_URL && SUPABASE_KEY) {
    const remote = await loadFromSupabase();
    if (remote) {
      memoryStore = remote;
      return memoryStore;
    }
  }

  // 2. Try Upstash if configured
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const remote = await callUpstash('GET', ['midyear_review_store']);
    if (remote) {
      memoryStore = typeof remote === 'string' ? JSON.parse(remote) : remote;
      return memoryStore;
    }
  }

  // 3. Fallback to local disk
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      memoryStore = JSON.parse(raw);
    } catch (e) {
      memoryStore = { adminPassword: null, people: DEFAULT_PEOPLE, submissions: [] };
    }
  } else {
    memoryStore = { adminPassword: null, people: DEFAULT_PEOPLE, submissions: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(memoryStore, null, 2), 'utf-8');
  }

  return memoryStore;
}

async function saveStore(data) {
  memoryStore = data;

  // 1. Write to local disk
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Local disk write error', e);
  }

  // 2. Sync to Supabase if configured
  if (SUPABASE_URL && SUPABASE_KEY) {
    await saveToSupabase(data);
  }

  // 3. Sync to Upstash if configured
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      await callUpstash('SET', ['midyear_review_store', JSON.stringify(data)]);
    } catch (e) {
      console.error('Upstash sync error', e);
    }
  }
}

// Initial load
loadStore().then(async (store) => {
  // If the stored password was the legacy test value "h", purge it automatically
  if (store && store.adminPassword === 'h') {
    console.log('[Setup] Purging legacy test password "h" from store...');
    store.adminPassword = null;
    await saveStore(store);
    console.log('[Setup] Admin password reset to null. Setup unlocked.');
  }
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function serveStatic(req, res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // General server info
  if (pathname === '/api/info' && req.method === 'GET') {
    const ip = getLocalIp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      port: PORT,
      localIp: ip,
      votingUrl: `http://${ip}:${PORT}/`,
      adminUrl: `http://${ip}:${PORT}/admin`,
      storageProvider: SUPABASE_URL ? 'Supabase' : (UPSTASH_URL ? 'Upstash' : 'Local Disk')
    }));
    return;
  }

  // People list for evaluation form
  if (pathname === '/api/people' && req.method === 'GET') {
    await loadStore();
    const publicList = memoryStore.people.map(p => ({
      id: p.id,
      name: p.name,
      topic: p.topic
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicList));
    return;
  }

  // Submit mid-year review votes
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { voterName, scores } = payload;
        
        if (!voterName || !voterName.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Your name is required to submit feedback' }));
          return;
        }

        if (!Array.isArray(scores)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid submissions format' }));
          return;
        }

        let totalPoints = 0;
        scores.forEach(s => {
          const pts = parseInt(s.points, 10);
          if (isNaN(pts) || pts < 1 || pts > 5) {
            throw new Error('Each team member must be awarded between 1 and 5 points');
          }
          totalPoints += pts;
        });

        if (totalPoints > 39) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Total points exceed 39 budget (allocated: ${totalPoints})` }));
          return;
        }

        await loadStore();
        const submission = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          voterName: voterName.trim(),
          submittedAt: new Date().toISOString(),
          totalAllocated: totalPoints,
          scores: scores.map(s => ({
            personId: parseInt(s.personId, 10),
            points: parseInt(s.points, 10) || 1,
            comment: (s.comment || '').trim()
          }))
        };

        memoryStore.submissions.push(submission);
        await saveStore(memoryStore);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, submissionId: submission.id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Error processing review' }));
      }
    });
    return;
  }

  // Admin status endpoint
  if (pathname === '/api/admin/status' && req.method === 'GET') {
    await loadStore();
    const hasPass = Boolean(memoryStore.adminPassword && memoryStore.adminPassword.trim() !== '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ isConfigured: hasPass }));
    return;
  }

  // Admin Setup Password endpoint (One-time only, permanently locked once set)
  if (pathname === '/api/admin/setup-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { password } = JSON.parse(body);
        const cleanPass = (password || '').trim();

        if (!cleanPass) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password cannot be blank' }));
          return;
        }

        await loadStore();
        if (memoryStore.adminPassword && memoryStore.adminPassword.trim() !== '') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Master password has already been set and is locked permanently.' }));
          return;
        }

        memoryStore.adminPassword = cleanPass;
        await saveStore(memoryStore);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Admin password configured successfully' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Temporary one-time unlock helper to clear any accidental password without touching submissions
  if (pathname === '/api/admin/unlock-setup' && req.method === 'POST') {
    await loadStore();
    memoryStore.adminPassword = null;
    await saveStore(memoryStore);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Setup unlocked. Ready for manager.' }));
    return;
  }

  // Admin Reset Password endpoint (Only allowed if no reviews or before lock)
  if (pathname === '/api/admin/force-reset' && req.method === 'POST') {
    await loadStore();
    // Permanently disabled once a password has been set by the manager
    if (memoryStore.adminPassword && memoryStore.adminPassword.trim() !== '') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password is permanently locked and cannot be reset' }));
      return;
    }
    memoryStore.adminPassword = null;
    await saveStore(memoryStore);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Admin password cleared' }));
    return;
  }

  // Admin Results Endpoint
  if (pathname === '/api/admin/results' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { adminPassword } = JSON.parse(body);
        await loadStore();
        const cleanPass = (adminPassword || '').trim();

        if (!memoryStore.adminPassword) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Admin setup pending. Please configure the master password via the setup link first.' }));
          return;
        }

        if (!cleanPass || memoryStore.adminPassword !== cleanPass) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Password' }));
          return;
        }

        const results = memoryStore.people.map(person => {
          let totalScore = 0;
          let countEvaluators = 0;
          const comments = [];

          memoryStore.submissions.forEach(sub => {
            const personScore = sub.scores.find(s => s.personId === person.id);
            if (personScore) {
              totalScore += personScore.points;
              if (personScore.points > 0 || personScore.comment) {
                countEvaluators++;
              }
              if (personScore.comment || personScore.points > 0) {
                comments.push({
                  voterName: sub.voterName,
                  pointsGiven: personScore.points,
                  comment: personScore.comment,
                  submittedAt: sub.submittedAt
                });
              }
            }
          });

          return {
            id: person.id,
            name: person.name,
            topic: person.topic,
            totalScore,
            evaluatorCount: countEvaluators,
            comments
          };
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          totalSubmissions: memoryStore.submissions.length,
          lastUpdated: new Date().toISOString(),
          results
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Static routing
  const publicDir = path.join(__dirname, 'public');

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(req, res, path.join(publicDir, 'index.html'), 'text/html');
  } else if (pathname === '/admin-setup' || pathname === '/admin-setup.html') {
    serveStatic(req, res, path.join(publicDir, 'admin-setup.html'), 'text/html');
  } else if (pathname === '/admin' || pathname === '/admin.html') {
    serveStatic(req, res, path.join(publicDir, 'admin.html'), 'text/html');
  } else if (pathname === '/qr' || pathname === '/qr.html') {
    serveStatic(req, res, path.join(publicDir, 'qr.html'), 'text/html');
  } else {
    const filePath = path.join(publicDir, pathname.replace(/^\//, ''));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml'
      };
      serveStatic(req, res, filePath, mimeTypes[ext] || 'application/octet-stream');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log(`Server running at: http://${ip}:${PORT}/`);
  if (SUPABASE_URL) {
    console.log(`[Storage] Cloud persistence active via Supabase`);
  } else if (UPSTASH_URL) {
    console.log(`[Storage] Cloud persistence active via Upstash`);
  } else {
    console.log(`[Storage] Local data.json persistence active`);
  }
});
