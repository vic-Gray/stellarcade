/**
 * ErrorNotice Component Tests - Simplified
 *
 * Basic unit tests for ErrorNotice component functionality
 */

import { ErrorNotice } from "@/components/v1/ErrorNotice";
import { AppError, ErrorDomain, ErrorSeverity } from "@/types/errors";
import { fireEvent, render, screen } from "@testing-library/react";

// Simple test to verify component works
describe("ErrorNotice", () => {
  it("should render null when no error is provided", () => {
    const { container } = render(<ErrorNotice />);
    expect(container.firstChild).toBeNull();
  });

  it("should render error message correctly", () => {
    const error: AppError = {
      code: "WALLET_NOT_CONNECTED",
      domain: ErrorDomain.WALLET,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Wallet not connected",
    };

    render(<ErrorNotice error={error} />);

    const alertElement = screen.getByRole("alert");
    expect(alertElement).toBeInTheDocument();
    expect(alertElement).toHaveTextContent("Wallet not connected");
  });

  it("should show retry button for retryable errors", () => {
    const error: AppError = {
      code: "RPC_NODE_UNAVAILABLE",
      domain: ErrorDomain.RPC,
      severity: ErrorSeverity.RETRYABLE,
      message: "Network error",
    };

    const onRetry = vi.fn();
    render(<ErrorNotice error={error} onRetry={onRetry} />);

    const retryButton = screen.getByTestId("error-notice-retry");
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toHaveTextContent("Retry");
  });

  it("should call onRetry when retry button is clicked", () => {
    const error: AppError = {
      code: "RPC_NODE_UNAVAILABLE",
      domain: ErrorDomain.RPC,
      severity: ErrorSeverity.RETRYABLE,
      message: "Network error",
    };

    const onRetry = vi.fn();
    render(<ErrorNotice error={error} onRetry={onRetry} />);

    const retryButton = screen.getByTestId("error-notice-retry");
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should show dismiss button when onDismiss is provided", () => {
    const error: AppError = {
      code: "API_VALIDATION_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Validation error",
    };

    const onDismiss = vi.fn();
    render(<ErrorNotice error={error} onDismiss={onDismiss} />);

    const dismissButton = screen.getByTestId("error-notice-dismiss");
    expect(dismissButton).toBeInTheDocument();
    expect(dismissButton).toHaveTextContent("×");
  });

  it("should call onDismiss when dismiss button is clicked", () => {
    const error: AppError = {
      code: "API_VALIDATION_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Validation error",
    };

    const onDismiss = vi.fn();
    render(<ErrorNotice error={error} onDismiss={onDismiss} />);

    const dismissButton = screen.getByTestId("error-notice-dismiss");
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should apply correct CSS classes based on severity", () => {
    const error: AppError = {
      code: "WALLET_NOT_CONNECTED",
      domain: ErrorDomain.WALLET,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Wallet not connected",
    };

    render(<ErrorNotice error={error} className="custom-class" />);

    const errorElement = screen.getByTestId("error-notice");
    expect(errorElement).toHaveClass("error-notice");
    expect(errorElement).toHaveClass("error-notice--user-actionable");
    expect(errorElement).toHaveClass("custom-class");
  });

  it("should include data attributes for testing", () => {
    const error: AppError = {
      code: "API_VALIDATION_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Validation failed",
    };

    render(<ErrorNotice error={error} testId="custom-error-notice" />);

    const errorElement = screen.getByTestId("custom-error-notice");
    expect(errorElement).toHaveAttribute(
      "data-error-code",
      "API_VALIDATION_ERROR",
    );
    expect(errorElement).toHaveAttribute(
      "data-error-severity",
      "user_actionable",
    );
    expect(errorElement).toHaveAttribute("data-error-domain", "api");
  });

  it("should render compact without api details when none provided", () => {
    const error: AppError = {
      code: "API_SERVER_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.RETRYABLE,
      message: "Server error",
    };

    render(<ErrorNotice error={error} onRetry={vi.fn()} />);
    expect(screen.queryByTestId("error-notice-api-details")).not.toBeInTheDocument();
  });

  it("should render expandable api error details when provided", () => {
    const error: AppError = {
      code: "API_VALIDATION_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.USER_ACTIONABLE,
      message: "Validation error",
      apiDetails: {
        errorCode: "VALIDATION_FAILED",
        requestId: "req-abc-123",
        fieldErrors: [
          { field: "amount", message: "Must be positive" },
        ],
      },
    };

    render(<ErrorNotice error={error} onDismiss={vi.fn()} />);

    const details = screen.getByTestId("error-notice-api-details");
    expect(details).toBeInTheDocument();
    expect(screen.getByText("VALIDATION_FAILED")).toBeInTheDocument();
    expect(screen.getByTestId("error-notice-request-id")).toHaveTextContent("req-abc-123");
    expect(screen.getByText("Must be positive")).toBeInTheDocument();
  });

  it("should omit api details section when apiDetails has no content", () => {
    const error: AppError = {
      code: "API_SERVER_ERROR",
      domain: ErrorDomain.API,
      severity: ErrorSeverity.RETRYABLE,
      message: "Server error",
      apiDetails: {},
    };

    render(<ErrorNotice error={error} onRetry={vi.fn()} />);
    expect(screen.queryByTestId("error-notice-api-details")).not.toBeInTheDocument();
  });
});
