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
    <div className="hm-error-wrap">
      <div className="hm-error-wordmark">
        House<span>Mind</span>
      </div>

      <div className="hm-error-icon">⚠️</div>

      <div className="hm-error-title">เกิดข้อผิดพลาด</div>
      <div className="hm-error-subtitle">
        Something went wrong in the workspace.
      </div>
      <div className="hm-error-body">
        ข้อมูลของคุณปลอดภัย — กรุณาลองใหม่อีกครั้ง
        <br />
        <small>Your data is safe. Please try again.</small>
      </div>

      <button onClick={onReset} className="hm-error-btn-primary">
        ลองใหม่ · Try again
      </button>

      <button onClick={() => window.location.reload()} className="hm-error-btn-secondary">
        โหลดหน้าใหม่ · Reload page
      </button>
    </div>
  );
}