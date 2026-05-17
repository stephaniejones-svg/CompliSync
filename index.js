const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
app.use(express.json());

// ── JIRA PROXY ───────────────────────────────────────────────
// Forwards Jira API requests from CompliSync (Apps Script)
// to any customer's Atlassian instance.
//
// Request format:
//   POST /jira
//   Headers:
//     x-jira-url:   https://customer.atlassian.net/rest/api/3/search/jql?...
//     x-jira-auth:  Basic base64(email:token)
//     Content-Type: application/json   (for POST/PUT)
//   Body: JSON payload (for POST/PUT), empty for GET
//
// The proxy:
//   1. Reads the target URL and auth from headers
//   2. Forwards the request with the original method and body
//   3. Returns the Jira response verbatim

app.post('/jira', async (req, res) => {
  const targetUrl  = req.headers['x-jira-url'];
  const authHeader = req.headers['x-jira-auth'];
  const method     = (req.headers['x-jira-method'] || 'GET').toUpperCase();

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing x-jira-url header' });
  }
  if (!authHeader) {
    return res.status(400).json({ error: 'Missing x-jira-auth header' });
  }

  // Only allow Atlassian URLs
  try {
    var parsed = new URL(targetUrl);
    if (!parsed.hostname.endsWith('.atlassian.net')) {
      return res.status(403).json({ error: 'Only *.atlassian.net URLs are allowed' });
    }
  } catch(e) {
    return res.status(400).json({ error: 'Invalid x-jira-url' });
  }

  try {
    var fetchOptions = {
      method:  method,
      headers: {
        'Authorization': authHeader,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    };

    // Attach body for non-GET requests
    if (method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    var jiraRes  = await fetch(targetUrl, fetchOptions);
    var jiraBody = await jiraRes.text();

    res.status(jiraRes.status)
       .set('Content-Type', 'application/json')
       .send(jiraBody);

  } catch(err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// Health check
app.get('/', (req, res) => res.send('CompliSync Jira Proxy OK'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('Proxy listening on port', PORT));
