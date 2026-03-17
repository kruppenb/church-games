import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-face">
            <div className="error-face-eyes">
              <span className="error-face-eye" />
              <span className="error-face-eye" />
            </div>
            <div className="error-face-mouth" />
          </div>
          <h1 className="error-boundary-title">Oops! Something went wrong</h1>
          <p className="error-boundary-message">
            Don&apos;t worry, it happens sometimes! Let&apos;s try again.
          </p>
          <button
            className="btn btn-primary error-boundary-retry"
            onClick={this.handleRetry}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
