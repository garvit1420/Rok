import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import { TpoDashboard, TpoCompanies, TpoDrives, TpoDriveApplicants, TpoStudents, TpoStudentDetail, TpoReports } from './pages/Tpo';
import { CompanyDashboard, CompanyDrives, CompanyProfile, CompanyCandidates } from './pages/Company';
import { StudentDashboard, StudentProfile, StudentDrives, StudentApplications } from './pages/Student';

function Protected({ role }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return <Layout />;
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/tpo" element={<Protected role="tpo" />}>
        <Route index element={<TpoDashboard />} />
        <Route path="companies" element={<TpoCompanies />} />
        <Route path="drives" element={<TpoDrives />} />
        <Route path="drives/:id" element={<TpoDriveApplicants />} />
        <Route path="students" element={<TpoStudents />} />
        <Route path="students/:id" element={<TpoStudentDetail />} />
        <Route path="reports" element={<TpoReports />} />
      </Route>

      <Route path="/company" element={<Protected role="company" />}>
        <Route index element={<CompanyDashboard />} />
        <Route path="drives" element={<CompanyDrives />} />
        <Route path="drives/:id" element={<CompanyCandidates />} />
        <Route path="profile" element={<CompanyProfile />} />
      </Route>

      <Route path="/student" element={<Protected role="student" />}>
        <Route index element={<StudentDashboard />} />
        <Route path="profile" element={<StudentProfile />} />
        <Route path="drives" element={<StudentDrives />} />
        <Route path="applications" element={<StudentApplications />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
    </Routes>
  );
}
