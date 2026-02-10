import React from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';

interface Props {
  children: React.ReactNode;
  fallbackLabel?: string;
  queryClient?: QueryClient;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackLabel || 'View'} crashed:`, error, info.componentStack);
  }

  handleRetry = () => {
    this.props.queryClient?.invalidateQueries();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <h3 className="text-sm font-bold text-red-400">
              {this.props.fallbackLabel || 'View'} encountered an error
            </h3>
          </div>
          <p className="text-[11px] text-white/30 font-mono">{this.state.error?.message}</p>
          <button
            onClick={this.handleRetry}
            className="text-xs text-red-300 hover:text-red-200 underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ErrorBoundaryWithClient(props: Omit<Props, 'queryClient'>) {
  const queryClient = useQueryClient();
  return <ErrorBoundary {...props} queryClient={queryClient} />;
}
