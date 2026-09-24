import { Tab, Tabs } from '@mui/material'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import './AdminLayout.css'

const TABS = [
  { value: '/admin/dashboard', label: 'Dashboard' },
  { value: '/admin/incidents', label: 'All Incidents' },
  { value: '/admin/facilities', label: 'Facilities' },
  { value: '/admin/people', label: 'People' },
  { value: '/admin/create-profile', label: 'Create Profile' },
]

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentTab = TABS.find((tab) => location.pathname.startsWith(tab.value))?.value || false

  return (
    <div>
      <Tabs
        value={currentTab}
        onChange={(_, value) => navigate(value)}
        textColor="primary"
        indicatorColor="primary"
        className="admin-layout__tabs"
      >
        {TABS.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>
      <Outlet />
    </div>
  )
}
