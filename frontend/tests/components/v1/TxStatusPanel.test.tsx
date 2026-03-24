import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TxStatusPanel } from '../../../src/components/v1/TxStatusPanel';
import { TxPhase } from '../../../src/types/tx-status';

describe('TxStatusPanel', () => {
    const mockHash = 'GABCDEFGHJKLMNPQRSTUVWXYZ234567GABCDEFGHJKLMNPQRSTUVW';
    const mockMeta = {
        hash: mockHash,
        phase: TxPhase.SUBMITTED,
        confirmations: 0,
        submittedAt: 1625097600000, // Fixed timestamp
    };

    it('renders in IDLE state', () => {
        render(<TxStatusPanel phase={TxPhase.IDLE} />);
        expect(screen.getByTestId('tx-status-panel-badge')).toHaveTextContent('IDLE');
        expect(screen.queryByTestId('tx-status-panel-timeline')).not.toBeInTheDocument();
    });

    it('renders timeline and metadata in SUBMITTED state', () => {
        render(<TxStatusPanel phase={TxPhase.SUBMITTED} meta={mockMeta} />);
        expect(screen.getByTestId('tx-status-panel-badge')).toHaveTextContent('SUBMITTED');
        expect(screen.getByTestId('tx-status-panel-timeline')).toBeInTheDocument();
        expect(screen.getByText(/GABCDEFG/)).toBeInTheDocument();
    });

    it('renders error block in FAILED state', () => {
        const mockError = { code: 'tx_timeout', message: 'Timed out polling' };
        render(
            <TxStatusPanel
                phase={TxPhase.FAILED}
                meta={{ ...mockMeta, phase: TxPhase.FAILED }}
                error={mockError as any}
            />
        );
        expect(screen.getByTestId('tx-status-panel-badge')).toHaveTextContent('FAILED');
        expect(screen.getByTestId('tx-status-panel-error')).toBeInTheDocument();
        expect(screen.getByText(/tx_timeout/)).toBeInTheDocument();
        expect(screen.getByText(/Timed out polling/)).toBeInTheDocument();
    });

    it('handles compact mode by hiding metadata', () => {
        render(<TxStatusPanel phase={TxPhase.SUBMITTED} meta={mockMeta} compact={true} />);
        expect(screen.queryByTestId('tx-status-panel-meta')).not.toBeInTheDocument();
        expect(screen.getByTestId('tx-status-panel-timeline')).toBeInTheDocument();
    });

    it('triggers explorer callback when clicked', () => {
        const onExplorerLink = vi.fn();
        render(
            <TxStatusPanel
                phase={TxPhase.CONFIRMED}
                meta={{ ...mockMeta, phase: TxPhase.CONFIRMED }}
                onExplorerLink={onExplorerLink}
            />
        );

        const btn = screen.getByTestId('tx-status-panel-explorer-btn');
        fireEvent.click(btn);
        expect(onExplorerLink).toHaveBeenCalledWith(mockHash);
    });

    it('shows settled timestamp when confirmed', () => {
        const settledAt = 1625097660000;
        render(
            <TxStatusPanel
                phase={TxPhase.CONFIRMED}
                meta={{ ...mockMeta, phase: TxPhase.CONFIRMED, settledAt }}
            />
        );
        expect(screen.getByText(/Settled/)).toBeInTheDocument();
    });
});
