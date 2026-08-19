import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { RequireAuth } from './lib/RequireAuth'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { BrowsePage } from './pages/BrowsePage'
import { ChildrenPage } from './pages/ChildrenPage'
import { HomePage } from './pages/HomePage'
import { InviteCaregiverPage } from './pages/InviteCaregiverPage'
import { LogPage } from './pages/LogPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/invite"
          element={
            <RequireAuth>
              <InviteCaregiverPage />
            </RequireAuth>
          }
        />
        <Route
          path="/children"
          element={
            <RequireAuth>
              <ChildrenPage />
            </RequireAuth>
          }
        />
        <Route
          path="/log"
          element={
            <RequireAuth>
              <LogPage />
            </RequireAuth>
          }
        />
        <Route
          path="/browse"
          element={
            <RequireAuth>
              <BrowsePage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
