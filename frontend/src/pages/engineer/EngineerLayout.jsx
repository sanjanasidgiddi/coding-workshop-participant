import { Tab, Tabs } from '@mui/material'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import './EngineerLayout.css'

const TABS = [
  { value: '/engineer/dashboard', label: 'Dashboard' },
  { value: '/engineer/assigned', label: 'My Assigned Tickets' },
  { value: '/engineer/facilities', label: 'Facilities' },
]

export default function EngineerLayout() {
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
        className="engineer-layout__tabs"
      >
        {TABS.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>
      <Outlet />
    </div>
  )
}
