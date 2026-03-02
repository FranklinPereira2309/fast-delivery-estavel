const { io } = require('socket.io-client');

const tableNumber = 1; // Change to match your test table
const SOCKET_URL = 'http://localhost:3000'; // Change if different

const socket = io(SOCKET_URL);

socket.on('connect', () => {
    console.log('Connected to socket server');

    console.log(`Joining room for table ${tableNumber}...`);
    socket.emit('join_table', tableNumber);

    setTimeout(() => {
        console.log('Emitting orderStatusUpdated event...');
        // Note: In production, the backend emits this. We are mocking it here.
        // However, the backend is what usually emits to rooms. 
        // To test the full flow, we should trigger a status update via API.
        // But since we want to see the UI, a direct emission to the room (if the server allows) 
        // or just checking if the frontend listens is enough.
        // Actually, clients usually can't emit to rooms directly in this setup.
        // I will trigger a status update via API instead if possible.

        console.log('Please update an order status to READY or PARTIALLY_READY in the PDV for table ' + tableNumber);
        console.log('Or I can try to find an order ID and use the API.');
    }, 1000);
});

socket.on('orderStatusUpdated', (data) => {
    console.log('Received orderStatusUpdated:', data);
});
