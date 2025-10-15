"use server";

import { NextRequest, NextResponse } from "next/server";
import { v1beta1 as textToSpeech } from "@google-cloud/text-to-speech";

export async function POST(request: NextRequest) {
  try {
  const { segments, voiceMode = 0, speaker1Voice, speaker2Voice } = await request.json();

    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json({ error: 'Missing or invalid segments array' }, { status: 400 });
    }

    // Choose two voices and map them to speaker labels so swapping/deleting preserves voice assignment
    let voices = [
      "en-US-Chirp3-HD-Sulafat",
      "en-US-Chirp3-HD-Algenib",
    ];

    // If fixed voices requested and both voices provided, use them in order
    if ((voiceMode === 1 || voiceMode === 2) && speaker1Voice && speaker2Voice) {
      voices = [speaker1Voice, speaker2Voice];
    } else if (voiceMode === 0) {
      // randomize default voices for variety
      voices = voices.sort(() => 0.5 - Math.random()).slice(0, 2);
    }

    const savedFiles: Array<any> = [];
    let combinedScript = '';

    // Create a single TTS client instance
    const ttsClient = new textToSpeech.TextToSpeechClient({ apiKey: process.env.GOOGLE_API_KEY || "" });

    // Simple sleep helper for retries
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    // Retry wrapper with exponential backoff
    const synthesizeWithRetries = async (requestObj: any, attempts = 3) => {
      let attempt = 0;
      while (attempt < attempts) {
        try {
          const [response] = await ttsClient.synthesizeSpeech(requestObj);
          return response;
        } catch (err) {
          attempt++;
          if (attempt >= attempts) throw err;
          const backoff = 100 * Math.pow(2, attempt) + Math.random() * 50;
          await sleep(backoff);
        }
      }
      throw new Error('Unreachable');
    };

    // Map speaker label -> voice name (assign on first encounter)
    const speakerMap: Record<string, string> = {};
    let speakerCount = 0;

    // Prepare items to synthesize so we can process them in parallel batches
    const items: Array<{ index: number; text: string; label: string | null; voiceName?: string }> = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || typeof seg.text !== 'string') continue;

      const text = seg.text.replace(/\n/g, ' ').trim();
      if (!text) continue;

      // Append to combined script (double newline between segments)
      combinedScript += text + '\n\n';

      const label = seg.speaker && typeof seg.speaker === 'string' ? seg.speaker : null;
      items.push({ index: i, text, label });
    }

    // Assign voices deterministically for labeled speakers, otherwise alternate by index
    for (const it of items) {
      if (it.label) {
        if (!speakerMap[it.label]) {
          speakerMap[it.label] = voices[speakerCount % voices.length];
          speakerCount++;
        }
        it.voiceName = speakerMap[it.label];
      } else {
        it.voiceName = voices[it.index % voices.length];
      }
    }

    // Process TTS in parallel with limited concurrency
    const concurrency = 4;
    for (let start = 0; start < items.length; start += concurrency) {
      const batch = items.slice(start, start + concurrency).map((it) =>
        (async () => {
          const requestTTS = {
            input: { text: it.text },
            voice: { languageCode: 'en-US', name: it.voiceName },
            audioConfig: { audioEncoding: 'MP3' as const },
          };
          try {
            const response = await synthesizeWithRetries(requestTTS, 3);
            if (!response || !response.audioContent) {
              console.error(`No audio content for segment ${it.index}`);
              return null;
            }
            const base64Audio = Buffer.from(response.audioContent as Uint8Array).toString('base64');
            return {
              index: it.index,
              speaker: it.label || null,
              audioData: base64Audio,
              paragraph: it.text.substring(0, 100) + (it.text.length > 100 ? '...' : ''),
            };
          } catch (err) {
            console.error(`Error synthesizing segment ${it.index}:`, err);
            return null;
          }
        })()
      );

      const results = await Promise.all(batch);
      for (const r of results) {
        if (r) savedFiles.push(r);
      }
    }

    return NextResponse.json({ script: combinedScript.trim(), savedFiles, audioFiles: savedFiles.length }, { status: 200 });
  } catch (error) {
    console.error('scriptToAudio error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
