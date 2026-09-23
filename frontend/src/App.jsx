import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import HomeRedirect from './pages/HomeRedirect'
import EmployeeLayout from './pages/employee/EmployeeLayout'
import MyOpenTicketsPage from './pages/employee/MyOpenTicketsPage'
import AllMyTicketsPage from './pages/employee/AllMyTicketsPage'
import CreateIncidentPage from './pages/employee/CreateIncidentPage'
import IncidentDetailPage from './pages/incidents/IncidentDetailPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />

            <Route path="/employee" element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
              <Route element={<EmployeeLayout />}>
                <Route index element={<Navigate to="open" replace />} />
                <Route path="open" element={<MyOpenTicketsPage />} />
                <Route path="tickets" element={<AllMyTicketsPage />} />
                <Route path="new" element={<CreateIncidentPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
