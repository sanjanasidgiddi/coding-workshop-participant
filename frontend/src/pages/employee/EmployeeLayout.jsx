import { Tab, Tabs } from '@mui/material'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import './EmployeeLayout.css'

const TABS = [
  { value: '/employee/open', label: 'My Open Tickets' },
  { value: '/employee/tickets', label: 'All My Tickets' },
  { value: '/employee/new', label: 'Create Incident' },
]

export default function EmployeeLayout() {
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
        className="employee-layout__tabs"
      >
        {TABS.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>
      <Outlet />
    </div>
  )
}
