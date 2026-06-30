import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useTheme } from './contexts/ThemeContext';
import useRequireRole from './hooks/useRequireRole';

// Pages
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import ParentDashboard from './pages/ParentDashboard';
import BusAdminDashboard from './pages/BusAdminDashboard';
import SchoolAdminDashboard from './pages/SchoolAdminDashboard';

/**
 * ProtectedRoute Wrapper
 * Enforces global Firebase Authentication presence.
 * Also handles session expiry — if a logged-in user's session expires while
 * they are on a dashboard, onAuthStateChanged fires with null and redirects
 * them to /login with a "session expired" message via state.
 */
const ProtectedRoute = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  // null = still checking, true = logged in, false = not logged in
  const [sessionExpired, setSessionExpired] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    let initialCheck = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in — clear any previous expiry flag
        setSessionExpired(false);
        setIsAuthenticated(true);
      } else {
        if (!initialCheck) {
          // User WAS logged in but now isn't — session expired mid-use
          setSessionExpired(true);
        }
        setIsAuthenticated(false);
      }
      initialCheck = false;
    });

    return unsubscribe;
  }, []);

  // Still checking Firebase auth state — show spinner
  if (isAuthenticated === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: colors.background }}>
        <div style={{ width: '40px', height: '40px', border: `3px solid ${colors.borders}`, borderTop: `3px solid ${colors.accent}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // Not authenticated — redirect to login
  // Pass sessionExpired flag so LoginPage can show a message
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ sessionExpired }}
      />
    );
  }

  return <Outlet />;
};

/**
 * RoleWrapper
 * A specialized wrapper that leverages `useRequireRole.js` to securely grab the
 * Firestore user context block and dynamically pass it to the Dashboard components
 * as the `userRole` prop (since they are pure components).
 */
const RoleWrapper = ({ expectedRole, Component }) => {
  const { userRole, loading } = useRequireRole(expectedRole);
  const { colors } = useTheme();

  if (loading || !userRole) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: colors.background }}>
        <div style={{ width: '40px', height: '40px', border: `3px solid ${colors.borders}`, borderTop: `3px solid ${colors.accent}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return <Component userRole={userRole} />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Global Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/parent" element={<RoleWrapper expectedRole="parent" Component={ParentDashboard} />} />
          <Route path="/bus-admin" element={<RoleWrapper expectedRole="bus_admin" Component={BusAdminDashboard} />} />
          <Route path="/school-admin" element={<RoleWrapper expectedRole="school_admin" Component={SchoolAdminDashboard} />} />
        </Route>

        {/* Fallback Catch-all Route */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
