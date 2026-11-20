import React from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly message: string;
}

export class ErrorBoundary extends React.Component<
  {readonly children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {readonly children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Wystąpił nieoczekiwany błąd aplikacji.';
    try {
      const parsed: unknown = JSON.parse(error.message);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'operationType' in parsed &&
        'error' in parsed
      ) {
        const info = parsed as {operationType: string; path?: string | null; error: string};
        readable = `Błąd dostępu do Firestore (${info.operationType}${
          info.path ? ` · ${info.path}` : ''
        }): ${info.error}`;
      }
    } catch {
      // Plain error message
    }
    return {hasError: true, message: readable};
  }

  componentDidCatch(error: Error): void {
    console.error('GeoPolska ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[#090E14] p-6 text-slate-100">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#101822] p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-100">Przerwano działanie aplikacji</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({hasError: false, message: ''})}
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              <RefreshCw className="h-4 w-4" />
              Przywróć aplikację
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
