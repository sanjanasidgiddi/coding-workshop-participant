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
import MyAssignedTicketsPage from './pages/engineer/MyAssignedTicketsPage'
import AdminLayout from './pages/admin/AdminLayout'
import AllIncidentsPage from './pages/admin/AllIncidentsPage'
import FacilitiesPage from './pages/admin/FacilitiesPage'

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

            <Route path="/engineer" element={<ProtectedRoute allowedRoles={['ENGINEER']} />}>
              <Route index element={<MyAssignedTicketsPage />} />
            </Route>

            <Route path="/admin" element={<ProtectedRoute allowedRoles={['FACILITY_ADMIN']} />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="incidents" replace />} />
                <Route path="incidents" element={<AllIncidentsPage />} />
                <Route path="facilities" element={<FacilitiesPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
