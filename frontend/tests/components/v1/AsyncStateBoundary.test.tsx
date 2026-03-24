import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AsyncStateBoundary } from '../../../src/components/v1/AsyncStateBoundary';

describe('AsyncStateBoundary', () => {
  it('renders loading branch', () => {
    render(
      <AsyncStateBoundary
        status="loading"
        renderSuccess={() => <div>ok</div>}
      />,
    );

    expect(screen.getByTestId('async-state-boundary-loading')).toBeInTheDocument();
  });

  it('renders error branch and calls retry', () => {
    const onRetry = vi.fn();

    render(
      <AsyncStateBoundary
        status="error"
        error={new Error('boom')}
        onRetry={onRetry}
        renderSuccess={() => <div>ok</div>}
      />,
    );

    fireEvent.click(screen.getByTestId('async-state-boundary-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty when success data is null', () => {
    render(
      <AsyncStateBoundary
        status="success"
        data={null}
        renderSuccess={() => <div>ok</div>}
      />,
    );

    expect(screen.getByTestId('async-state-boundary-empty')).toBeInTheDocument();
  });

  it('renders success branch with data', () => {
    render(
      <AsyncStateBoundary
        status="success"
        data={{ id: '1' }}
        renderSuccess={(data) => <div>{data.id}</div>}
      />,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('uses custom error renderer', () => {
    render(
      <AsyncStateBoundary
        status="error"
        error={new Error('boom')}
        renderError={() => <div>custom</div>}
        renderSuccess={() => <div>ok</div>}
      />,
    );

    expect(screen.getByText('custom')).toBeInTheDocument();
  });
});
