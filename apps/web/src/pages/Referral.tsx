import { Navigate, useParams } from "react-router-dom";

/** /r/:code → /register?ref=code */
export default function Referral() {
  const { code = "" } = useParams();
  const to = code ? `/register?ref=${encodeURIComponent(code)}` : "/register";
  return <Navigate to={to} replace />;
}
