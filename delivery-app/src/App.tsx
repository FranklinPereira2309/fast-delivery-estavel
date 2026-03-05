import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './views/Home';
import Login from './views/Login';
import Register from './views/Register';
import Checkout from './views/Checkout';
import OrderHistory from './views/OrderHistory';
import OrderDetails from './views/OrderDetails';
import RecoverPassword from './views/RecoverPassword';
import Profile from './views/Profile';
import { CartProvider } from './CartContext';
import Layout from './components/Layout';

function App() {
    return (
        <CartProvider>
            <BrowserRouter>
                <Layout>
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/recover" element={<RecoverPassword />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/history" element={<OrderHistory />} />
                        <Route path="/order/:id" element={<OrderDetails />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Layout>
            </BrowserRouter>
        </CartProvider>
    );
}

export default App;
