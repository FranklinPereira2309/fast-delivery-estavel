const fs = require('fs');
const testPatch = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/orders/PED-1771895207748/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'DELIVERED', driverId: 'some' })
        });
        const text = await res.text();
        fs.writeFileSync('error_output.json', text);
    } catch (err) {
        console.error(err);
    }
};
testPatch();
