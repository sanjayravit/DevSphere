const https = require('https');

const options = {
    hostname: 'devsphere-sj.vercel.app',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, res => {
    let body = '';
    res.on('data', d => {
        body += d.toString();
    });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`BODY: ${body}`);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(JSON.stringify({ email: "test@example.com", password: "wrong" }));
req.end();
