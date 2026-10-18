import { jsx as E, Fragment as x, jsxs as T } from "react/jsx-runtime";
import { useMemo as b, useState as u, useEffect as g } from "react";
import { LiveKitRoom as D, RoomAudioRenderer as M, useConnectionState as _, useRoomContext as w, useLocalParticipant as L } from "@livekit/components-react";
import { RoomEvent as s, ConnectionState as N } from "livekit-client";
import { ConnectionState as q } from "livekit-client";
import { EMPTY_TRANSCRIPT as v, parseTranscriptPacket as I, applyTranscriptPacket as O, markAgentSpeaking as P } from "@rymi/web";
const j = {
  echoCancellation: !0,
  noiseSuppression: !0,
  autoGainControl: !0,
  voiceIsolation: !0
};
function K({ serverUrl: a, token: t, connect: o = !0, audio: c = !0, audioCaptureDefaults: l, children: i }) {
  const d = b(() => ({
    audioCaptureDefaults: { ...j, ...l }
  }), [l]);
  return !t || !a ? /* @__PURE__ */ E(x, { children: i }) : /* @__PURE__ */ T(
    D,
    {
      serverUrl: a,
      token: t,
      connect: o,
      audio: c,
      options: d,
      children: [
        /* @__PURE__ */ E(M, {}),
        i
      ]
    }
  );
}
function U() {
  const a = _(), t = w(), { localParticipant: o, isMicrophoneEnabled: c } = L(), [l, i] = u(v), [d, h] = u([]), [k, f] = u(null), [S, m] = u(null);
  g(() => {
    const n = (r) => {
      try {
        const y = new TextDecoder().decode(r), e = JSON.parse(y), C = I(e);
        if (C) {
          i((p) => O(p, C));
          return;
        }
        if ((e.type === "thinking" || e.type === "status") && typeof e.text == "string" && e.text.trim()) {
          h((p) => [
            ...p,
            {
              id: `${Date.now()}-${p.length}`,
              text: e.text.trim()
            }
          ]);
          return;
        }
        if (e.type === "tool_activity") {
          e.state === "start" ? f({
            tool: typeof e.tool == "string" ? e.tool : "",
            label: typeof e.label == "string" && e.label.trim() ? e.label.trim() : "Working on it…"
          }) : e.state === "end" && f(null);
          return;
        }
        e.type === "call_error" && m({
          code: typeof e.code == "string" && e.code.trim() ? e.code.trim() : "agent_error",
          message: typeof e.message == "string" && e.message.trim() ? e.message.trim() : "The call failed."
        });
      } catch {
      }
    };
    return t.on(s.DataReceived, n), () => {
      t.off(s.DataReceived, n);
    };
  }, [t]), g(() => {
    const n = (r) => {
      m({
        code: "microphone_unavailable",
        message: (r == null ? void 0 : r.name) === "NotAllowedError" ? "Microphone access is blocked. Allow it in the browser, then try again." : "Could not use the microphone. Check that one is connected and free, then try again."
      });
    };
    return t.on(s.MediaDevicesError, n), () => {
      t.off(s.MediaDevicesError, n);
    };
  }, [t]), g(() => {
    const n = (r) => {
      r.some((e) => !e.isLocal) && i((e) => P(e));
    };
    return t.on(s.ActiveSpeakersChanged, n), () => {
      t.off(s.ActiveSpeakersChanged, n);
    };
  }, [t]);
  const A = async () => {
    c ? await (o == null ? void 0 : o.setMicrophoneEnabled(!1)) : await (o == null ? void 0 : o.setMicrophoneEnabled(!0));
  }, R = a === N.Connected;
  return {
    state: a,
    isConnected: R,
    isMicrophoneEnabled: c,
    toggleMic: A,
    disconnect: () => t.disconnect(),
    transcriptEntries: l.entries,
    thinkingEntries: d,
    toolActivity: k,
    callError: S,
    clearCallError: () => m(null),
    clearLiveConversation: () => {
      i(v), h([]), f(null), m(null);
    }
  };
}
export {
  q as ConnectionState,
  K as RymiProvider,
  U as useRymiAgent
};
//# sourceMappingURL=index.mjs.map
