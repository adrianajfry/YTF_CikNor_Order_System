import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import LoginView from './pages/LoginView.jsx'
import YtfCounterView from './pages/YtfCounterView.jsx'
import CashierView from './pages/CashierView.jsx'
import StationView from './pages/StationView.jsx'
import BoardView from './pages/BoardView.jsx'
import PickupView from './pages/PickupView.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: the customer-facing status board, no login needed */}
          <Route path="/board" element={<BoardView />} />

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

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
