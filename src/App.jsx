import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";

const boxStyle = {
  width: "100%",
  maxWidth: 360,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #2a2d50",
  background: "#13152b",
  color: "#dfe6fd",
  outline: "none",
  marginTop: 10,
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  maxWidth: 360,
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#6c5ce7",
  color: "white",
  cursor: "pointer",
  marginTop: 12,
  fontWeight: 700,
};

const ghostButtonStyle = {
  ...buttonStyle,
  background: "#1a1d35",
  border: "1px solid #2a2d50",
};

const msgStyle = {
  width: "100%",
  maxWidth: 360,
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,184,148,0.12)",
  border: "1px solid rgba(0,184,148,0.35)",
  color: "#dfe6fd",
  fontSize: 14,
  boxSizing: "border-box",
};

const errStyle = {
  width: "100%",
  maxWidth: 360,
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(225,112,85,0.12)",
  border: "1px solid rgba(225,112,85,0.35)",
  color: "#ffd7cf",
  fontSize: 14,
  boxSizing: "border-box",
};

const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim().toLowerCase());

export default function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const confirmed = url.searchParams.get("confirmed");

    if (confirmed === "1") {
      setAuthMessage("Имэйл баталгаажлаа. Одоо нэвтэрч болно.");
      setShowAuth(true);
      setIsLogin(true);

      url.searchParams.delete("confirmed");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const clearMessages = () => {
    setAuthError("");
    setAuthMessage("");
  };

  const handleAuth = async () => {
    clearMessages();

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !password || (!isLogin && !cleanName)) {
      setAuthError("Бүх талбарыг бөглөнө үү.");
      return;
    }

    if (!validateEmail(cleanEmail)) {
      setAuthError("Зөв имэйл хаяг оруулна уу.");
      return;
    }

    if (password.length < 6) {
      setAuthError("Нууц үг 6+ тэмдэгт байх ёстой.");
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setAuthError("Имэйл эсвэл нууц үг буруу.");
        return;
      }

      setShowAuth(false);
      setEmail("");
      setPassword("");
      setName("");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { name: cleanName },
        emailRedirectTo: "https://germanmongol.de/?confirmed=1",
      },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Бүртгэл амжилттай. Имэйлээ шалгаад хаягаа баталгаажуулна уу.");
    setIsLogin(true);
    setPassword("");
  };

  const handleForgotPassword = async () => {
    clearMessages();

    const cleanEmail = email.trim().toLowerCase();
    if (!validateEmail(cleanEmail)) {
      setAuthError("Зөв имэйл хаяг оруулна уу.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: "https://germanmongol.de/?confirmed=1",
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Нууц үг сэргээх имэйл илгээгдлээ.");
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0d0e1a",
          color: "#dfe6fd",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ width: "100%", maxWidth: 700, textAlign: "center" }}>
          <h1 style={{ fontSize: 42, marginBottom: 10 }}>ГерманАнки</h1>
          <p style={{ color: "#7c85c0", fontSize: 18, marginBottom: 24 }}>
            Монголчуудад зориулсан Герман хэлний апп
          </p>

          <div
            style={{
              background: "#13152b",
              border: "1px solid #2a2d50",
              borderRadius: 18,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Нүүр</h2>
            <p style={{ color: "#a29bfe" }}>
              Үг цээжлэх, нийтлэл унших, Герман хэлээ өдөр бүр ахиулах.
            </p>
            <button style={buttonStyle} onClick={() => { clearMessages(); setShowAuth(true); }}>
              Нэвтрэх / Бүртгүүлэх
            </button>
          </div>

          {showAuth && (
            <div
              style={{
                background: "#13152b",
                border: "1px solid #2a2d50",
                borderRadius: 18,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <h3 style={{ marginTop: 0 }}>{isLogin ? "Нэвтрэх" : "Бүртгүүлэх"}</h3>

              {!isLogin && (
                <input
                  style={boxStyle}
                  placeholder="Нэр"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}

              <input
                style={boxStyle}
                placeholder="Имэйл"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                style={boxStyle}
                type="password"
                placeholder="Нууц үг"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {authError && <div style={errStyle}>{authError}</div>}
              {authMessage && <div style={msgStyle}>{authMessage}</div>}

              <button style={buttonStyle} onClick={handleAuth}>
                {isLogin ? "Нэвтрэх" : "Бүртгүүлэх"}
              </button>

              {isLogin && (
                <button style={ghostButtonStyle} onClick={handleForgotPassword}>
                  Нууц үгээ мартсан
                </button>
              )}

              <p
                onClick={() => {
                  clearMessages();
                  setIsLogin(!isLogin);
                }}
                style={{ cursor: "pointer", color: "#a29bfe", marginTop: 16 }}
              >
                {isLogin ? "Бүртгүүлэх үү?" : "Нэвтрэх үү?"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0e1a",
        color: "#dfe6fd",
        padding: 40,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h2>Нүүр</h2>
      <p>Сайн байна уу 👋</p>
      <p>{user.email}</p>
      <button style={{ ...buttonStyle, maxWidth: 180 }} onClick={logout}>
        Гарах
      </button>
    </div>
  );
}
