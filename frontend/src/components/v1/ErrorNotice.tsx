/**
 * ErrorNotice Component - v1
 * 
 * Standardized domain error presenter for Stellarcade frontend.
 * Renders mapped domain errors with safe user-facing messaging,
 * retry/dismiss actions, and optional debug metadata.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppError, ApiErrorDetails } from '../../types/errors';
import {
  isBannerDismissed,
  persistBannerDismissal,
} from '../../services/global-state-store';
import {
  ErrorNoticeData,
  ErrorNoticeOptions,
  normalizeErrorForDisplay,
  getErrorSeverityClasses,
  getErrorSeverityIcon,
  shouldAutoDismiss,
  getAutoDismissDelay,
  createFallbackErrorNotice,
} from '../../utils/v1/errorMapper';

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface ErrorNoticeProps {
  /** The error to display (AppError or unknown error) */
  error?: AppError | unknown;
  /** Custom options for error normalization */
  options?: ErrorNoticeOptions;
  /** Callback when retry button is clicked */
  onRetry?: () => void | Promise<void>;
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;
  /** Whether to show the dismiss button */
  showDismiss?: boolean;
  /** Whether to show the retry button (when retryable) */
  showRetry?: boolean;
  /** Whether to auto-dismiss retryable errors */
  autoDismiss?: boolean;
  /** Custom className for the error notice */
  className?: string;
  /** Test ID for testing */
  testId?: string;
  /** Whether component is visible (for controlled usage) */
  visible?: boolean;
  /** Persist dismissals across reloads for this notice (default: false). */
  persistDismissal?: boolean;
  /** Stable key used to store dismissal state when persisted. */
  dismissalKey?: string;
  /** Versioned identity used to reset persisted dismissals for new messages. */
  dismissalIdentity?: string;
}

// ---------------------------------------------------------------------------
// Internal Components
// ---------------------------------------------------------------------------

interface DebugInfoProps {
  debug: NonNullable<ErrorNoticeData['debug']>;
  testId?: string;
}

const DebugInfo: React.FC<DebugInfoProps> = ({ debug, testId }) => {
  if (!debug) return null;

  return (
    <details 
      className="error-notice__debug" 
      data-testid={testId ? `${testId}-debug` : 'error-notice-debug'}
    >
      <summary className="error-notice__debug-summary">Debug Info</summary>
      <div className="error-notice__debug-content">
        {!!debug.originalError && (
          <div className="error-notice__debug-section">
            <strong>Original Error:</strong>
            <pre 
              className="error-notice__debug-pre"
              data-testid={testId ? `${testId}-debug-original` : 'error-notice-debug-original'}
            >
              {debug.originalError instanceof Error
                ? debug.originalError.stack || debug.originalError.message
                : JSON.stringify(debug.originalError, null, 2)
              }
            </pre>
          </div>
        )}        {debug.context && Object.keys(debug.context).length > 0 && (
          <div className="error-notice__debug-section">
            <strong>Context:</strong>
            <pre className="error-notice__debug-pre">
              {JSON.stringify(debug.context, null, 2)}
            </pre>
          </div>
        )}
        {debug.retryAfterMs && (
          <div className="error-notice__debug-section">
            <strong>Retry After:</strong> {debug.retryAfterMs}ms
          </div>
        )}
      </div>
    </details>
  );
};

// ---------------------------------------------------------------------------
// API Error Details
// ---------------------------------------------------------------------------

interface ApiErrorDetailsSectionProps {
  details: ApiErrorDetails;
  testId?: string;
}

