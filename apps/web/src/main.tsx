import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ConsentProvider } from "./lib/consent";
import { ToastProvider } from "./lib/toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConsentProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ConsentProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
