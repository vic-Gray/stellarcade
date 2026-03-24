import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionToolbar, ToolbarAction } from '../../../src/components/v1/ActionToolbar';

describe('ActionToolbar', () => {
    const mockActions: ToolbarAction[] = [
        { id: '1', label: 'Primary', onClick: vi.fn(), intent: 'primary' },
        { id: '2', label: 'Secondary', onClick: vi.fn(), intent: 'secondary' },
        { id: '3', label: 'Tertiary', onClick: vi.fn(), intent: 'tertiary' },
    ];

    it('renders all actions with correct labels', () => {
        render(<ActionToolbar actions={mockActions} />);
        expect(screen.getByText('Primary')).toBeInTheDocument();
        expect(screen.getByText('Secondary')).toBeInTheDocument();
        expect(screen.getByText('Tertiary')).toBeInTheDocument();
    });

    it('triggers onClick when an action is clicked', () => {
        render(<ActionToolbar actions={mockActions} />);
        fireEvent.click(screen.getByText('Primary'));
        expect(mockActions[0].onClick).toHaveBeenCalled();
    });

    it('does not trigger onClick when an action is disabled', () => {
        const disabledAction: ToolbarAction = {
            id: '4', label: 'Disabled', onClick: vi.fn(), isDisabled: true
        };
        render(<ActionToolbar actions={[disabledAction]} />);

        const btn = screen.getByRole('button');
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(disabledAction.onClick).not.toHaveBeenCalled();
    });

    it('renders loading state and disables interaction', () => {
        const loadingAction: ToolbarAction = {
            id: '5', label: 'Loading', onClick: vi.fn(), isLoading: true
        };
        render(<ActionToolbar actions={[loadingAction]} />);

        const btn = screen.getByRole('button');
        expect(btn).toBeDisabled();
        expect(btn.querySelector('.stellarcade-toolbar-spinner')).toBeInTheDocument();
        fireEvent.click(btn);
        expect(loadingAction.onClick).not.toHaveBeenCalled();
    });

    it('renders with vertical orientation', () => {
        render(<ActionToolbar actions={mockActions} orientation="vertical" />);
        const toolbar = screen.getByRole('toolbar');
        expect(toolbar).toHaveClass('stellarcade-action-toolbar--vertical');
    });

    it('handles keyboard navigation - ArrowRight', () => {
        render(<ActionToolbar actions={mockActions} />);
        const buttons = screen.getAllByRole('button');

        buttons[0].focus();
        fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });

        // In JSDOM we check which element has focus
        expect(document.activeElement).toBe(buttons[1]);
    });

    it('handles keyboard navigation - ArrowLeft (wrap-around)', () => {
        render(<ActionToolbar actions={mockActions} />);
        const buttons = screen.getAllByRole('button');

        buttons[0].focus();
        fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' });

        expect(document.activeElement).toBe(buttons[2]);
    });

    it('returns null if no actions are provided', () => {
        const { container } = render(<ActionToolbar actions={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders icons when provided', () => {
        const actionWithIcon: ToolbarAction = {
            id: '6', label: 'Icon', onClick: vi.fn(), icon: <span data-testid="test-icon">🚀</span>
        };
        render(<ActionToolbar actions={[actionWithIcon]} />);
        expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });
});