const ApiErrorDetailsSection: React.FC<ApiErrorDetailsSectionProps> = ({ details, testId }) => {
  const hasContent = details.errorCode || details.requestId || (details.fieldErrors && details.fieldErrors.length > 0);
  if (!hasContent) return null;

  return (
    <details
      className="error-notice__api-details"
      data-testid={testId ? `${testId}-api-details` : 'error-notice-api-details'}
    >
      <summary className="error-notice__debug-summary">Error Details</summary>
      <div className="error-notice__debug-content">
        {details.errorCode && (
          <div className="error-notice__debug-section">
            <strong>Error Code:</strong> {details.errorCode}
          </div>
        )}
        {details.requestId && (
          <div className="error-notice__debug-section">
            <strong>Request ID:</strong>{' '}
            <code data-testid={testId ? `${testId}-request-id` : 'error-notice-request-id'}>
              {details.requestId}
            </code>
          </div>
        )}
        {details.fieldErrors && details.fieldErrors.length > 0 && (
          <div className="error-notice__debug-section">
            <strong>Field Errors:</strong>
            <ul className="error-notice__field-errors">
              {details.fieldErrors.map((fe, i) => (
                <li key={`${fe.field}-${i}`}>
                  <strong>{fe.field}:</strong> {fe.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ErrorNotice: React.FC<ErrorNoticeProps> = ({
  error,
  options = {},
  onRetry,
  onDismiss,
  showDismiss = true,
  showRetry = true,
  autoDismiss = false,
  className = '',
  testId = 'error-notice',
  visible = true,
  persistDismissal = false,
  dismissalKey = 'error-notice',
  dismissalIdentity,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Normalize error data
  const errorData: ErrorNoticeData | null = useMemo(() => {
    if (!error) return null;
    
    try {
      if (error && typeof error === 'object' && 'code' in error && 'domain' in error) {
        return normalizeErrorForDisplay(error as AppError, options);
      }
      return createFallbackErrorNotice(error);
    } catch (e) {
      return createFallbackErrorNotice(error);
    }
  }, [error, options]);

  const resolvedDismissalIdentity =
    dismissalIdentity ??
    (errorData
      ? `${errorData.domain}:${errorData.code}:${errorData.message}`
      : 'no-error');

  // Handle visibility changes
  useEffect(() => {
    if (!visible || !errorData) {
      setIsVisible(false);
      return;
    }
    if (persistDismissal) {
      setIsVisible(!isBannerDismissed(dismissalKey, resolvedDismissalIdentity));
      return;
    }
    setIsVisible(true);
  }, [visible, errorData, persistDismissal, dismissalKey, resolvedDismissalIdentity]);

  // Handle dismiss action
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    if (persistDismissal) {
      persistBannerDismissal(dismissalKey, resolvedDismissalIdentity, true);
    }
    onDismiss?.();
  }, [onDismiss, persistDismissal, dismissalKey, resolvedDismissalIdentity]);

  // Handle retry action
  const handleRetry = useCallback(async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry]);

  // Auto-dismiss logic
  useEffect(() => {
    if (!isVisible || !errorData || !autoDismiss) return;

    const shouldAuto = error && typeof error === 'object' && 'code' in error && 'domain' in error
      ? shouldAutoDismiss(error as AppError)
      : false;

    if (!shouldAuto) return;

    const delay = error && typeof error === 'object' && 'code' in error && 'domain' in error
      ? getAutoDismissDelay(error as AppError)
      : 0;

    if (delay > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, delay);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isVisible, errorData, autoDismiss, error, handleDismiss]);

  // Don't render if no error or not visible
  if (!errorData || !isVisible) {
    return null;
  }

  // Validate error data
  if (!errorData.message || !errorData.severity || !errorData.code) {
    return null;
  }

  const severityClasses = getErrorSeverityClasses(errorData.severity);
  const iconClass = getErrorSeverityIcon(errorData.severity);
  const combinedClasses = `${severityClasses} ${className}`.trim();

  return (
    <div 
      className={combinedClasses}
      data-testid={testId}
      data-error-code={errorData.code}
      data-error-severity={errorData.severity}
      data-error-domain={errorData.domain}
    >
      {/* Icon */}
      <div className="error-notice__icon" aria-hidden="true">
        <span className={`icon icon--${iconClass}`} />
      </div>

      {/* Content */}
      <div className="error-notice__content">
        <div className="error-notice__message" role="alert">
          {errorData.message}
        </div>
        
        {errorData.action && (
          <div className="error-notice__action">
            {errorData.action}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="error-notice__actions">
        {showRetry && errorData.canRetry && onRetry && (
          <button
            type="button"
            className="error-notice__retry-button"
            onClick={handleRetry}
            disabled={isRetrying}
            data-testid={testId ? `${testId}-retry` : 'error-notice-retry'}
            aria-label="Retry action"
          >
            {isRetrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
        
        {showDismiss && onDismiss && (
          <button
            type="button"
            className="error-notice__dismiss-button"
            onClick={handleDismiss}
            data-testid={testId ? `${testId}-dismiss` : 'error-notice-dismiss'}
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>

      {/* Structured API Error Details */}
      {error && typeof error === 'object' && 'apiDetails' in error && (error as AppError).apiDetails && (
        <ApiErrorDetailsSection details={(error as AppError).apiDetails!} testId={testId} />
      )}

      {/* Debug Information */}
      {errorData.debug && (
        <DebugInfo debug={errorData.debug} testId={testId} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Default Props
// ---------------------------------------------------------------------------

ErrorNotice.displayName = 'ErrorNotice';

// ---------------------------------------------------------------------------
// Component Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create an ErrorNotice for network errors with retry functionality.
 */
export const NetworkErrorNotice: React.FC<Omit<ErrorNoticeProps, 'error'>> = (props) => {
  const networkError: AppError = {
    code: 'RPC_NODE_UNAVAILABLE',
    domain: 'rpc' as const,
    severity: 'retryable' as const,
    message: 'Network error occurred',
  };

  return (
    <ErrorNotice
      error={networkError}
      showRetry={true}
      autoDismiss={false}
      {...props}
    />
  );
};

/**
 * Create an ErrorNotice for wallet connection errors.
 */
export const WalletErrorNotice: React.FC<Omit<ErrorNoticeProps, 'error'>> = (props) => {
  const walletError: AppError = {
    code: 'WALLET_NOT_CONNECTED',
    domain: 'wallet' as const,
    severity: 'user_actionable' as const,
    message: 'Wallet not connected',
  };

  return (
    <ErrorNotice
      error={walletError}
      showRetry={false}
      autoDismiss={false}
      {...props}
    />
  );
};

/**
 * Create an ErrorNotice for validation errors.
 */
export const ValidationErrorNotice: React.FC<Omit<ErrorNoticeProps, 'error'>> = (props) => {
  const validationError: AppError = {
    code: 'API_VALIDATION_ERROR',
    domain: 'api' as const,
    severity: 'user_actionable' as const,
    message: 'Validation error occurred',
  };

  return (
    <ErrorNotice
      error={validationError}
      showRetry={false}
      autoDismiss={false}
      {...props}
    />
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default ErrorNotice;
