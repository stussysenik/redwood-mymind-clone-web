import { Router, Route, Set, Private } from '@redwoodjs/router'

import AppLayout from 'src/layouts/AppLayout/AppLayout'
import AuthLayout from 'src/layouts/AuthLayout/AuthLayout'
import { useAuth } from 'src/auth'

const Routes = () => {
  return (
    <Router useAuth={useAuth}>
      <Set wrap={AuthLayout}>
        <Route path="/login" page={LoginPage} name="login" />
        <Route path="/signup" page={SignupPage} name="signup" />
      </Set>

      <Private unauthenticated="login">
        <Set wrap={AppLayout}>
          <Route path="/" page={HomePage} name="home" />
          <Route path="/spaces" page={SpacesPage} name="spaces" />
          <Route path="/spaces/{id}" page={SpacePage} name="space" />
          <Route path="/archive" page={ArchivePage} name="archive" />
          <Route path="/trash" page={TrashPage} name="trash" />
          <Route path="/serendipity" page={SerendipityPage} name="serendipity" />
          <Route path="/graph" page={GraphPage} name="graph" />
          <Route path="/settings" page={SettingsPage} name="settings" />
        </Set>
      </Private>

      <Route notfound page={NotFoundPage} />
    </Router>
  )
}

export default Routes
