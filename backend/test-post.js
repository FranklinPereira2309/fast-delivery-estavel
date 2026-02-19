const http = require('http');

const data = JSON.stringify({
    id: 'DRV-TEST',
    name: 'Test Driver',
    phone: '999999999',
    email: 'test@test.com',
    address: 'Street 1',
    vehicle: {
        plate: 'ABC-1234',
        model: 'CB 500',
        brand: 'Honda',
        type: 'Moto'
    },
    status: 'AVAILABLE'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/drivers',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (error) => {
    console.error(error);
});

req.write(data);
req.end();
