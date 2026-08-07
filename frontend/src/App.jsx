import React, { useEffect, useState, useCallback } from "react";

function readRecoveredSession() {
  try {
    const raw = localStorage.getItem("hirelens_active_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
import Setup from "./pages/Setup.jsx";
import CreateInterview from "./pages/CreateInterview.jsx";
import InterviewRoom from "./pages/InterviewRoom.jsx";
import InterviewLink from "./pages/InterviewLink.jsx";
import ExpiredInterview from "./pages/ExpiredInterview.jsx";
import CompletedInterview from "./pages/CompletedInterview.jsx";
import Report from "./pages/Report.jsx";
import History from "./pages/History.jsx";

/* Tiny router — supports both real paths and hash paths. */
function useAppRoute() {
  const parse = () => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const pathValue = hash || window.location.pathname.replace(/^\/+/, "");
    const [path, ...rest] = pathValue.split("/");
    return { path: path || "setup", param: rest.join("/") || null };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  const navigate = useCallback(to => {
    const normalized = to.startsWith("/") ? to : `/${to}`;
    if (normalized === "/") {
      window.history.pushState({}, "", "/setup");
    } else {
      window.history.pushState({}, "", normalized);
    }
    window.dispatchEvent(new Event("popstate"));
  }, []);
  return { route, navigate };
}

export default function App() {
  const { route, navigate } = useAppRoute();
  const [session, setSession] = useState(() => readRecoveredSession());

  useEffect(() => {
    if (session) {
      try {
        localStorage.setItem("hirelens_active_session", JSON.stringify(session));
      } catch {
        // no-op
      }
    } else {
      try {
        localStorage.removeItem("hirelens_active_session");
      } catch {
        // no-op
      }
    }
  }, [session]);

  let page;
  if (route.path === "interview" && session?.questions) {
    page = <InterviewRoom session={session} setSession={setSession} navigate={navigate} />;
  } else if (route.path === "interview" && route.param) {
    page = <InterviewLink token={route.param} navigate={navigate} setSession={setSession} />;
  } else if (route.path === "interview") {
    page = <Setup navigate={navigate} setSession={setSession} />;
  } else if (route.path === "report") {
    page = <Report id={route.param} session={session} navigate={navigate} />;
  } else if (route.path === "history") {
    page = <History navigate={navigate} />;
  } else if (route.path === "create") {
    page = <CreateInterview navigate={navigate} />;
  } else if (route.path === "expired") {
    page = <ExpiredInterview />;
  } else if (route.path === "completed") {
    page = <CompletedInterview />;
  } else {
    page = <Setup navigate={navigate} setSession={setSession} />;
  }

  return (
    <>
      <header className="topbar">
        <button
  type="button"
  className="brand"
  onClick={() => navigate("/setup")}
  aria-label="HireLens home"
>
  <span className="brand-mark" aria-hidden="true" />
  HireLens
</button>
        <nav className="topnav" aria-label="Main">
  <button
    type="button"
    className={route.path === "setup" ? "active nav-btn" : "nav-btn"}
    onClick={() => navigate("/setup")}
  >
    New interview
  </button>

  <button
    type="button"
    className={route.path === "create" ? "active nav-btn" : "nav-btn"}
    onClick={() => navigate("/create")}
  >
    Create interview link
  </button>

  <button
    type="button"
    className={route.path === "history" ? "active nav-btn" : "nav-btn"}
    onClick={() => navigate("/history")}
  >
    History
  </button>
</nav>
      </header>
      <main className="page">{page}</main>
    </>
  );
}
