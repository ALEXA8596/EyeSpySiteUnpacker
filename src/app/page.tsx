"use client";

import React, { useState, useEffect, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import NavBar from "@/components/NavBar";
import {
  LOCALSTORAGE_SEGMENTS_KEY,
  ExportSegment,
  saveSegmentsToLocalStorage,
  loadSegmentsFromLocalStorage,
  downloadJSON,
} from "@/utils/scriptTransfer";
// import "bootstrap/dist/js/bootstrap.bundle.min.js";

type AudioFiles = {
  audioData: string; // Base64 encoded audio data
  fileName: string; // Original file name
  paragraph?: string; // Preview text
};

// Prompt templates moved to module level to avoid SSR issues
const PROMPT_TEMPLATES = {
  accessible: `You are an expert content creator specializing in accessible audio resources for the low vision and blind community. Your goal is to convert written information about "{organizationName}" into a natural, engaging podcast script.

STRICT FORMATTING RULES (CRITICAL):
1. The output must contain ONLY the spoken dialogue.
2. Do NOT use speaker labels (e.g., "Host 1:" or "Speaker A:").
3. Do NOT include titles, scene descriptions, sound effects, or an outline.
4. SEPARATOR: Separate each speaker's turn with a double line break (two empty lines of whitespace). Do NOT write the literal characters "\\n\\n" or any visible separator tags. Just use blank space.
5. Ensure the script starts immediately with the first speaker's voice.

INPUT CONTEXT:
Organization: {organizationName}
Website: {websiteURL}
Email: {email}
Phone: {phoneNumber}
Address: {address}

SOURCE MATERIAL:
"""
INSERTBODIESHERE
"""

HOST PERSONAS (Alternating speakers):
- Speaker A (The Guide): Warm, descriptive, and articulate. Focuses on the "what" and "where."
- Speaker B (The Advocate): Curious and practical. Focuses on the "how" and "why it matters."

CONTENT GUIDELINES:
- ZERO FLUFF START: The very first sentence of the script must explicitly name "{organizationName}" and immediately define what it is. Do NOT use phrases like "Welcome back," "Hello listeners," or "Today we are looking at."
- LANGUAGE & TERMINOLOGY: STRICTLY AVOID the term "visually impaired." Instead, use "low vision," "people with low vision," "the low vision community," or "blind" (only where specifically accurate).
- Tone: Informative, encouraging, and conversational. Avoid overly corporate jargon.
- Accessibility Focus: If the content mentions physical locations or visual elements, describe them clearly. If reading a phone number, group the digits naturally for a listener to memorize (e.g. "five-five-five...").

STRUCTURE:
   1. Immediate Hook: Start directly with the organization name and its core value proposition.
   2. Overview: Summarize what the organization does.
   3. Deep Dive: Discuss specific programs, events, or resources found in the source text. Discuss why this is useful for the low vision community.
   4. Contact Info: Weave the website or phone number naturally into the end of the conversation.
   5. Sign-off: A brief, warm closing.

Generate the script now.`,

  new: `Generate a podcast-style audio overview script based on the provided content for "{organizationName}". The output should be a conversational script between two AI hosts discussing the main points, insights, and implications of the input material. Do not include a separate title line; begin directly with the script content. Do not give the podcast a name. Just start talking about the subject.

Context and contact details (use where helpful, but do not read lists verbatim):
Website: {websiteURL}
Email: {email}
Phone: {phoneNumber}
Address: {address}

INSERTBODIESHERE

Podcast Format:
- Duration: Aim for a 5-7 minute discussion (approximately 750-1,000 words). You may go over this range if necessary to cover important points; use judgment and prioritize clarity and usefulness.
- Style: Informative yet casual, resembling a professional podcast.
- Listener: Busy professionals who want efficient, high-value information.

Host Personas (make these voices clear in tone, but DO NOT label lines):
- Host 1: The "Explainer" — knowledgeable, articulate, breaks down complex concepts.
- Host 2: The "Questioner" — curious, insightful, asks thought-provoking questions.
Maintain a collegial, respectful dynamic with light, friendly banter.

Podcast Structure (follow this structure but feel free to adjust lengths as needed):
1) Outline: Begin with a concise outline of the topics you will cover (a short bullet-style plan).
2) Introduction (~80-100 words): Introduce hosts and the topic; provide a clear hook.
3) Overview (~150-200 words): Summarize the key points and context from the source material.
4) Main Discussion (~500-700 words): Analyze, debate, and discuss details and implications; use examples and practical takeaways. If needed, expand this section to fully explore complex or important points.
5) Conclusion (~60-100 words): Recap key takeaways and end with a thought-provoking comment or question.

Additional directions:
- Identify core concepts, arguments, and significant details from the provided content.
- Organize the discussion logically (outline -> intro -> overview -> deep dive -> conclusion).
- Use clear, accessible language and natural speech patterns; include occasional realistic speech elements ("um", "you know", short laughs or light banter) for authenticity.
- Present controversial topics with neutrality and show multiple sides where appropriate.
- Avoid sounding like an advertisement. If the source lists events, mention only regularly held events, not one-off occurrences.
- Refine the output: begin with an outline, develop a coherent draft, then add small speech-level edits so the script reads naturally when spoken.

The script will be read by two alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not prefix paragraphs with explicit labels such as "Host 1:" or "Host 2:" — the alternation will be inferred by paragraph order. Do not introduce the script with any meta commentary, explanation, or an outline of what will be covered. Instead, directly go into the podcast dialogue. Do not say something along the lines of "Welcome to the show."`,

  legacy: `You are an expert script writer. Create a script for an audio overview of the organization "{organizationName}". The script should be informative and conversational. Do not introduce the script with a title. The audience is primarily low vision or blind people. Appropriately use the following details:

Website: {websiteURL}
Email: {email}
Phone: {phoneNumber}
Address: {address}
INSERTBODIESHERE

If applicable, give a list and description of the services and the events that the organization offers. Do not sound like an advertisement, and do not mention one off events. Only mention regularly held events (i.e. Book Clubs or Meetings). If there are no events or meetings, do not mention them and skip over them.
The script should be approximately 5 minutes long when read aloud. You may go up to 7 minutes.
Do not use any offensive terms, such as 'blind' or 'visually impaired'. Instead, use terms like 'low vision' or 'people with low vision' or 'people who are blind'.

The script will be read by 2 alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not label the speakers (e.g., "Host 1:", "Speaker 2:"). Do not introduce the script with any meta commentary, explanation, or an outline of what will be covered. Instead, directly go into the podcast dialogue. Do not say something along the lines of "Welcome to the show."`,
};

// Combined Audio Player Component with automatic merging
function CombinedAudioPlayer({ audioFiles }: { audioFiles: AudioFiles[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());

  // Load FFmpeg when component mounts
  useEffect(() => {
    const loadFFmpeg = async () => {
      const ffmpeg = ffmpegRef.current;
      try {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        });
        setFfmpegLoaded(true);
        console.log("FFmpeg loaded successfully");
      } catch (error) {
        console.error("Failed to load FFmpeg:", error);
      }
    };
    loadFFmpeg();
  }, []);

  // Auto-merge whenever FFmpeg is ready and audioFiles changes
  useEffect(() => {
    if (ffmpegLoaded && audioFiles.length > 0) {
      mergeAudioFiles();
    }
    // If there are no audio files, clear any previously merged URL
    if (audioFiles.length === 0 && mergedAudioUrl) {
      try {
        URL.revokeObjectURL(mergedAudioUrl);
      } catch (e) {
        // ignore
      }
      setMergedAudioUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ffmpegLoaded, audioFiles]);

  const mergeAudioFiles = async () => {
    if (!ffmpegLoaded || audioFiles.length === 0) return;

    setIsMerging(true);
    const ffmpeg = ffmpegRef.current;

    try {
      // Write input files to FFmpeg filesystem
      const inputFiles: string[] = [];
      for (let i = 0; i < audioFiles.length; i++) {
        try {
          const fileName = `input${i}.mp3`;
          const audioData = audioFiles[i].audioData;
          const audioBuffer = Uint8Array.from(atob(audioData), (c) =>
            c.charCodeAt(0),
          );
          // Remove any pre-existing file in FFmpeg FS to avoid EEXIST/FS errors
          try {
            // Access low-level FS if available
            if ((ffmpeg as any).FS) {
              try {
                (ffmpeg as any).FS("unlink", fileName);
              } catch (e) {
                /* ignore if not present */
              }
            }
          } catch (e) {
            // ignore
          }
          await ffmpeg.writeFile(fileName, audioBuffer);
          inputFiles.push(fileName);
        } catch (e) {
          console.error(`Error writing file input${i}.mp3:`, e);
        }
      }

      if (inputFiles.length === 0) {
        throw new Error("Failed to prepare audio files for merging");
      }

      // Create concat file list
      const concatList = inputFiles.map((file) => `file '${file}'`).join("\n");
      // Write concat list as binary to avoid FS text issues
      const encoder = new TextEncoder();
      const concatBytes = encoder.encode(concatList);
      try {
        if ((ffmpeg as any).FS) {
          try {
            (ffmpeg as any).FS("unlink", "filelist.txt");
          } catch (e) {
            /* ignore */
          }
        }
      } catch (e) {
        // ignore
      }
      await ffmpeg.writeFile("filelist.txt", concatBytes);

      // Run FFmpeg concat command
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "filelist.txt",
        "-c",
        "copy",
        "output.mp3",
      ]);

      // Read the output file
      const data = await ffmpeg.readFile("output.mp3");
      const uint8Array = new Uint8Array(data as unknown as ArrayBuffer);
      const blob = new Blob([uint8Array], { type: "audio/mp3" });
      // Revoke previous merged URL if present
      if (mergedAudioUrl) {
        try {
          URL.revokeObjectURL(mergedAudioUrl);
        } catch (e) {
          /* ignore */
        }
      }
      const url = URL.createObjectURL(blob);
      setMergedAudioUrl(url);

      // Clean up FFmpeg FS temporary files
      try {
        if ((ffmpeg as any).FS) {
          try {
            (ffmpeg as any).FS("unlink", "output.mp3");
          } catch (e) {
            /* ignore */
          }
          try {
            (ffmpeg as any).FS("unlink", "filelist.txt");
          } catch (e) {
            /* ignore */
          }
          for (const f of inputFiles) {
            try {
              (ffmpeg as any).FS("unlink", f);
            } catch (e) {
              /* ignore */
            }
          }
        }
      } catch (e) {
        // ignore cleanup errors
      }
    } catch (error) {
      console.error("Error merging audio files:", error);
    } finally {
      setIsMerging(false);
    }
  };

  useEffect(() => {
    if (audioRef) {
      const handleEnded = () => {
        if (currentIndex < audioFiles.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          setIsPlaying(false);
          setCurrentIndex(0);
        }
      };

      audioRef.addEventListener("ended", handleEnded);
      return () => audioRef.removeEventListener("ended", handleEnded);
    }
  }, [audioRef, currentIndex, audioFiles.length]);

  const playAll = () => {
    setIsPlaying(true);
    setCurrentIndex(0);
  };

  const pauseAll = () => {
    setIsPlaying(false);
    if (audioRef) {
      audioRef.pause();
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <button
          className="btn btn-primary btn-sm"
          onClick={playAll}
          disabled={isPlaying}
        >
          ▶ Play All Segments
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={pauseAll}
          disabled={!isPlaying}
        >
          ⏸ Pause
        </button>
        <span className="small text-muted">
          {isPlaying
            ? `Playing segment ${currentIndex + 1} of ${audioFiles.length}`
            : "Ready to play"}
        </span>
      </div>

      {!ffmpegLoaded && (
        <div className="alert alert-info small">
          🔄 Loading FFmpeg... (This may take a moment on first load)
        </div>
      )}

      {isMerging && (
        <div className="alert alert-warning small">
          🔄 Auto-merging audio files into single podcast...
        </div>
      )}

      {mergedAudioUrl && (
        <div className="alert alert-success">
          <h6>🎉 Complete Podcast Ready!</h6>
          <p className="small mb-2">
            All audio segments have been automatically merged into a single
            podcast file:
          </p>
          <audio controls className="w-100 mb-2" src={mergedAudioUrl}>
            Your browser does not support the audio element.
          </audio>
          <div>
            <a
              href={mergedAudioUrl}
              download="complete-podcast.mp3"
              className="btn btn-sm btn-outline-success"
            >
              📥 Download Complete Podcast
            </a>
          </div>
        </div>
      )}

      {audioFiles.length > 0 && (
        <div>
          <h6 className="mt-3">Individual Segment Playback:</h6>
          <audio
            key={currentIndex}
            ref={setAudioRef}
            controls
            autoPlay={isPlaying}
            className="w-100"
            src={`data:audio/mp3;base64,${audioFiles[currentIndex]?.audioData}`}
            onPause={() => setIsPlaying(false)}
          >
            Your browser does not support the audio element.
          </audio>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [websiteURL, setWebsiteURL] = useState("");

  const [log, setLog] = useState<string[]>([]);

  interface PageBody {
    bodyText: string;
    href: string;
  }

  const [pageBodies, setPageBodies] = useState<PageBody[]>([]);

  const [basicInformation, setBasicInformation] = useState<object>({});

  const [yoastDescription, setYoastDescription] = useState<string>("");

  const [wpExcerpt, setWpExcerpt] = useState<string>("");

  const [podcastFiles, setPodcastFiles] = useState<AudioFiles[]>([]);

  const [podcastScript, setPodcastScript] = useState<string>("");

  const [promptVersion, setPromptVersion] = useState<number>(2); // 0 = legacy, 1 = new, 2 = accessible audio (default)
  const [voiceMode, setVoiceMode] = useState<number>(0); // 0 = randomize, 1 = fixed
  const [speaker1Voice, setSpeaker1Voice] = useState<string>(
    "en-US-Chirp3-HD-Sulafat",
  );
  const [speaker2Voice, setSpeaker2Voice] = useState<string>(
    "en-US-Chirp3-HD-Algenib",
  );
  // const AVAILABLE_VOICES = ['en-US-Chirp3-HD-Sulafat', 'en-US-Chirp3-HD-Algenib'];
  const [generateYoast, setGenerateYoast] = useState<boolean>(true);
  const [generateWpExcerpt, setGenerateWpExcerpt] = useState<boolean>(true);

  // Editable prompt state
  const [customPrompt, setCustomPrompt] = useState<string>(
    PROMPT_TEMPLATES.accessible,
  );
  const [showPromptEditor, setShowPromptEditor] = useState<boolean>(false);

  // Load template into editor when promptVersion changes
  const loadTemplate = (version: number) => {
    if (version === 0) setCustomPrompt(PROMPT_TEMPLATES.legacy);
    else if (version === 1) setCustomPrompt(PROMPT_TEMPLATES.new);
    else setCustomPrompt(PROMPT_TEMPLATES.accessible);
  };

  // For backward compatibility with template display
  const newPromptTemplate = PROMPT_TEMPLATES.new;
  const legacyPromptTemplate = PROMPT_TEMPLATES.legacy;
  const accessiblePromptTemplate = PROMPT_TEMPLATES.accessible;

  type Segment = {
    id: string;
    speaker: "Speaker 1" | "Speaker 2";
    text: string;
  };
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showScriptEditor, setShowScriptEditor] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js" as any);
  }, []);

  // Script editing functions
  const addSegment = () => {
    const last = segments[segments.length - 1];
    const nextSpeaker =
      last && last.speaker === "Speaker 1" ? "Speaker 2" : "Speaker 1";
    const newSeg: Segment = {
      id: String(Date.now()) + Math.random(),
      speaker: nextSpeaker,
      text: "",
    };
    setSegments((prev) => [...prev, newSeg]);
  };

  // Ensure the first segment is Speaker 1 and alternate speakers so there are no back-to-back same speakers
  const distributeLines = () => {
    setSegments((prev) => {
      const distributed = prev.map(
        (s, i): Segment => ({
          ...s,
          speaker: i % 2 === 0 ? "Speaker 1" : "Speaker 2",
        }),
      );
      // Update displayed script as well
      const newScript = distributed
        .map((s) => s.text)
        .filter((t) => t.trim())
        .join("\n\n");
      setPodcastScript(newScript);
      return distributed;
    });
    setLog((prev) => [
      ...prev,
      "✅ Distributed lines: alternating speakers starting with Speaker 1",
    ]);
  };

  const removeSegment = (id: string) => {
    setSegments((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      // Update the display script whenever segments change
      const newScript = updated
        .map((s) => s.text)
        .filter((t) => t.trim())
        .join("\n\n");
      setPodcastScript(newScript);
      return updated;
    });
  };

  const updateSegmentText = (id: string, text: string) => {
    setSegments((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, text } : s));
      // Update the display script whenever segments change
      const newScript = updated
        .map((s) => s.text)
        .filter((t) => t.trim())
        .join("\n\n");
      setPodcastScript(newScript);
      return updated;
    });
  };

  const toggleSpeaker = (id: string) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              speaker: s.speaker === "Speaker 1" ? "Speaker 2" : "Speaker 1",
            }
          : s,
      ),
    );
  };

  const generateAudioFromScript = async () => {
    // Validation: remove empty segments and enforce reasonable length
    const cleaned = segments
      .map((s) => ({ ...s, text: (s.text || "").replace(/\r/g, "") }))
      .filter((s) => s.text.trim().length > 0);

    if (cleaned.length === 0) {
      setLog((prev) => [
        ...prev,
        "⚠️ Validation failed: please add at least one non-empty segment before generating audio.",
      ]);
      return;
    }

    // Max length guard (per segment)
    const tooLong = cleaned.find((s) => s.text.length > 10000);
    if (tooLong) {
      setLog((prev) => [
        ...prev,
        `⚠️ One of the segments is too long (>10,000 chars). Please shorten it.`,
      ]);
      return;
    }

    setLog((prev) => [...prev, "Generating audio from edited script..."]);
    setGenerating(true);

    try {
      const response = await fetch("/api/scriptToAudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: cleaned,
          voiceMode,
          speaker1Voice,
          speaker2Voice,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        setLog((prev) => [
          ...prev,
          `❌ Backend error: ${response.status} ${response.statusText} ${text}`,
        ]);
        return;
      }

      const data = await response.json();
      setPodcastFiles(data.savedFiles || []);
      setLog((prev) => [
        ...prev,
        `✅ Generated ${data.savedFiles?.length ?? 0} audio files from edited script.`,
      ]);
    } catch (err) {
      setLog((prev) => [...prev, `❌ Error generating audio: ${String(err)}`]);
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setLog(["Starting process for: " + websiteURL]); // Clear previous logs and start new log
    setShowScriptEditor(false); // Reset script editor
    setSegments([]); // Clear segments
    setPodcastFiles([]); // Clear audio files
    setPodcastScript(""); // Clear script

    let scrapedData;
    let pageBodiesLiveCopy;

    // Step 1: Scrape Website
    try {
      setLog((prev) => [...prev, "Scraping website..."]);
      const response = await fetch("/api/scrapeWebsite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteURL }),
      });

      if (!response.ok) {
        setLog((prev) => [
          ...prev,
          `❌ Error scraping website: ${response.status} - ${response.statusText}`,
        ]);
        console.error("Network response was not ok:", response.statusText);
        throw new Error("Network response was not ok");
      }

      setLog((prev) => [...prev, "✅ Website scraped. Processing data..."]);

      const data = await response.json();
      scrapedData = data;
      pageBodiesLiveCopy = [
        ...data.pageBodies,
        { bodyText: data.bodyText, href: websiteURL },
      ];

      setPageBodies(
        data.pageBodies
          ? [...data.pageBodies, { bodyText: data.bodyText, href: websiteURL }]
          : [{ bodyText: data.bodyText, href: websiteURL }],
      );
      setBasicInformation(data.basicInformation || {});
    } catch (error) {
      setLog((prev) => [...prev, `❌ Error during fetch: ${error}`]);
      console.error("Error during fetch:", error);
      return;
    }

    // Step 2: Generate AI Descriptions (Yoast)
    try {
      if (generateYoast) {
        setLog((prev) => [...prev, "Generating AI description..."]);
        if (!pageBodiesLiveCopy || pageBodiesLiveCopy.length === 0) {
          setLog((prev) => [
            ...prev,
            "⚠️ No page bodies available for AI description generation.",
          ]);
          return;
        }

        const aiResponse = await fetch("/api/generateDescriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageBodies: pageBodiesLiveCopy,
            websiteURL,
            organizationName:
              scrapedData.basicInformation?.organizationName ||
              "Organization Name Not Provided",
          }),
        });

        if (!aiResponse.ok) {
          setLog((prev) => [
            ...prev,
            `❌ Error generating AI description: ${aiResponse.status} - ${aiResponse.statusText}`,
          ]);
          throw new Error("Network response was not ok");
        }

        const aiData = await aiResponse.json();
        setYoastDescription(aiData.content || "");
        setLog((prev) => [...prev, "✅ AI description generated."]);
      } else {
        setLog((prev) => [
          ...prev,
          "⚪️ Skipped AI description (Yoast) generation by user request.",
        ]);
      }
    } catch (error) {
      setLog((prev) => [
        ...prev,
        `❌ Error during AI description generation: ${error}`,
      ]);
      console.error("Error during AI description generation:", error);
    }

    // Step 3: Generate WP Excerpt
    try {
      if (generateWpExcerpt) {
        setLog((prev) => [...prev, "Generating WP excerpt..."]);
        if (!pageBodiesLiveCopy || pageBodiesLiveCopy.length === 0) {
          setLog((prev) => [
            ...prev,
            "⚠️ No page bodies available for WP excerpt generation.",
          ]);
          return;
        }

        const aiResponse = await fetch("/api/generateWpExcerpt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pageBodies: pageBodiesLiveCopy,
            websiteURL,
            organizationName:
              scrapedData.basicInformation?.organizationName ||
              "Organization Name Not Provided",
          }),
        });

        if (!aiResponse.ok) {
          setLog((prev) => [
            ...prev,
            `❌ Error generating WP excerpt: ${aiResponse.status} - ${aiResponse.statusText}`,
          ]);
          throw new Error("Network response was not ok");
        }

        const aiData = await aiResponse.json();
        setWpExcerpt(aiData.content || "");
        setLog((prev) => [...prev, "✅ WP excerpt generated."]);
      } else {
        setLog((prev) => [
          ...prev,
          "⚪️ Skipped WP excerpt generation by user request.",
        ]);
      }
    } catch (error) {
      setLog((prev) => [
        ...prev,
        `❌ Error during WP excerpt generation: ${error}`,
      ]);
      console.error("Error during WP excerpt generation:", error);
    }

    // Step 4: Generate Podcast Script
    try {
      setLog((prev) => [...prev, "Generating podcast script..."]);

      // 1) Generate the script (structure + paragraphs)
      const scriptResp = await fetch("/api/generateScript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageBodies: pageBodiesLiveCopy,
          websiteURL,
          organizationName:
            scrapedData.basicInformation?.organizationName ||
            "Organization Name Not Provided",
          promptType: promptVersion,
          customPrompt,
          voiceMode,
          speaker1Voice,
          speaker2Voice,
        }),
      });

      if (!scriptResp.ok) {
        setLog((prev) => [
          ...prev,
          `❌ Error generating script: ${scriptResp.status} - ${scriptResp.statusText}`,
        ]);
        throw new Error("Network response was not ok (generateScript)");
      }

      const scriptData = await scriptResp.json();
      const generatedScript: string =
        scriptData.script || scriptData.text || "";
      setPodcastScript(generatedScript);
      setLog((prev) => [
        ...prev,
        "✅ Script generated. You can now edit it before generating audio.",
      ]);

      // 2) Parse script into segments for editing
      let segmentsForEditing: Segment[] = [];

      if (
        Array.isArray(scriptData.scriptArray) &&
        scriptData.scriptArray.length > 0
      ) {
        segmentsForEditing = scriptData.scriptArray
          .map((p: any, idx: number) => {
            const speakerRaw = (p.speaker || "").toString().toLowerCase();
            const speaker = speakerRaw.includes("1")
              ? "Speaker 1"
              : "Speaker 2";
            return {
              id: String(Date.now()) + "-" + idx,
              speaker: speaker as "Speaker 1" | "Speaker 2",
              text: (p.text || "").toString().replace(/\n/g, " ").trim(),
            };
          })
          .filter((s: any) => s.text && s.text.length > 0);
      } else if (generatedScript) {
        // Fallback: split by double newline and alternate speakers
        const paragraphs = generatedScript
          .split("\n\n")
          .map((p) => p.replace(/\n/g, " ").trim())
          .filter((p) => p.length > 0);
        segmentsForEditing = paragraphs.map((text, idx) => ({
          id: String(Date.now()) + "-" + idx,
          speaker:
            idx % 2 === 0
              ? "Speaker 1"
              : ("Speaker 2" as "Speaker 1" | "Speaker 2"),
          text,
        }));
      }

      setSegments(segmentsForEditing);
      setShowScriptEditor(true);
      setLog((prev) => [
        ...prev,
        `Script parsed into ${segmentsForEditing.length} editable segments.`,
      ]);
    } catch (error) {
      setLog((prev) => [
        ...prev,
        `❌ Error during script generation: ${String(error)}`,
      ]);
      console.error("Error during script generation:", error);
    }
  };

  return (
    <div className="min-vh-100 container py-5">
      <NavBar />
      <div
        className="container shadow p-4 m-auto rounded-md"
        style={{
          backgroundColor: "#e6f7ff",
          borderRadius: "20px",
          // maxWidth: "600px",
        }}
      >
        <h1 className="text-center">Eye Spy Org Unpacker</h1>
        <div className="row">
          <div className="col-md-6">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Input</h2>
              <form onSubmit={handleSubmit}>
                {/* Website URL */}
                <div className="form-group mb-3">
                  <label htmlFor="websiteURL" className="form-label">
                    Enter Website URL:
                  </label>
                  <input
                    type="text"
                    className="form-control mb-2"
                    placeholder="Enter your website URL here"
                    id="websiteURL"
                    value={websiteURL}
                    onChange={(e) => setWebsiteURL(e.target.value)}
                  />
                </div>

                <div className="form-group mb-3">
                  <div className="form-group">
                    <label className="form-label">Voice Assignment</label>
                    <div>
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="voiceMode"
                          id="voiceRandom"
                          checked={voiceMode === 0}
                          onChange={() => setVoiceMode(0)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="voiceRandom"
                        >
                          Randomize Voices
                        </label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="voiceMode"
                          id="voiceFixed"
                          checked={voiceMode === 1}
                          onChange={() => setVoiceMode(1)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="voiceFixed"
                        >
                          Fixed Voices
                        </label>
                      </div>

                      {voiceMode === 1 && (
                        <div className="d-flex gap-2 mt-2 align-items-center flex-wrap">
                          <div className="form-group">
                            <label className="form-label small mb-1">
                              Speaker 1 Voice
                            </label>
                            <select
                              className="form-select form-select-sm"
                              value={speaker1Voice}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSpeaker1Voice(v);
                              }}
                            >
                              <option value="en-US-Chirp3-HD-Sulafat">
                                en-US-Chirp3-HD-Sulafat
                              </option>
                              <option value="en-US-Chirp3-HD-Algenib">
                                en-US-Chirp3-HD-Algenib
                              </option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label small mb-1">
                              Speaker 2 Voice
                            </label>
                            <select
                              className="form-select form-select-sm"
                              value={speaker2Voice}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSpeaker2Voice(v);
                              }}
                            >
                              <option value="en-US-Chirp3-HD-Sulafat">
                                en-US-Chirp3-HD-Sulafat
                              </option>
                              <option value="en-US-Chirp3-HD-Algenib">
                                en-US-Chirp3-HD-Algenib
                              </option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Generation Toggles */}
                  <div className="form-group mt-3 text-center">
                    <label className="form-label">Generate</label>
                    <div>
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="genYoast"
                          checked={generateYoast}
                          onChange={() => setGenerateYoast((v) => !v)}
                        />
                        <label className="form-check-label" htmlFor="genYoast">
                          Yoast Description
                        </label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="genWpExcerpt"
                          checked={generateWpExcerpt}
                          onChange={() => setGenerateWpExcerpt((v) => !v)}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="genWpExcerpt"
                        >
                          WP Excerpt
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Prompt Editor */}
                  <div className="mt-3">
                    {/* Template Loading Buttons */}
                    <div
                      className="btn-group btn-group-sm mb-2 d-flex flex-wrap gap-1"
                      role="group"
                    >
                      <button
                        type="button"
                        className={`btn ${promptVersion === 2 ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          setPromptVersion(2);
                          loadTemplate(2);
                        }}
                      >
                        Latest Prompt (Feb 12, 2026)
                      </button>
                      <button
                        type="button"
                        className={`btn ${promptVersion === 1 ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          setPromptVersion(1);
                          loadTemplate(1);
                        }}
                      >
                        Improved Prompt (Oct 13, 2025)
                      </button>
                      <button
                        type="button"
                        className={`btn ${promptVersion === 0 ? "btn-primary" : "btn-outline-primary"}`}
                        onClick={() => {
                          setPromptVersion(0);
                          loadTemplate(0);
                        }}
                      >
                        Legacy (Oct 2, 2025)
                      </button>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label mb-0">Prompt Editor</label>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setShowPromptEditor(!showPromptEditor)}
                      >
                        {showPromptEditor ? "Hide Editor" : "Show Editor"}
                      </button>
                    </div>
                    
                    {showPromptEditor && (
                      <div className="border rounded p-2 bg-light">
                        <textarea
                          className="form-control font-monospace"
                          rows={15}
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          placeholder="Enter your custom prompt here..."
                          style={{ fontSize: "0.85rem" }}
                        />
                        <div className="d-flex justify-content-between mt-2">
                          <span className="small text-muted">
                            {customPrompt.length} characters
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => loadTemplate(promptVersion)}
                          >
                            Reset to Template
                          </button>
                        </div>

                        <div className="form-text small text-muted mb-2">
                          Click a template to load it, then edit as needed.
                          Variables: {"{organizationName}"}, {"{websiteURL}"},{" "}
                          {"{email}"}, {"{phoneNumber}"}, {"{address}"},
                          INSERTBODIESHERE
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" className="btn btn-success">
                  Process
                </button>
              </form>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Output</h2>
              {log.length > 0 ? (
                <ul className="list-group">
                  {log.map((entry, index) => (
                    <li className="list-group-item" key={index}>
                      {entry}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No logs available.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="container shadow p-4 my-2 m-auto rounded-md"
        style={{
          backgroundColor: "#e6f7ff",
          borderRadius: "20px",
          // maxWidth: "600px",
        }}
      >
        <h3>Generated Content</h3>
        {/* Yoast Description (collapsible) - only show when generated */}
        {yoastDescription && (
          <div className="mb-3">
            <div className="accordion" id="yoastAccordion">
              <div className="accordion-item">
                <h2 className="accordion-header" id="headingYoast">
                  <button
                    className="accordion-button collapsed"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#collapseYoast"
                    aria-expanded="false"
                    aria-controls="collapseYoast"
                  >
                    Yoast Description
                  </button>
                </h2>
                <div
                  id="collapseYoast"
                  className="accordion-collapse collapse"
                  aria-labelledby="headingYoast"
                  data-bs-parent="#yoastAccordion"
                >
                  <div className="accordion-body">
                    <p>{yoastDescription}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* WP Excerpt (collapsible) - only show when generated */}
        {wpExcerpt && (
          <div className="mb-3">
            <div className="accordion" id="wpExcerptAccordion">
              <div className="accordion-item">
                <h2 className="accordion-header" id="headingWpExcerpt">
                  <button
                    className="accordion-button collapsed"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#collapseWpExcerpt"
                    aria-expanded="false"
                    aria-controls="collapseWpExcerpt"
                  >
                    WP Excerpt
                  </button>
                </h2>
                <div
                  id="collapseWpExcerpt"
                  className="accordion-collapse collapse"
                  aria-labelledby="headingWpExcerpt"
                  data-bs-parent="#wpExcerptAccordion"
                >
                  <div className="accordion-body">
                    <p>{wpExcerpt}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Podcast Script (collapsible, styled like podcast-editor) */}
        <div className="mb-3">
          <div className="accordion" id="podcastScriptAccordion">
            <div className="accordion-item">
              <h2 className="accordion-header" id="headingPodcastScript">
                <button
                  className="accordion-button collapsed"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#collapsePodcastScript"
                  aria-expanded="false"
                  aria-controls="collapsePodcastScript"
                >
                  Podcast Script
                </button>
              </h2>
              <div
                id="collapsePodcastScript"
                className="accordion-collapse collapse"
                aria-labelledby="headingPodcastScript"
                data-bs-parent="#podcastScriptAccordion"
              >
                <div className="accordion-body p-0">
                  <div className="card">
                    <div className="card-body">
                      <div
                        className="p-3 bg-light rounded"
                        style={{ minHeight: 120 }}
                      >
                        <div
                          className="mb-0"
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {podcastScript || "No script available."}
                        </div>
                      </div>

                      <div className="mt-3 d-flex gap-2 align-items-center flex-wrap">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            try {
                              const key = "podcastScript";
                              localStorage.setItem(key, podcastScript || "");
                              const blob = new Blob([podcastScript || ""], {
                                type: "text/plain",
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "podcast-script.txt";
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              URL.revokeObjectURL(url);
                              setLog((prev) => [
                                ...prev,
                                "✅ Script exported to localStorage and downloaded.",
                              ]);
                            } catch (e) {
                              setLog((prev) => [
                                ...prev,
                                "❌ Failed to export script.",
                              ]);
                            }
                          }}
                          disabled={!podcastScript}
                        >
                          Export Script
                        </button>

                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={async () => {
                            if (!podcastScript) return;
                            try {
                              await navigator.clipboard.writeText(
                                podcastScript || "",
                              );
                              setLog((prev) => [
                                ...prev,
                                "✅ Script copied to clipboard.",
                              ]);
                            } catch (e) {
                              setLog((prev) => [
                                ...prev,
                                "❌ Failed to copy script to clipboard.",
                              ]);
                            }
                          }}
                          disabled={!podcastScript}
                        >
                          Copy Script
                        </button>

                        <button
                          className="btn btn-sm btn-outline-info"
                          onClick={() => {
                            if (!podcastScript) {
                              setLog((prev) => [
                                ...prev,
                                "⚠️ No script available to export as segments.",
                              ]);
                              return;
                            }
                            try {
                              const paragraphs = podcastScript
                                .split("\n\n")
                                .map((p) => p.replace(/\n/g, " ").trim())
                                .filter((p) => p.length > 0);
                              const exportData: ExportSegment[] =
                                paragraphs.map((text, idx) => ({
                                  speakerIndex: idx % 2 === 0 ? 0 : 1,
                                  text,
                                }));
                              saveSegmentsToLocalStorage(
                                LOCALSTORAGE_SEGMENTS_KEY,
                                exportData,
                              );
                              downloadJSON(exportData, "podcast-segments.json");
                              setLog((prev) => [
                                ...prev,
                                `✅ Exported ${exportData.length} segments as JSON.`,
                              ]);
                            } catch (e) {
                              setLog((prev) => [
                                ...prev,
                                "❌ Failed to export segments as JSON.",
                              ]);
                            }
                          }}
                          disabled={!podcastScript}
                        >
                          Export Segments (JSON)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Script Editor */}
        {showScriptEditor && (
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4>Edit Podcast Script</h4>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowScriptEditor(false)}
              >
                Hide Editor
              </button>
            </div>
            <p className="text-muted">
              Edit the script segments below before generating audio. Each
              segment represents a block of dialog from one speaker.
            </p>

            <div className="row">
              <div className="col-12">
                <div className="mb-3 d-flex gap-2 align-items-center flex-wrap">
                  <button
                    className="btn btn-success"
                    onClick={generateAudioFromScript}
                    disabled={generating || segments.length === 0}
                  >
                    {generating
                      ? "🔄 Generating Audio..."
                      : "🎤 Generate Audio from Script"}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={addSegment}
                  >
                    ➕ Add Segment
                  </button>
                  <button
                    className="btn btn-outline-info"
                    onClick={distributeLines}
                    disabled={segments.length === 0}
                  >
                    🔀 Distribute Lines
                  </button>
                  <span className="small text-muted">
                    {segments.length} segment{segments.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {segments.map((seg, idx) => {
                  const isLeft = seg.speaker === "Speaker 1";
                  const cardStyle: React.CSSProperties = {
                    width: "67%",
                    maxWidth: "67%",
                    marginBottom: "8px",
                  };

                  return (
                    <div
                      key={seg.id}
                      className={`d-flex mb-0 ${isLeft ? "justify-content-start" : "justify-content-end"}`}
                    >
                      <div className="card" style={cardStyle}>
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <strong>
                                {seg.speaker} — Segment {idx + 1}
                              </strong>
                            </div>
                            <div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary me-1"
                                onClick={() => toggleSpeaker(seg.id)}
                              >
                                Swap
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => removeSegment(seg.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={seg.text}
                            onChange={(e) =>
                              updateSegmentText(seg.id, e.target.value)
                            }
                            placeholder="Enter transcript for this segment"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Show Editor Button */}
        {!showScriptEditor && podcastScript && (
          <div className="mb-3">
            <button
              className="btn btn-outline-primary"
              onClick={() => setShowScriptEditor(true)}
            >
              ✏️ Edit Script Before Generating Audio
            </button>
          </div>
        )}

        {/* Audio Files */}
        {podcastFiles.length > 0 && (
          <div className="mb-3">
            <h4>Generated Audio Segments</h4>

            {/* Combined Audio Player */}
            <div className="alert alert-info">
              <h6>🎧 Audio Podcast Player</h6>
              <p className="small">
                Audio segments are automatically merged into a complete podcast
                file. You can also play individual segments or download
                everything:
              </p>
              <CombinedAudioPlayer audioFiles={podcastFiles} />
            </div>

            {/* Individual Segments */}
            <h6>Individual Segments:</h6>
            <div className="row">
              {podcastFiles.map((file, index) => (
                <div key={index} className="col-md-6 mb-3">
                  <div className="card">
                    <div className="card-body">
                      <h6 className="card-title">Segment {index + 1}</h6>
                      <p className="card-text small text-muted">
                        {file.paragraph}
                      </p>
                      <audio
                        controls
                        className="w-100"
                        src={`data:audio/mp3;base64,${file.audioData}`}
                      >
                        Your browser does not support the audio element.
                      </audio>
                      <div className="mt-2">
                        <a
                          href={`data:audio/mp3;base64,${file.audioData}`}
                          download={`segment-${index + 1}.mp3`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          Download MP3
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="container shadow p-4 my-2 m-auto rounded-md"
        style={{
          backgroundColor: "#e6f7ff",
          borderRadius: "20px",
          // maxWidth: "600px",
        }}
      >
        <h3>Scraped Information</h3>
        <div className="mt-3">
          {/* Basic Information. */}
          {/* For Each Key in basicInformation, display its key: value */}
          {Object.entries(basicInformation).length > 0 ? (
            <div className="mb-3">
              <h4>Basic Information</h4>
              <ul className="list-group">
                {Object.entries(basicInformation).map(([key, value]) => (
                  <li className="list-group-item" key={key}>
                    <strong>{key}:</strong> {value || "Not available"}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted">No basic information available yet.</p>
          )}
        </div>
        <div className="mt-3">
          <h4>Pages Scraped</h4>
          {pageBodies.length > 0 ? (
            <div className="accordion" id="pageBodyAccordion">
              {pageBodies.map((body, index) => (
                <div className="accordion-item" key={index}>
                  <h2 className="accordion-header">
                    <button
                      className="accordion-button collapsed"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target={`#collapse${index}`}
                      aria-expanded="false"
                      aria-controls={`collapse${index}`}
                    >
                      Page Content #{index + 1}
                    </button>
                  </h2>
                  <div
                    id={`collapse${index}`}
                    className="accordion-collapse collapse"
                    data-bs-parent="#pageBodyAccordion"
                  >
                    <div className="accordion-body">
                      <h5 className="text-wrap">{body.href}</h5>
                      <pre className="text-wrap">{body.bodyText}</pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">
              No data available yet. Submit a URL to see results.
            </p>
          )}
        </div>
      </div>

      {/* Spreadsheet Table */}
      {(yoastDescription ||
        wpExcerpt ||
        podcastScript ||
        podcastFiles.length > 0) && (
        <div
          className="container shadow p-4 my-2 m-auto rounded-md"
          style={{ backgroundColor: "#f8f9fa", borderRadius: "20px" }}
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3>📊 Spreadsheet Data Table</h3>
            <button
              onClick={() => {
                const table = document.getElementById("single-site-table");
                const range = document.createRange();
                range.selectNode(table!);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
              }}
              className="btn btn-outline-primary btn-sm"
            >
              📋 Select Table Data
            </button>
          </div>

          <p className="text-muted small mb-3">
            Click &quot;Select Table Data&quot; then Ctrl+C to copy this data
            for pasting into Excel/Google Sheets.
          </p>

          <div className="table-responsive">
            <table
              id="single-site-table"
              className="table table-striped table-bordered table-sm"
            >
              <thead className="table-dark">
                <tr>
                  <th>Field</th>
                  <th>Content</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Website URL</strong>
                  </td>
                  <td>{websiteURL || "N/A"}</td>
                </tr>
                {Object.entries(basicInformation).map(([key, value]) => (
                  <tr key={key}>
                    <td>
                      <strong>{key}</strong>
                    </td>
                    <td>{value || "N/A"}</td>
                  </tr>
                ))}
                {yoastDescription && (
                  <tr>
                    <td>
                      <strong>Yoast Description</strong>
                    </td>
                    <td style={{ maxWidth: "600px", wordWrap: "break-word" }}>
                      {yoastDescription}
                    </td>
                  </tr>
                )}
                {wpExcerpt && (
                  <tr>
                    <td>
                      <strong>WP Excerpt</strong>
                    </td>
                    <td style={{ maxWidth: "600px", wordWrap: "break-word" }}>
                      {wpExcerpt}
                    </td>
                  </tr>
                )}
                <tr>
                  <td>
                    <strong>Audio Files Count</strong>
                  </td>
                  <td>{podcastFiles.length}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Podcast Script</strong>
                  </td>
                  <td
                    style={{
                      maxWidth: "600px",
                      wordWrap: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {podcastScript || "N/A"}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Pages Scraped Count</strong>
                  </td>
                  <td>{pageBodies.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Horizontal format table for easy spreadsheet copying */}
          <div className="mt-4">
            <h5>📋 Horizontal Format (Better for Spreadsheets)</h5>
            <p className="text-muted small">
              This format is optimized for copying into spreadsheet rows:
            </p>

            <div className="table-responsive">
              <table className="table table-striped table-bordered table-sm">
                <thead className="table-primary">
                  <tr>
                    <th>Website URL</th>
                    {Object.keys(basicInformation).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                    {yoastDescription && <th>Yoast Description</th>}
                    {wpExcerpt && <th>WP Excerpt</th>}
                    <th>Audio Files</th>
                    <th>Pages Scraped</th>
                    <th>Podcast Script (First 200 chars)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{websiteURL || "N/A"}</td>
                    {Object.values(basicInformation).map((value, index) => (
                      <td key={index}>{value || "N/A"}</td>
                    ))}
                    {yoastDescription && (
                      <td style={{ maxWidth: "300px", wordWrap: "break-word" }}>
                        {yoastDescription}
                      </td>
                    )}
                    {wpExcerpt && (
                      <td style={{ maxWidth: "300px", wordWrap: "break-word" }}>
                        {wpExcerpt}
                      </td>
                    )}
                    <td className="text-center">{podcastFiles.length}</td>
                    <td className="text-center">{pageBodies.length}</td>
                    <td
                      style={{
                        maxWidth: "400px",
                        wordWrap: "break-word",
                        fontSize: "0.8em",
                      }}
                    >
                      {podcastScript
                        ? podcastScript.substring(0, 200) +
                          (podcastScript.length > 200 ? "..." : "")
                        : "N/A"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
