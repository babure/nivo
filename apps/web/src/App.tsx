import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/guards";
import Home from "./pages/Home";
import { Cookies, Impressum, OurRole, Privacy, Terms, Withdrawal } from "./pages/legal/Legal";
import { TermsReaccept } from "./pages/legal/TermsReaccept";
import Register from "./pages/Register";
import { ForgotPassword, Login, ResetPassword, VerifyEmail } from "./pages/AuthPages";
import Pay from "./pages/Pay";
import IdentityOnboarding from "./pages/IdentityOnboarding";
import Dashboard from "./pages/Dashboard";
import { Accommodation, Documents, Profile } from "./pages/Student";
import AdminRoutes from "./pages/admin/AdminShell";
import ConsultancyRoutes from "./pages/Consultancy";
import Referral from "./pages/Referral";
import NotFound from "./pages/NotFound";

const legalRoutes = (
  <>
    <Route path="terms" element={<Terms />} />
    <Route path="cookies" element={<Cookies />} />
    <Route path="our-role" element={<OurRole />} />
    <Route path="privacy" element={<Privacy />} />
    <Route path="impressum" element={<Impressum />} />
    <Route path="withdrawal" element={<Withdrawal />} />
  </>
);

export default function App() {
  return (
    <Routes>
      {/* Student app routes — Layout switches to AppShell when role=student */}
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="how-it-works" element={<Navigate to={{ pathname: "/", hash: "how-it-works" }} replace />} />
        <Route path="services" element={<Navigate to={{ pathname: "/", hash: "services" }} replace />} />
        <Route path="faq" element={<Navigate to={{ pathname: "/", hash: "faq" }} replace />} />
        <Route path="contact" element={<Navigate to={{ pathname: "/", hash: "about" }} replace />} />

        {legalRoutes}

        <Route path="de">
          <Route index element={<Navigate to="/de/terms" replace />} />
          {legalRoutes}
        </Route>

        <Route path="register" element={<Register />} />
        <Route path="login" element={<Login />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="r/:code" element={<Referral />} />

        <Route element={<RequireAuth />}>
          <Route path="legal/reaccept" element={<TermsReaccept />} />
          <Route path="pay" element={<Pay />} />
          <Route path="onboarding/identity" element={<IdentityOnboarding />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="accommodation" element={<Accommodation />} />
          <Route path="documents" element={<Documents />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="admin/*" element={<AdminRoutes />} />
        <Route path="consultancy/*" element={<ConsultancyRoutes />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
