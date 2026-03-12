const API_URL = 'http://localhost:3000/api';

async function testSaveUser() {
    console.log('--- Testing User Creation with Temporary ID ---');
    const newUser = {
        id: `user-${Date.now()}`,
        name: 'Test Assistant User',
        email: `testuser_${Date.now()}@example.com`,
        password: '123',
        permissions: ['dashboard', 'settings']
    };

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUser)
        });

        const data = await response.json();
        if (response.ok) {
            console.log('Success creating user:', data.name, data.id);
            
            console.log('\n--- Testing User Update (Existing ID) ---');
            const updatedUser = {
                ...data,
                permissions: [...data.permissions, 'inventory']
            };
            
            const updateResponse = await fetch(`${API_URL}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });
            
            const updateData = await updateResponse.json();
            if (updateResponse.ok) {
                console.log('Success updating user:', updateData.name, updateData.permissions);
            } else {
                console.error('Error updating user:', updateData);
            }
        } else {
            console.error('Error creating user:', data);
        }
    } catch (error) {
        console.error('Fetch error:', error.message);
        console.log('\nNOTE: Make sure the backend is running at http://localhost:3000');
    }
}

testSaveUser();
