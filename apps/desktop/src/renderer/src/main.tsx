import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import "./monaco";
import DesktopAuth from "./DesktopAuth";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopAuth />
  </React.StrictMode>
);
