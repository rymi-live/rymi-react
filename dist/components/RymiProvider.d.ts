import { default as React } from 'react';
import { ConnectionState, AudioCaptureOptions } from 'livekit-client';
import { TranscriptEntry } from '@rymi/web';

/** Public name for a rendered transcript row in this SDK. */
export type LiveTranscriptEntry = TranscriptEntry;
export interface LiveThinkingEntry {
    id: string;
    text: string;
}
export interface LiveCallError {
    code: string;
    message: string;
}
/**
 * A transient "the agent is doing something" chip shown while a tool call is in
 * flight (e.g. "Checking calendar…"). Set on the tool-activity `start` packet
 * and cleared on `end` — the visual mirror of the spoken stall filler.
 */
export interface LiveToolActivity {
    tool: string;
    label: string;
}
export interface RymiProviderProps {
    /** The WebRTC endpoint (e.g. wss://your-livekit-server) */
    serverUrl: string;
    /** The participant JWT returned by `POST /v1/calls` for a WebRTC participant */
    token: string;
    /** Automatically connect to the room on mount. Defaults to true */
    connect?: boolean;
    /** Automatically prompt for and publish the user's microphone. Defaults to true */
    audio?: boolean;
    /**
     * Microphone capture constraints. Merged over Rymi's echo-cancelling
     * defaults (echoCancellation/noiseSuppression/autoGainControl/voiceIsolation
     * all on). Pass `{ echoCancellation: false }` to opt out of transport AEC.
     */
    audioCaptureDefaults?: AudioCaptureOptions;
    children: React.ReactNode;
}
/**
 * Wraps your application or component inside a LiveKit Room natively connected to the Rymi Gateway.
 */
export declare function RymiProvider({ serverUrl, token, connect, audio, audioCaptureDefaults, children }: RymiProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Exposes useful hooks to interact with the Rymi Agent.
 * Must be used inside a <RymiProvider>
 */
export declare function useRymiAgent(): {
    state: ConnectionState;
    isConnected: boolean;
    isMicrophoneEnabled: boolean;
    toggleMic: () => Promise<void>;
    disconnect: () => Promise<void>;
    transcriptEntries: TranscriptEntry[];
    thinkingEntries: LiveThinkingEntry[];
    toolActivity: LiveToolActivity | null;
    callError: LiveCallError | null;
    clearCallError: () => void;
    clearLiveConversation: () => void;
};
