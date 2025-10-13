"use server";

import { NextRequest, NextResponse } from "next/server";
import { v1beta1 as textToSpeech } from "@google-cloud/text-to-speech";

export async function POST(request: NextRequest) {
  try {
    const { segments } = await request.json();

    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json({ error: 'Missing or invalid segments array' }, { status: 400 });
    }

    // Choose two voices and map them to speaker labels so swapping/deleting preserves voice assignment
    const voices = [
      "en-US-Chirp3-HD-Sulafat",
      "en-US-Chirp3-HD-Algenib",
    ];

    const savedFiles: Array<any> = [];
    let combinedScript = '';

    // Create a single TTS client instance
    const ttsClient = new textToSpeech.TextToSpeechClient({ apiKey: process.env.GOOGLE_API_KEY || "" });

    // Map speaker label -> voice name (assign on first encounter)
    const speakerMap: Record<string, string> = {};
    let speakerCount = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || typeof seg.text !== 'string') continue;

      const text = seg.text.replace(/\n/g, ' ').trim();
      if (!text) continue;

      // Append to combined script (double newline between segments)
      combinedScript += text + '\n\n';

      // Determine voice based on speaker label if provided, otherwise fallback to alternating
      let voiceName: string;
      const label = seg.speaker && typeof seg.speaker === 'string' ? seg.speaker : null;
      if (label) {
        if (!speakerMap[label]) {
          // assign next available voice to this speaker (wrap if more speakers than voices)
          speakerMap[label] = voices[speakerCount % voices.length];
          speakerCount++;
        }
        voiceName = speakerMap[label];
      } else {
        voiceName = voices[i % voices.length];
      }

      const requestTTS = {
        input: { text },
        voice: { languageCode: 'en-US', name: voiceName },
        audioConfig: { audioEncoding: 'MP3' as const },
      };

      try {
        const [response] = await ttsClient.synthesizeSpeech(requestTTS);

        if (!response || !response.audioContent) {
          console.error(`No audio content for segment ${i}`);
          continue;
        }

        const base64Audio = Buffer.from(response.audioContent as Uint8Array).toString('base64');

        savedFiles.push({
          index: i,
          speaker: label || null,
          audioData: base64Audio,
          paragraph: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        });
      } catch (err) {
        console.error(`Error synthesizing segment ${i}:`, err);
        // continue to next segment
        continue;
      }
    }

    return NextResponse.json({ script: combinedScript.trim(), savedFiles, audioFiles: savedFiles.length }, { status: 200 });
  } catch (error) {
    console.error('scriptToAudio error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
