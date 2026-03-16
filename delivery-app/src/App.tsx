import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './views/Home';
import Login from './views/Login';
import Register from './views/Register';
import Checkout from './views/Checkout';
import OrderHistory from './views/OrderHistory';
import OrderDetails from './views/OrderDetails';
import RecoverPassword from './views/RecoverPassword';
import Profile from './views/Profile';
import Chat from './views/Chat';
import { CartProvider } from './CartContext';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import SplashScreen from './components/SplashScreen';

function App() {
    const [isSplashVisible, setIsSplashVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsSplashVisible(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    if (isSplashVisible) {
        return <SplashScreen />;
    }

    return (
        <CartProvider>
            <BrowserRouter>
                <Layout>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/recover" element={<RecoverPassword />} />
                        <Route path="/register" element={<Register />} />

                        {/* Protected Routes */}
                        <Route path="/" element={<AuthGuard><Home /></AuthGuard>} />
                        <Route path="/checkout" element={<AuthGuard><Checkout /></AuthGuard>} />
                        <Route path="/history" element={<AuthGuard><OrderHistory /></AuthGuard>} />
                        <Route path="/order/:id" element={<AuthGuard><OrderDetails /></AuthGuard>} />
                        <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
                        <Route path="/chat" element={<AuthGuard><Chat /></AuthGuard>} />
                        
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Layout>
            </BrowserRouter>
        </CartProvider>
    );
}

export default App;
