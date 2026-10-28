const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const DATA_FILE = path.join(__dirname, 'data.json');

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

function initStorage() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      people: DEFAULT_PEOPLE,
      submissions: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  } else {
    try {
      const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (!existing.people || existing.people.length === 0) {
        existing.people = DEFAULT_PEOPLE;
        fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2), 'utf-8');
      }
    } catch (e) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ people: DEFAULT_PEOPLE, submissions: [] }, null, 2), 'utf-8');
    }
  }
}

initStorage();

function getStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return { people: DEFAULT_PEOPLE, submissions: [] };
  }
}

function saveStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

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

const server = http.createServer((req, res) => {
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
      adminUrl: `http://${ip}:${PORT}/admin`
    }));
    return;
  }

  // Get people list for evaluation form
  if (pathname === '/api/people' && req.method === 'GET') {
    const store = getStore();
    const publicList = store.people.map(p => ({
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
    req.on('end', () => {
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

        const store = getStore();
        const submission = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          voterName: voterName.trim(),
          submittedAt: new Date().toISOString(),
          totalAllocated: totalPoints,
          scores: scores.map(s => ({
            personId: parseInt(s.personId, 10),
            points: parseInt(s.points, 10) || 0,
            comment: (s.comment || '').trim()
          }))
        };

        store.submissions.push(submission);
        saveStore(store);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, submissionId: submission.id }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Error processing review' }));
      }
    });
    return;
  }

  // Admin Results Endpoint — STRICTLY PROTECTED BY ADMIN PASSWORD
  if (pathname === '/api/admin/results' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { adminPassword } = JSON.parse(body);
        if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Password' }));
          return;
        }

        const store = getStore();
        const results = store.people.map(person => {
          let totalScore = 0;
          let countEvaluators = 0;
          const comments = [];

          store.submissions.forEach(sub => {
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
          totalSubmissions: store.submissions.length,
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

  // Admin Reset Endpoint — STRICTLY PROTECTED BY ADMIN PASSWORD
  if (pathname === '/api/admin/reset' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { adminPassword } = JSON.parse(body);
        if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin Password' }));
          return;
        }

        const store = getStore();
        store.submissions = [];
        saveStore(store);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All reviews have been reset' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }

  // Static files routing
  const publicDir = path.join(__dirname, 'public');

  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(req, res, path.join(publicDir, 'index.html'), 'text/html');
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
  console.log(`Server running at:`);
  console.log(`- Review Portal (Public / QR): http://${ip}:${PORT}/`);
  console.log(`- QR Screen Display: http://${ip}:${PORT}/qr`);
  console.log(`- Admin Review Dashboard (Protected): http://${ip}:${PORT}/admin`);
  console.log(`  Admin Default Password: ${ADMIN_PASSWORD}`);
});
