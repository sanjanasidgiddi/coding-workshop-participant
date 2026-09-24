import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './routes/ProtectedRoute'
import AppShell from './components/AppShell'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import HomeRedirect from './pages/HomeRedirect'
import EmployeeLayout from './pages/employee/EmployeeLayout'
import EmployeeDashboardPage from './pages/employee/EmployeeDashboardPage'
import MyOpenTicketsPage from './pages/employee/MyOpenTicketsPage'
import AllMyTicketsPage from './pages/employee/AllMyTicketsPage'
import CreateIncidentPage from './pages/employee/CreateIncidentPage'
import EmployeeFacilitiesOverviewPage from './pages/employee/FacilitiesOverviewPage'
import IncidentDetailPage from './pages/incidents/IncidentDetailPage'
import EngineerLayout from './pages/engineer/EngineerLayout'
import EngineerDashboardPage from './pages/engineer/EngineerDashboardPage'
import MyAssignedTicketsPage from './pages/engineer/MyAssignedTicketsPage'
import EngineerFacilitiesOverviewPage from './pages/engineer/FacilitiesOverviewPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AllIncidentsPage from './pages/admin/AllIncidentsPage'
import FacilitiesPage from './pages/admin/FacilitiesPage'
import PeoplePage from './pages/admin/PeoplePage'

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
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<EmployeeDashboardPage />} />
                <Route path="open" element={<MyOpenTicketsPage />} />
                <Route path="tickets" element={<AllMyTicketsPage />} />
                <Route path="new" element={<CreateIncidentPage />} />
                <Route path="facilities" element={<EmployeeFacilitiesOverviewPage />} />
              </Route>
            </Route>

            <Route path="/engineer" element={<ProtectedRoute allowedRoles={['ENGINEER']} />}>
              <Route element={<EngineerLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<EngineerDashboardPage />} />
                <Route path="assigned" element={<MyAssignedTicketsPage />} />
                <Route path="facilities" element={<EngineerFacilitiesOverviewPage />} />
              </Route>
            </Route>

            <Route path="/admin" element={<ProtectedRoute allowedRoles={['FACILITY_ADMIN']} />}>
              <Route element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="incidents" element={<AllIncidentsPage />} />
                <Route path="facilities" element={<FacilitiesPage />} />
                <Route path="people" element={<PeoplePage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
