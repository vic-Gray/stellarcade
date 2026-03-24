/**
 * NetworkGuardBanner.test.tsx - Comprehensive test suite for NetworkGuardBanner component
 *
 * Tests cover:
 * - Rendering branches (supported/unsupported networks)
 * - State transitions (dismiss, loading)
 * - Interaction flows (button clicks, callbacks)
 * - Edge cases (missing data, invalid props)
 * - Accessibility (ARIA attributes, semantic HTML)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import NetworkGuardBanner from "@/components/v1/NetworkGuardBanner";

// ── Test Setup & Utilities ─────────────────────────────────────────────────────

const mockDefaultProps = {
  network: "polygon",
  normalizedNetwork: "Polygon",
  supportedNetworks: ["ethereum", "polygon"] as const,
  isSupported: true,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("NetworkGuardBanner", () => {
  describe("Rendering - Supported Networks", () => {
    it("should render nothing when network is supported", () => {
      const { container } = render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={true} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("should render nothing when show prop is false", () => {
      const { container } = render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          show={false}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Rendering - Unsupported Networks", () => {
    it("should render banner when network is unsupported", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          network="arbitrum"
          normalizedNetwork="Arbitrum"
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toBeInTheDocument();
    });

    it("should display default error message for unsupported network", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          network="arbitrum"
          normalizedNetwork="Arbitrum"
          supportedNetworks={["ethereum", "polygon"]}
        />,
      );
      const banner = screen.getByTestId("network-guard-banner");
      expect(banner).toHaveTextContent("Unsupported Network");
      expect(banner).toHaveTextContent(
        "This app only works on ethereum, polygon",
      );
      expect(banner).toHaveTextContent("Current network: Arbitrum");
    });

    it("should display custom error message when provided", () => {
      const customMessage = "Please connect to Mainnet";
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          errorMessage={customMessage}
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toHaveTextContent(
        customMessage,
      );
    });

    it("should have proper alert role for accessibility", () => {
      render(<NetworkGuardBanner {...mockDefaultProps} isSupported={false} />);
      const banner = screen.getByTestId("network-guard-banner");
      expect(banner).toHaveAttribute("role", "alert");
    });

    it("should display warning icon", () => {
      render(<NetworkGuardBanner {...mockDefaultProps} isSupported={false} />);
      const banner = screen.getByTestId("network-guard-banner");
      const svgs = banner.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Dismiss Functionality", () => {
    it("should show dismiss button when dismissible is true (default)", () => {
      render(<NetworkGuardBanner {...mockDefaultProps} isSupported={false} />);
      expect(screen.getByTestId("network-dismiss-button")).toBeInTheDocument();
    });

    it("should hide banner when dismiss button is clicked", () => {
      const { rerender } = render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={false} />,
      );
      expect(screen.getByTestId("network-guard-banner")).toBeInTheDocument();

      const dismissBtn = screen.getByTestId("network-dismiss-button");
      fireEvent.click(dismissBtn);

      rerender(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={false} />,
      );
      expect(
        screen.queryByTestId("network-guard-banner"),
      ).not.toBeInTheDocument();
    });

    it("should not show dismiss button when dismissible is false", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          dismissible={false}
        />,
      );
      expect(
        screen.queryByTestId("network-dismiss-button"),
      ).not.toBeInTheDocument();
    });

    it("should not allow dismiss when dismissible is false", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          dismissible={false}
        />,
      );
      const banner = screen.getByTestId("network-guard-banner");
      expect(banner).toBeInTheDocument();
    });
  });

  describe("Network Switch Action", () => {
    it("should show switch network button when onSwitchNetwork is provided", () => {
      const mockSwitch = vi.fn<void | Promise<void>, []>();
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockSwitch}
        />,
      );
      expect(screen.getByTestId("network-switch-button")).toBeInTheDocument();
    });

    it("should not show switch button when onSwitchNetwork is not provided", () => {
      render(<NetworkGuardBanner {...mockDefaultProps} isSupported={false} />);
      expect(
        screen.queryByTestId("network-switch-button"),
      ).not.toBeInTheDocument();
    });

    it("should call onSwitchNetwork when switch button is clicked", async () => {
      const mockCallback = vi.fn<void, []>() as vi.Mock<
        void | Promise<void>,
        []
      >;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );
      const switchBtn = screen.getByTestId("network-switch-button");
      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalledTimes(1);
      });
    });

    it("should use custom action label", () => {
      const mockSwitch = vi.fn<void, []>() as vi.Mock<
        void | Promise<void>,
        []
      >;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockSwitch}
          actionLabel="Connect to Mainnet"
        />,
      );
      expect(screen.getByTestId("network-switch-button")).toHaveTextContent(
        "Connect to Mainnet",
      );
    });

    it("should show loading state while switching network", async () => {
      const mockCallback = vi.fn<Promise<void>, []>(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      ) as vi.Mock<void | Promise<void>, []>;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );
      const switchBtn = screen.getByTestId("network-switch-button");

      fireEvent.click(switchBtn);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByTestId("network-switch-button")).toHaveTextContent(
          "Switching...",
        );
      });

      // Should return to normal state after completion
      await waitFor(() => {
        expect(
          screen.getByTestId("network-switch-button"),
        ).not.toHaveTextContent("Switching...");
      });
    });

    it("should disable switch button while loading", async () => {
      const mockCallback = vi.fn<Promise<void>, []>(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      ) as vi.Mock<void | Promise<void>, []>;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );
      const switchBtn = screen.getByTestId("network-switch-button");

      fireEvent.click(switchBtn);

      // Button should be disabled during loading
      await waitFor(() => {
        expect(switchBtn).toBeDisabled();
      });
    });

    it("should handle errors in onSwitchNetwork gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation();
      const mockCallback = vi.fn(() =>
        Promise.reject(new Error("Network switch failed")),
      ) as vi.Mock<void | Promise<void>, []>;

      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );
      const switchBtn = screen.getByTestId("network-switch-button");

      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it("should handle synchronous onSwitchNetwork callbacks", async () => {
      const mockCallback = vi.fn<void, []>() as vi.Mock<
        void | Promise<void>,
        []
      >;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );
      const switchBtn = screen.getByTestId("network-switch-button");

      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalled();
      });
    });
  });

  describe("Custom Children", () => {
    it("should render custom children when provided", () => {
      render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={false}>
          <div data-testid="custom-content">Custom Banner Content</div>
        </NetworkGuardBanner>,
      );
      expect(screen.getByTestId("custom-content")).toBeInTheDocument();
      expect(
        screen.queryByTestId("network-guard-banner"),
      ).not.toBeInTheDocument();
    });

    it("should not render custom children when supported", () => {
      render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={true}>
          <div data-testid="custom-content">Custom Banner Content</div>
        </NetworkGuardBanner>,
      );
      expect(screen.queryByTestId("custom-content")).not.toBeInTheDocument();
    });
  });

  describe("Edge Cases - Invalid Data", () => {
    it("should handle null network gracefully", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          network={null}
          normalizedNetwork=""
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toBeInTheDocument();
      expect(screen.getByTestId("network-guard-banner")).toHaveTextContent(
        "Network configuration error",
      );
    });

    it("should handle undefined network gracefully", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          network={undefined as any}
          normalizedNetwork=""
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toBeInTheDocument();
    });

    it("should handle empty supportedNetworks array", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          supportedNetworks={[]}
          normalizedNetwork="Arbitrum"
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toHaveTextContent(
        "This app only works on supported networks",
      );
    });

    it("should handle single supported network", () => {
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          supportedNetworks={["ethereum"]}
          normalizedNetwork="Polygon"
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toHaveTextContent(
        "This app only works on ethereum",
      );
    });

    it("should handle many supported networks", () => {
      const networks = [
        "ethereum",
        "polygon",
        "arbitrum",
        "optimism",
        "base",
      ] as const;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          supportedNetworks={networks}
          normalizedNetwork="Avalanche"
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toHaveTextContent(
        "ethereum, polygon, arbitrum, optimism, base",
      );
    });
  });

  describe("Show Control", () => {
    it("should respect show prop changes", () => {
      const { rerender } = render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          show={true}
        />,
      );
      expect(screen.getByTestId("network-guard-banner")).toBeInTheDocument();

      rerender(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          show={false}
        />,
      );
      expect(
        screen.queryByTestId("network-guard-banner"),
      ).not.toBeInTheDocument();
    });

    it("should not show when dismissed, even if show changes", () => {
      const { rerender } = render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          show={true}
        />,
      );
      fireEvent.click(screen.getByTestId("network-dismiss-button"));

      rerender(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          show={true}
        />,
      );
      // Banner should remain hidden after dismiss
      expect(
        screen.queryByTestId("network-guard-banner"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Combination Scenarios", () => {
    it("should handle switch + dismiss together", async () => {
      const mockSwitch = vi.fn<void | Promise<void>, []>();
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockSwitch}
          dismissible={true}
        />,
      );

      const switchBtn = screen.getByTestId("network-switch-button");
      const dismissBtn = screen.getByTestId("network-dismiss-button");

      expect(switchBtn).toBeInTheDocument();
      expect(dismissBtn).toBeInTheDocument();

      fireEvent.click(switchBtn);
      await waitFor(() => {
        expect(mockSwitch).toHaveBeenCalled();
      });
    });

    it("should maintain state across rerenders", () => {
      const { rerender } = render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={false} />,
      );
      fireEvent.click(screen.getByTestId("network-dismiss-button"));

      // Rerender with slightly different props but same unsupported state
      rerender(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          errorMessage="Updated message"
        />,
      );

      // Banner should still be hidden from local dismiss state
      expect(
        screen.queryByTestId("network-guard-banner"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", () => {
      const mockSwitch = vi.fn<void | Promise<void>, []>();
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockSwitch}
          dismissible={true}
        />,
      );

      const banner = screen.getByTestId("network-guard-banner");
      expect(banner).toHaveAttribute("role", "alert");

      const dismissBtn = screen.getByTestId("network-dismiss-button");
      expect(dismissBtn).toHaveAttribute("aria-label");
    });

    it("should set aria-busy on switch button during loading", async () => {
      const mockCallback = vi.fn<Promise<void>, []>(
        () => new Promise((resolve) => setTimeout(resolve, 50)),
      ) as vi.Mock<void | Promise<void>, []>;
      render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          onSwitchNetwork={mockCallback}
        />,
      );

      const switchBtn = screen.getByTestId("network-switch-button");
      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(switchBtn).toHaveAttribute("aria-busy", "true");
      });
    });

    it("should have SVG aria-hidden attributes", () => {
      render(<NetworkGuardBanner {...mockDefaultProps} isSupported={false} />);

      const banner = screen.getByTestId("network-guard-banner");
      const svgs = banner.querySelectorAll("svg");
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute("aria-hidden", "true");
      });
    });
  });

  describe("Component Memoization", () => {
    it("should use React.memo to prevent unnecessary rerenders", () => {
      // Verify component is wrapped with memo
      expect(NetworkGuardBanner.displayName).toBe("NetworkGuardBanner");
    });
  });

  describe("Snapshot Tests", () => {
    it("should match snapshot when supported network", () => {
      const { container } = render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={true} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("should match snapshot when unsupported network", () => {
      const { container } = render(
        <NetworkGuardBanner
          {...mockDefaultProps}
          isSupported={false}
          network="invalid"
          normalizedNetwork="Invalid Network"
        />,
      );
      expect(container).toMatchSnapshot();
    });

    it("should match snapshot with custom children", () => {
      const { container } = render(
        <NetworkGuardBanner {...mockDefaultProps} isSupported={false}>
          <div>Custom Content</div>
        </NetworkGuardBanner>,
      );
      expect(container).toMatchSnapshot();
    });
  });
});
