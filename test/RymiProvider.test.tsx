/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';

import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const livekitMocks = vi.hoisted(() => ({
  room: {
    listeners: new Map<string, Set<(...args: any[]) => void>>(),
    on(event: string, cb: (...args: any[]) => void) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(cb);
      return this;
    },
    off(event: string, cb: (...args: any[]) => void) {
      this.listeners.get(event)?.delete(cb);
      return this;
    },
    emit(event: string, ...args: any[]) {
      for (const cb of this.listeners.get(event) || []) cb(...args);
    },
    removeAllListeners() {
      this.listeners.clear();
    },
    disconnect: vi.fn()
  },
  lastRoomProps: undefined as Record<string, any> | undefined
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children, ...props }: { children: React.ReactNode } & Record<string, any>) => {
    livekitMocks.lastRoomProps = props;
    return <>{children}</>;
  },
  RoomAudioRenderer: () => null,
  useConnectionState: () => 'connected',
  useRoomContext: () => livekitMocks.room,
  useLocalParticipant: () => ({
    localParticipant: { setMicrophoneEnabled: vi.fn() },
    isMicrophoneEnabled: false
  })
}));

vi.mock('livekit-client', () => ({
  ConnectionState: {
    Connected: 'connected'
  },
  RoomEvent: {
    DataReceived: 'dataReceived'
  }
}));

import { RymiProvider, useRymiAgent } from '../src';

function AgentProbe() {
  const agent = useRymiAgent();
  return (
    <div>
      <div data-testid="connected">{String(agent.isConnected)}</div>
      <div data-testid="call-error">{agent.callError?.message ?? 'none'}</div>
      <div data-testid="call-error-code">{agent.callError?.code ?? 'none'}</div>
      <div data-testid="captured-fields">{JSON.stringify((agent as any).capturedFields)}</div>
      <button data-testid="clear-conv" onClick={() => agent.clearLiveConversation()}>Clear</button>
    </div>
  );
}

describe('RymiProvider', () => {
  // Vitest globals are off, so Testing Library does not unmount between tests on its own.
afterEach(cleanup);

beforeEach(() => {
    livekitMocks.room.removeAllListeners();
    livekitMocks.lastRoomProps = undefined;
  });

  it('enables transport-level echo cancellation on the published mic by default', () => {
    render(
      <RymiProvider serverUrl="wss://livekit.example" token="token">
        <AgentProbe />
      </RymiProvider>
    );

    expect(livekitMocks.lastRoomProps?.options?.audioCaptureDefaults).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      voiceIsolation: true
    });
  });

  it('lets consumers opt out of echo cancellation', () => {
    render(
      <RymiProvider
        serverUrl="wss://livekit.example"
        token="token"
        audioCaptureDefaults={{ echoCancellation: false }}
      >
        <AgentProbe />
      </RymiProvider>
    );

    expect(livekitMocks.lastRoomProps?.options?.audioCaptureDefaults?.echoCancellation).toBe(false);
    // Other defaults remain on.
    expect(livekitMocks.lastRoomProps?.options?.audioCaptureDefaults?.noiseSuppression).toBe(true);
  });

  it('surfaces call_error data packets from the gateway', async () => {
    render(
      <RymiProvider serverUrl="wss://livekit.example" token="token">
        <AgentProbe />
      </RymiProvider>
    );

    expect(screen.getByTestId('connected')).toHaveTextContent('true');

    await act(async () => {
      livekitMocks.room.emit(
        'dataReceived',
        new TextEncoder().encode(JSON.stringify({
          type: 'call_error',
          code: 'session_init_failed',
          message: 'The voice session failed. Please try again.'
        }))
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('call-error')).toHaveTextContent('The voice session failed. Please try again.');
    });
    expect(screen.getByTestId('call-error-code')).toHaveTextContent('session_init_failed');
  });

  it('later value replaces earlier for captured_field', async () => {
    render(
      <RymiProvider serverUrl="wss://livekit.example" token="token">
        <AgentProbe />
      </RymiProvider>
    );

    await act(async () => {
      livekitMocks.room.emit(
        'dataReceived',
        new TextEncoder().encode(JSON.stringify({
          type: 'captured_field',
          field: 'budget',
          value: '3 lakh'
        }))
      );
    });

    expect(screen.getByTestId('captured-fields')).toHaveTextContent(
      JSON.stringify([{ field: 'budget', value: '3 lakh' }])
    );

    await act(async () => {
      livekitMocks.room.emit(
        'dataReceived',
        new TextEncoder().encode(JSON.stringify({
          type: 'captured_field',
          field: 'budget',
          value: '5 lakh'
        }))
      );
    });

    expect(screen.getByTestId('captured-fields')).toHaveTextContent(
      JSON.stringify([{ field: 'budget', value: '5 lakh' }])
    );
  });

  it('reset on call start clears captured_field', async () => {
    render(
      <RymiProvider serverUrl="wss://livekit.example" token="token">
        <AgentProbe />
      </RymiProvider>
    );

    await act(async () => {
      livekitMocks.room.emit(
        'dataReceived',
        new TextEncoder().encode(JSON.stringify({
          type: 'captured_field',
          field: 'budget',
          value: '3 lakh'
        }))
      );
    });

    expect(screen.getByTestId('captured-fields')).toHaveTextContent('3 lakh');

    await act(async () => {
      screen.getByTestId('clear-conv').click();
    });

    expect(screen.getByTestId('captured-fields')).toHaveTextContent('[]');
  });

  it('unknown packet types still ignored', async () => {
    render(
      <RymiProvider serverUrl="wss://livekit.example" token="token">
        <AgentProbe />
      </RymiProvider>
    );

    await act(async () => {
      livekitMocks.room.emit(
        'dataReceived',
        new TextEncoder().encode(JSON.stringify({
          type: 'unrecognized_packet_xyz',
          payload: 123
        }))
      );
    });

    expect(screen.getByTestId('call-error')).toHaveTextContent('none');
  });
});

