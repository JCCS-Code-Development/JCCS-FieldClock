import { Routes, Route, Navigate } from 'react-router-dom'

import ProtectedRoute from './router/ProtectedRoute'
import RoleRoute from './router/RoleRoute'
import EmployeeLayout from './components/layout/EmployeeLayout'
import AdminLayout from './components/layout/AdminLayout'

import PhoneLogin from './pages/auth/PhoneLogin'
import SetupPassword from './pages/auth/SetupPassword'

import Home from './pages/employee/Home'
import ClockAction from './pages/employee/ClockAction'
import JobList from './pages/employee/JobList'
import WorkOrders from './pages/employee/WorkOrders'
import MyPay from './pages/employee/MyPay'

import AdminDashboard from './pages/admin/Dashboard'
import AdminJobs from './pages/admin/Jobs'
import AdminWorkOrders from './pages/admin/AdminWorkOrders'
import AdminEmployees from './pages/admin/Employees'
import AdminTimesheets from './pages/admin/Timesheets'
import AdminPayroll from './pages/admin/Payroll'
import AdminReports from './pages/admin/Reports'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PhoneLogin />} />
      <Route path="/setup-password" element={<SetupPassword />} />

      {/* Protected — any authenticated user */}
      <Route element={<ProtectedRoute />}>
        {/* Employee routes */}
        <Route element={<EmployeeLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/clock" element={<ClockAction />} />
          <Route path="/jobs" element={<JobList />} />
          <Route path="/jobs/:jobId/work-orders" element={<WorkOrders />} />
          <Route path="/my-pay" element={<MyPay />} />
        </Route>

        {/* Admin-only routes */}
        <Route element={<RoleRoute allowedRoles={['admin']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/work-orders" element={<AdminWorkOrders />} />
            <Route path="/admin/employees" element={<AdminEmployees />} />
            <Route path="/admin/timesheets" element={<AdminTimesheets />} />
            <Route path="/admin/payroll" element={<AdminPayroll />} />
            <Route path="/admin/reports" element={<AdminReports />} />
          </Route>
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
