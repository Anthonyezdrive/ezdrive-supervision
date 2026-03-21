import { Component, type ReactNode, type ErrorInfo } from "react";
import { Sentry } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  /** Section name shown in the error UI */
  section?: string;
  /** URL for the "back" button (defaults to /dashboard) */
  fallbackUrl?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Granular error boundary — wraps a section (B2B, CPO, eMSP…)
 * so a crash in one section doesn't take down the whole app.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.section ?? "unknown"}]`,
      error,
      info.componentStack
    );
    Sentry.captureException(error, {
      tags: { section: this.props.section ?? "unknown" },
      contexts: { react: { componentStack: info.componentStack ?? "" } },
    });
  }

  render() {
    if (this.state.hasError) {
      const fallback = this.props.fallbackUrl ?? "/dashboard";
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-surface border border-danger/30 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-danger/15 flex items-center justify-center">
              <span className="text-danger text-xl font-bold">!</span>
            </div>
            <h2 className="text-lg font-heading font-bold text-foreground">
              Une erreur est survenue
              {this.props.section && (
                <span className="text-foreground-muted font-normal text-sm block mt-1">
                  Section : {this.props.section}
                </span>
              )}
            </h2>
            <p className="text-sm text-foreground-muted">
              {this.state.error?.message ?? "Erreur inattendue lors du rendu de la page."}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Reessayer
              </button>
              <button
                onClick={() => { window.location.href = fallback; }}
                className="px-4 py-2 bg-surface-elevated border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-elevated/80 transition-colors"
              >
                Retour au tableau de bord
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
