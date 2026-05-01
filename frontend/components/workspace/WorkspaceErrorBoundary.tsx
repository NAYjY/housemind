"use client";

/**
 * components/workspace/WorkspaceErrorBoundary.tsx — HouseMind
 *
 * React class error boundary for the workspace shell.
 * A JS error in ProductGrid, PinsLayer, or any child will render
 * this fallback instead of white-screening the entire page.
 *
 * Why a class component: React error boundaries must be class components.
 * There is no hook equivalent — this is a React constraint, not a choice.
 */

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class WorkspaceErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // In production Sentry will pick this up automatically via
    // sentry-sdk FastApiIntegration. In local dev, log to console.
    console.error("[WorkspaceErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <WorkspaceErrorFallback onReset={this.handleReset} />;
  }
}

// ── Fallback UI ───────────────────────────────────────────────────────────────

function WorkspaceErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Sarabun', sans-serif",
        background: "#FAF8F4",
        minHeight: "100vh",
        maxWidth: 430,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 28px",
        textAlign: "center",
      }}
    >
      {/* HouseMind wordmark */}
      <div
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: "#1C1810",
          marginBottom: 32,
          letterSpacing: "-0.01em",
        }}
      >
        House<span style={{ color: "#C9A84C" }}>Mind</span>
      </div>

      {/* Error icon */}
      <div style={{ fontSize: 44, marginBottom: 20 }}>⚠️</div>

      {/* Thai-primary messaging */}
      <div
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "#1C1810",
          marginBottom: 8,
        }}
      >
        เกิดข้อผิดพลาด
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#9A8870",
          marginBottom: 6,
          lineHeight: 1.5,
        }}
      >
        Something went wrong in the workspace.
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#6B5D4E",
          marginBottom: 32,
          lineHeight: 1.7,
        }}
      >
        ข้อมูลของคุณปลอดภัย — กรุณาลองใหม่อีกครั้ง
        <br />
        <span style={{ fontSize: 11, color: "#B0A090" }}>
          Your data is safe. Please try again.
        </span>
      </div>

      {/* Try again — resets boundary state, no full page reload */}
      <button
        onClick={onReset}
        style={{
          width: "100%",
          maxWidth: 280,
          height: 48,
          background: "#1C1810",
          border: "none",
          borderRadius: 100,
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          marginBottom: 12,
          fontFamily: "inherit",
        }}
      >
        ลองใหม่ · Try again
      </button>

      {/* Hard reload fallback — last resort */}
      <button
        onClick={() => window.location.reload()}
        style={{
          width: "100%",
          maxWidth: 280,
          height: 44,
          background: "transparent",
          border: "1px solid #E0D8CC",
          borderRadius: 100,
          color: "#9A8870",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        โหลดหน้าใหม่ · Reload page
      </button>
    </div>
  );
}