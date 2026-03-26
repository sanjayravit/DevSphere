const https = require('https');

const data = JSON.stringify({
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'password123'
});

const options = {
    hostname: 'devsphere-sj.vercel.app',
    port: 443,
    path: '/api/auth/register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, res => {
    let body = '';
    res.on('data', d => {
        body += d.toString();
    });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
        console.log(`BODY: ${body}`);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
