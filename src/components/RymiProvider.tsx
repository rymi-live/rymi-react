import React, { useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useRoomContext, useLocalParticipant } from '@livekit/components-react';
import { ConnectionState, RoomEvent, type AudioCaptureOptions, type Participant, type RoomOptions } from 'livekit-client';

import {
    EMPTY_TRANSCRIPT,
    applyTranscriptPacket,
    markAgentSpeaking,
    parseTranscriptPacket,
    type LiveTranscript,
    type TranscriptEntry,
} from '@rymi/web';

/** Public name for a rendered transcript row in this SDK. */
export type LiveTranscriptEntry = TranscriptEntry;

/**
 * Transport-level acoustic echo cancellation for the WebRTC path.
 *
 * Pipecat's reference demos "just work" against call-start echo because the
 * Daily transport runs AEC before STT. Our equivalent is the browser's own
 * WebRTC echo canceller on the published mic track — it knows what the page is
 * playing (the agent's TTS via <RoomAudioRenderer>) and subtracts it from the
 * captured mic signal before it ever reaches the gateway/STT.
 *
 * livekit-client already defaults these to `true`, but we pin them explicitly
 * so the behaviour survives livekit-client default changes and is an intentional,
 * documented contract rather than an implicit one. This is defense-in-depth: the
 * server-side first-bot-speech input mute already covers the un-converged-AEC
 * window at call start (call c5eff978); this keeps echo suppressed for the rest
 * of the call. Consumers can override via the `audioCaptureDefaults` prop.
 */
const ECHO_CANCELLING_AUDIO_DEFAULTS: AudioCaptureOptions = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceIsolation: true,
};

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
export function RymiProvider({ serverUrl, token, connect = true, audio = true, audioCaptureDefaults, children }: RymiProviderProps) {
    const roomOptions = useMemo<RoomOptions>(() => ({
        audioCaptureDefaults: { ...ECHO_CANCELLING_AUDIO_DEFAULTS, ...audioCaptureDefaults },
    }), [audioCaptureDefaults]);

    if (!token || !serverUrl) {
        return <>{children}</>;
    }

    return (
        <LiveKitRoom
            serverUrl={serverUrl}
            token={token}
            connect={connect}
            audio={audio}
            options={roomOptions}
        >
            <RoomAudioRenderer />
            {children}
        </LiveKitRoom>
    );
}

/**
 * Exposes useful hooks to interact with the Rymi Agent.
 * Must be used inside a <RymiProvider>
 */
export function useRymiAgent() {
    const connectionState = useConnectionState();
    const room = useRoomContext();
    const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
    const [transcript, setTranscript] = useState<LiveTranscript>(EMPTY_TRANSCRIPT);
    const [thinkingEntries, setThinkingEntries] = useState<LiveThinkingEntry[]>([]);
    const [toolActivity, setToolActivity] = useState<LiveToolActivity | null>(null);
    const [callError, setCallError] = useState<LiveCallError | null>(null);

    useEffect(() => {
        const handleDataReceived = (payload: Uint8Array) => {
            try {
                const text = new TextDecoder().decode(payload);
                const msg = JSON.parse(text);

                const packet = parseTranscriptPacket(msg);
                if (packet) {
                    setTranscript((current) => applyTranscriptPacket(current, packet));
                    return;
                }

                if ((msg.type === 'thinking' || msg.type === 'status') && typeof msg.text === 'string' && msg.text.trim()) {
                    setThinkingEntries((current) => [
                        ...current,
                        {
                            id: `${Date.now()}-${current.length}`,
                            text: msg.text.trim()
                        }
                    ]);
                    return;
                }

                // Transient tool-activity chip. Unlike `thinking` (append-only),
                // there's at most one active chip: `start` sets it, `end` clears
                // it. A later start while one is active replaces it (parallel
                // tools → last wins); any end clears so the chip never sticks.
                if (msg.type === 'tool_activity') {
                    if (msg.state === 'start') {
                        setToolActivity({
                            tool: typeof msg.tool === 'string' ? msg.tool : '',
                            label: typeof msg.label === 'string' && msg.label.trim() ? msg.label.trim() : 'Working on it…',
                        });
                    } else if (msg.state === 'end') {
                        setToolActivity(null);
                    }
                    return;
                }

                if (msg.type === 'call_error') {
                    setCallError({
                        code: typeof msg.code === 'string' && msg.code.trim() ? msg.code.trim() : 'agent_error',
                        message: typeof msg.message === 'string' && msg.message.trim()
                            ? msg.message.trim()
                            : 'The call failed.'
                    });
                }
            } catch {
                // Ignore non-JSON packets on the data channel.
            }
        };

        room.on(RoomEvent.DataReceived, handleDataReceived);
        return () => {
            room.off(RoomEvent.DataReceived, handleDataReceived);
        };
    }, [room]);

    // Mic denied or missing: LiveKit only reports it as a room event, so surface
    // it through callError instead of leaving a live call nobody can talk on.
    useEffect(() => {
        const handleMediaDevicesError = (err: Error) => {
            setCallError({
                code: 'microphone_unavailable',
                message: err?.name === 'NotAllowedError'
                    ? 'Microphone access is blocked. Allow it in the browser, then try again.'
                    : 'Could not use the microphone. Check that one is connected and free, then try again.',
            });
        };

        room.on(RoomEvent.MediaDevicesError, handleMediaDevicesError);
        return () => {
            room.off(RoomEvent.MediaDevicesError, handleMediaDevicesError);
        };
    }, [room]);

    // Agent "speaking" placeholder: shown while agent audio plays and its text has
    // not arrived yet; the first real text row retires it (liveTranscript.ts).
    useEffect(() => {
        const handleActiveSpeakers = (speakers: Participant[]) => {
            const agentSpeaking = speakers.some((p) => !p.isLocal);
            if (!agentSpeaking) return;
            setTranscript((current) => markAgentSpeaking(current));
        };

        room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
        return () => {
            room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
        };
    }, [room]);

    const toggleMic = async () => {
        if (isMicrophoneEnabled) {
            await localParticipant?.setMicrophoneEnabled(false);
        } else {
            await localParticipant?.setMicrophoneEnabled(true);
        }
    };

    const isConnected = connectionState === ConnectionState.Connected;

    return {
        state: connectionState,
        isConnected,
        isMicrophoneEnabled,
        toggleMic,
        disconnect: () => room.disconnect(),
        transcriptEntries: transcript.entries,
        thinkingEntries,
        toolActivity,
        callError,
        clearCallError: () => setCallError(null),
        clearLiveConversation: () => {
            setTranscript(EMPTY_TRANSCRIPT);
            setThinkingEntries([]);
            setToolActivity(null);
            setCallError(null);
        }
    };
}
