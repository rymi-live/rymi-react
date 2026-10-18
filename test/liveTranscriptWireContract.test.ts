/**
 * Wire-format contract between the gateway relay and the one browser parser.
 *
 * The relay (apps/gateway-pipecat/src/gateway/session/transcript_relay.py)
 * publishes a small closed set of packet types onto the LiveKit data channel.
 * The one browser parser (packages/web/src/liveTranscript.ts) is the only
 * client that may interpret transcript packets. The failure mode this file
 * exists for is that allowlist silently dropping a KNOWN type.
 *
 * So the assertions run against the real source of these files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PARITY_CASES } from '../../../test/fixtures/liveTranscriptCorpus';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const RELAY = read('../../../apps/gateway-pipecat/src/gateway/session/transcript_relay.py');
const BROWSER_PARSER = read('../../web/src/liveTranscript.ts');
const WEB_CALL = read('../../web/src/call.ts');
const SDK_PROVIDER = read('../src/components/RymiProvider.tsx');
const PANEL = read('../../ui/src/components/ui/agent-test-panel.tsx');
const DEMO = read('../../../apps/landing/src/lib/demoCall.ts');

/** Packet types the relay puts on the wire: `{"type": "…"}`. */
const emittedTypes = (source: string) =>
    [...new Set([...source.matchAll(/"type":\s*"([a-z_]+)"/g)].map((m) => m[1]))].sort();

/** Packet types the one browser parser accepts: `m.type === '…'`. */
const parsedTypes = (source: string) =>
    [...new Set([...source.matchAll(/m\.type === '([a-z_]+)'/g)].map((m) => m[1]))].sort();

/**
 * Top-level keys of every `{"type": "<packetType>", …}` dict literal in the
 * relay, whitespace-normalised and brace-matched so reformatting is harmless.
 */
function packetFields(source: string, packetType: string): string[][] {
    const flat = source.replace(/\s+/g, ' ');
    const shapes: string[][] = [];
    for (const match of flat.matchAll(new RegExp(`\\{ ?"type": "${packetType}"`, 'g'))) {
        let depth = 0;
        let end = match.index;
        for (let i = match.index; i < flat.length; i += 1) {
            if (flat[i] === '{' || flat[i] === '(') depth += 1;
            else if (flat[i] === '}' || flat[i] === ')') {
                depth -= 1;
                if (depth === 0) { end = i; break; }
            }
        }
        const body = flat.slice(match.index + 1, end);
        const fields: string[] = [];
        let token = '';
        let nest = 0;
        for (const ch of `${body},`) {
            if ('{(['.includes(ch)) nest += 1;
            else if ('})]'.includes(ch)) nest -= 1;
            if (ch === ',' && nest === 0) {
                const name = token.split(':')[0].trim().replace(/"/g, '');
                if (name) fields.push(name);
                token = '';
            } else {
                token += ch;
            }
        }
        shapes.push(fields.sort());
    }
    return shapes;
}

/** The types that actually carry transcript text into a reducer. */
const TEXT_BEARING = ['transcript', 'transcript_sentence'] as const;

describe('transcriptRelay wire format', () => {
    it('emits exactly this closed set of packet types', () => {
        expect(emittedTypes(RELAY)).toEqual([
            'affect',
            'thinking',
            'tool_activity',
            'transcript',
            'transcript_sentence',
        ]);
    });

    it('the shared corpus only replays packet types the relay can actually emit', () => {
        const inCorpus = [...new Set(PARITY_CASES.flatMap((c) => c.packets.map((p) => p.type)))].sort();
        expect(inCorpus).toEqual([...TEXT_BEARING].sort());
        expect(emittedTypes(RELAY)).toEqual(expect.arrayContaining(inCorpus));
    });

    it('every transcript packet carries exactly role, text, final and turnKey', () => {
        const shapes = packetFields(RELAY, 'transcript');
        expect(shapes).toHaveLength(3);
        for (const fields of shapes) {
            expect(fields).toEqual(['final', 'role', 'text', 'turnKey', 'type']);
        }
    });

    it('every sentence packet carries exactly the karaoke fields', () => {
        expect(packetFields(RELAY, 'transcript_sentence')).toEqual([
            ['final', 'revealedChars', 'role', 'sentenceKey', 'text', 'turnKey', 'type'],
        ]);
    });
});

describe('the one browser parser', () => {
    it('accepts both transcript packet types', () => {
        expect(parsedTypes(BROWSER_PARSER)).toEqual(['transcript', 'transcript_sentence']);
        for (const type of TEXT_BEARING) {
            expect(emittedTypes(RELAY)).toContain(type);
        }
    });

    it('returns null for an unrecognised type instead of throwing', () => {
        expect(BROWSER_PARSER).toContain("if (m.type === 'transcript')");
        expect(BROWSER_PARSER).toContain("if (m.type === 'transcript_sentence'");
        expect(BROWSER_PARSER).toMatch(/return null;/);
        expect(BROWSER_PARSER).not.toMatch(/throw new Error\([^)]*type/);
    });
});

describe('the browser surfaces', () => {
    const flat = (source: string) => source.replace(/\s+/g, ' ');

    it('the karaoke duplicate is dropped in the one module; @rymi/web still re-emits a public transcript event', () => {
        expect(flat(BROWSER_PARSER)).toContain("if (packet.role === 'agent' && t.karaoke) return t;");
        expect(flat(WEB_CALL)).toContain('turnKey: sentence.sentenceKey');
        expect(flat(WEB_CALL)).toContain("this._emit('transcript', event)");
        expect(flat(PANEL)).not.toMatch(/sawKaraokeSentence/);
        expect(flat(PANEL)).toContain("call.on('transcriptChange'");
        expect(flat(DEMO)).not.toMatch(/sawSentence/);
        expect(flat(DEMO)).toContain("case 'transcriptChange'");
    });

    it('CONVERGENCE: every browser surface consumes the one module', () => {
        expect(flat(PANEL)).toContain("call.on('transcriptChange'");
        expect(flat(PANEL)).toContain('applyPersistedRow');
        expect(flat(DEMO)).toContain("case 'transcriptChange'");
        expect(flat(SDK_PROVIDER)).toContain('applyTranscriptPacket');
        expect(flat(SDK_PROVIDER)).toContain('parseTranscriptPacket');
        expect(flat(WEB_CALL)).toContain('applyTranscriptPacket');
        expect(flat(WEB_CALL)).toContain('parseTranscriptPacket');
    });

    it('no client hard-codes providerType — the wire is detected, never configured', () => {
        const codeOnly = (source: string) =>
            source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
        expect(codeOnly(BROWSER_PARSER)).not.toMatch(/providerType|stt_pipeline/);
        expect(codeOnly(PANEL)).not.toMatch(/providerType|stt_pipeline/);
        expect(codeOnly(SDK_PROVIDER)).not.toMatch(/providerType|stt_pipeline/);
        expect(codeOnly(DEMO)).not.toMatch(/providerType|stt_pipeline/);
    });
});
