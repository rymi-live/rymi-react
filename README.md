# @rymi/react

React provider and hook for Rymi voice agents over WebRTC.

```bash
npm install @rymi/react
```

`react` and `react-dom` (18 or later) are peer dependencies.

## Quick start

Create a call with a `webrtc` participant ([`POST /v1/calls`](https://docs.rymi.live/api/calls)), then pass the participant's `access.url` and `access.token` to the provider:

```tsx
import { RymiProvider, useRymiAgent } from '@rymi/react';

function CallControls() {
  const { isConnected, toggleMic, disconnect, transcriptEntries } = useRymiAgent();
  return (
    <div>
      <p>{isConnected ? 'Connected' : 'Connecting…'}</p>
      <button onClick={toggleMic}>Mute or unmute</button>
      <button onClick={disconnect}>Hang up</button>
      <ul>{transcriptEntries.map((e) => <li key={e.id}>{e.role}: {e.text}</li>)}</ul>
    </div>
  );
}

export function VoiceCall({ url, token }: { url: string; token: string }) {
  return (
    <RymiProvider serverUrl={url} token={token}>
      <CallControls />
    </RymiProvider>
  );
}
```

Full reference: https://docs.rymi.live/api/sdk-react
