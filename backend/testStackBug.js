async function testFlow() {
    try {
        console.log("1. Cleaning up Table 9 session...");
        await fetch('http://127.0.0.1:3000/api/tables/9', { method: 'DELETE' });

        console.log("2. Simulating Digital Menu Order 1 (Coca Cola com Gelo)");
        await fetch('http://127.0.0.1:3000/api/public/tables/9/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tableNumber: 9,
                items: [{ productId: 'test-coca-id', quantity: 1 }],
                observations: 'Com gelo',
                clientLat: -23.5505,
                clientLng: -46.6333
            })
        });

        console.log("3. Fetching Table 9 session to verify pending items...");
        let res1 = await fetch('http://127.0.0.1:3000/api/tables');
        let sessions = await res1.json();
        let table9 = sessions.find(s => s.tableNumber === 9);
        console.log("Pending Items before Approval:", table9.pendingReviewItems);

        console.log("4. Simulating Waiter Approval via saveTableSession...");
        let approvedItems = JSON.parse(table9.pendingReviewItems);
        table9.items = [...table9.items || [], ...approvedItems.map(i => ({ ...i, uid: '123', isReady: false, price: 5 }))];
        table9.pendingReviewItems = null; // THIS IS THE FIX WE APPLIED
        table9.hasPendingDigital = false;
        table9.status = 'occupied';

        await fetch('http://127.0.0.1:3000/api/tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(table9)
        });

        console.log("5. Fetching Table 9 session to verify pending items cleared...");
        let resAfter = await fetch('http://127.0.0.1:3000/api/tables');
        let sessionsAfter = await resAfter.json();
        let table9After = sessionsAfter.find(s => s.tableNumber === 9);
        console.log("Pending Items after Approval:", table9After.pendingReviewItems);

        console.log("6. Simulating Digital Menu Order 2 (Coca Cola sem Gelo)");
        await fetch('http://127.0.0.1:3000/api/public/tables/9/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tableNumber: 9,
                items: [{ productId: 'test-coca-id', quantity: 1 }],
                observations: '',
                clientLat: -23.5505,
                clientLng: -46.6333
            })
        });

        console.log("7. Fetching Table 9 session to verify NO stacking...");
        let resFinal = await fetch('http://127.0.0.1:3000/api/tables');
        let sessionsFinal = await resFinal.json();
        let table9Final = sessionsFinal.find(s => s.tableNumber === 9);
        console.log("Pending Items Final (should only have 1 item):", table9Final.pendingReviewItems);

    } catch (err) {
        console.error("Test failed:", err);
    }
}

testFlow();
