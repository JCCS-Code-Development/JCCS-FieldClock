import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

import ProtectedRoute from './router/ProtectedRoute'
import RoleRoute from './router/RoleRoute'
import EmployeeLayout from './components/layout/EmployeeLayout'
import AdminLayout from './components/layout/AdminLayout'
import ContractorLayout from './components/layout/ContractorLayout'

import PhoneLogin from './pages/auth/PhoneLogin'
import SetupPassword from './pages/auth/SetupPassword'

import Home from './pages/employee/Home'
import ClockAction from './pages/employee/ClockAction'
import JobList from './pages/employee/JobList'
import MyPay from './pages/employee/MyPay'

import AdminDashboard from './pages/admin/Dashboard'
import AdminJobs from './pages/admin/Jobs'
import AdminEmployees from './pages/admin/Employees'
import AdminTimesheets from './pages/admin/Timesheets'
import AdminPayroll from './pages/admin/Payroll'
import AdminLoans from './pages/admin/Loans'
import AdminReports from './pages/admin/Reports'

import InvoicePortal from './pages/contractor/InvoicePortal'
import LegalDocuments from './pages/contractor/LegalDocuments'

function RoleRedirect() {
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role === 'contractor') return <Navigate to="/contractor/invoices" replace />
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PhoneLogin />} />
      <Route path="/setup-password" element={<SetupPassword />} />

      <Route element={<ProtectedRoute />}>
        {/* Employee routes */}
        <Route element={<RoleRoute allowedRoles={['employee', 'admin']} />}>
          <Route element={<EmployeeLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/clock" element={<ClockAction />} />
            <Route path="/jobs" element={<JobList />} />
            <Route path="/my-pay" element={<MyPay />} />
          </Route>
        </Route>

        {/* Contractor routes */}
        <Route element={<RoleRoute allowedRoles={['contractor']} />}>
          <Route element={<ContractorLayout />}>
            <Route path="/contractor/invoices"  element={<InvoicePortal />} />
            <Route path="/contractor/documents" element={<LegalDocuments />} />
          </Route>
        </Route>

        {/* Admin routes */}
        <Route element={<RoleRoute allowedRoles={['admin']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="/admin/employees" element={<AdminEmployees />} />
            <Route path="/admin/timesheets" element={<AdminTimesheets />} />
            <Route path="/admin/payroll" element={<AdminPayroll />} />
            <Route path="/admin/loans"   element={<AdminLoans />}   />
            <Route path="/admin/reports" element={<AdminReports />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  )
}
