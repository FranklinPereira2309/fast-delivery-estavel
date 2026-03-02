const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
    transports: ['websocket']
});

socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join_table', 1);
});

socket.on('tableStatusChanged', (data) => {
    console.log('Received tableStatusChanged:', data);
});

socket.on('paymentConfirmed', (data) => {
    console.log('Received paymentConfirmed:', data);
    process.exit(0);
});

setTimeout(() => {
    console.log('Timeout waiting for events');
    process.exit(1);
}, 10000);
