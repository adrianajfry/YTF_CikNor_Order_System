import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginView from './pages/LoginView.jsx'
import YtfCounterView from './pages/YtfCounterView.jsx'
import CashierView from './pages/CashierView.jsx'
import StationView from './pages/StationView.jsx'
import BoardView from './pages/BoardView.jsx'
import PickupView from './pages/PickupView.jsx'
import OrderHistoryView from './pages/OrderHistoryView.jsx'
import CustomerDisplayView from './pages/CustomerDisplayView.jsx'
import CameraBroadcastView from './pages/CameraBroadcastView.jsx'
import CashierOrderHistoryView from './pages/CashierOrderHistoryView.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: the customer-facing status board, no login needed */}
          <Route path="/board" element={<BoardView />} />
          <Route path="/customer-display" element={<CustomerDisplayView />} />
          <Route path="/login" element={<LoginView />} />

          {/* Each of these only renders for the matching staff account */}
          <Route
            path="/counter/ytf"
            element={
              <ProtectedRoute allowedRole="ytf_counter">
                <YtfCounterView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/counter/cashier"
            element={
              <ProtectedRoute allowedRole="cashier">
                <CashierView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/counter/cashier/history"
            element={
              <ProtectedRoute allowedRole="cashier">
                <CashierOrderHistoryView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/station/ytf"
            element={
              <ProtectedRoute allowedRole="ytf">
                <StationView stationSlug="ytf" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/station/beverage"
            element={
              <ProtectedRoute allowedRole="beverage">
                <StationView stationSlug="beverage" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/station/hotfood"
            element={
              <ProtectedRoute allowedRole="hotfood">
                <StationView stationSlug="hotfood" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pickup"
            element={
              <ProtectedRoute allowedRole="pickup">
                <PickupView />
              </ProtectedRoute>
            }
          />
                    <Route
            path="/station/ytf/history"
            element={
              <ProtectedRoute allowedRole="ytf">
                <OrderHistoryView stationSlug="ytf" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/station/beverage/history"
            element={
              <ProtectedRoute allowedRole="beverage">
                <OrderHistoryView stationSlug="beverage" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/station/hotfood/history"
            element={
              <ProtectedRoute allowedRole="hotfood">
                <OrderHistoryView stationSlug="hotfood" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/camera/ytf"
            element={
              <ProtectedRoute allowedRole="ytf_camera">
                <CameraBroadcastView />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
