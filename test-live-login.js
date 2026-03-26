const https = require('https');

const data = JSON.stringify({
    email: 'test@example.com',
    password: 'wrong_password'
});

const options = {
    hostname: 'devsphere-sj.vercel.app',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = https.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    console.log(`headers:`, res.headers);

    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
