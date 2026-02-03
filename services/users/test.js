const http = require('http');
const assert = require('assert');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/users/health',
    method: 'GET',
    timeout: 2000
};

function checkHealth(attempts = 5) {
    console.log(`Testing Users Health Route (Attempt ${6 - attempts}/5)...`);
    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                assert.strictEqual(res.statusCode, 200, 'Status code should be 200');
                const body = JSON.parse(data);
                assert.strictEqual(body.message, 'OK', 'Response message should be OK');
                console.log('Users Service Health Test Passed!');
                process.exit(0);
            } catch (err) {
                console.error('Assertion Failed:', err.message);
                process.exit(1);
            }
        });
    });

    req.on('error', (err) => {
        if (attempts > 1) {
            console.log('Server not ready, retrying in 2 seconds...');
            setTimeout(() => checkHealth(attempts - 1), 2000);
        } else {
            console.error('Users Service Test Failed: Could not connect to server', err.message);
            process.exit(1);
        }
    });

    req.end();
}

checkHealth();
