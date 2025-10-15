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

type AudioFiles = {
  audioData: string; // Base64 encoded audio data
  fileName: string; // Original file name
  paragraph?: string; // Preview text
  speaker?: string | null;
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
            "text/javascript"
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
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

  // Auto-merge when FFmpeg is loaded and audio files are available (runs whenever audioFiles changes)
  useEffect(() => {
    if (ffmpegLoaded && audioFiles.length > 0) {
      // revoke any previous merged url to ensure we don't reuse a stale file
      if (mergedAudioUrl) {
        try {
          URL.revokeObjectURL(mergedAudioUrl);
        } catch (e) {
          /* ignore */
        }
        setMergedAudioUrl(null);
      }
      mergeAudioFiles();
    } else if (!ffmpegLoaded && mergedAudioUrl) {
      // if FFmpeg not loaded yet, clear any merged url to avoid stale state
      try {
        URL.revokeObjectURL(mergedAudioUrl);
      } catch (e) {
        /* ignore */
      }
      setMergedAudioUrl(null);
    } else if (ffmpegLoaded && audioFiles.length === 0 && mergedAudioUrl) {
      // no audio files -> clear merged url
      try {
        URL.revokeObjectURL(mergedAudioUrl);
      } catch (e) {
        /* ignore */
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
            c.charCodeAt(0)
          );
          // remove existing file if present
          try {
            await ffmpeg.deleteFile?.(fileName);
          } catch (e) {
            /* ignore */
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

      // Create concat file list and write as Uint8Array
      const concatList = inputFiles.map((file) => `file '${file}'`).join("\n");
      const encoder = new TextEncoder();
      const concatBuffer = encoder.encode(concatList);
      try {
        await ffmpeg.deleteFile?.("filelist.txt");
      } catch (e) {
        /* ignore */
      }
      await ffmpeg.writeFile("filelist.txt", concatBuffer);

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
      const url = URL.createObjectURL(blob);
      // revoke previous url to avoid leaks
      if (mergedAudioUrl) {
        try {
          URL.revokeObjectURL(mergedAudioUrl);
        } catch (e) {
          /* ignore */
        }
      }
      setMergedAudioUrl(url);

      // Clean up temp files from FFmpeg filesystem
      try {
        for (const f of inputFiles) {
          try {
            await ffmpeg.deleteFile?.(f);
          } catch (e) {
            /* ignore */
          }
        }
        try {
          await ffmpeg.deleteFile?.("filelist.txt");
        } catch (e) {
          /* ignore */
        }
        try {
          await ffmpeg.deleteFile?.("output.mp3");
        } catch (e) {
          /* ignore */
        }
      } catch (cleanupErr) {
        console.warn("Error cleaning up ffmpeg FS:", cleanupErr);
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

export default function PodcastEditor() {
  // Segment represents a block of dialog from a speaker
  type Segment = {
    id: string;
    speaker: "Speaker 1" | "Speaker 2";
    text: string;
  };

  const [segments, setSegments] = useState<Segment[]>(() => [
    { id: String(Date.now()) + "-1", speaker: "Speaker 1", text: "" },
    { id: String(Date.now() + 1) + "-2", speaker: "Speaker 2", text: "" },
    { id: String(Date.now() + 2) + "-3", speaker: "Speaker 1", text: "" },
    { id: String(Date.now() + 3) + "-4", speaker: "Speaker 2", text: "" },
  ]);

  const [status, setStatus] = useState<string[]>([]);
  const [podcastFiles, setPodcastFiles] = useState<AudioFiles[]>([]);
  const [podcastScript, setPodcastScript] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [voiceMode, setVoiceMode] = useState<number>(0); // 0 = randomize, 1 = fixed
  const [speaker1Voice, setSpeaker1Voice] = useState<string>(
    "en-US-Chirp3-HD-Sulafat"
  );
  const [speaker2Voice, setSpeaker2Voice] = useState<string>(
    "en-US-Chirp3-HD-Algenib"
  );
  const AVAILABLE_VOICES = [
    "en-US-Chirp3-HD-Sulafat",
    "en-US-Chirp3-HD-Algenib",
  ];

  // load bootstrap JS (optional for accordions etc.)
  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js" as any);
  }, []);

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

  const removeSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSegmentText = (id: string, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  };

  const toggleSpeaker = (id: string) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              speaker: s.speaker === "Speaker 1" ? "Speaker 2" : "Speaker 1",
            }
          : s
      )
    );
  };

  // Ensure the first segment is Speaker 1 and alternate speakers so there are no back-to-back same speakers
  const distributeLines = () => {
    setSegments((prev) => {
      const distributed = prev.map(
        (s, i): Segment => ({
          ...s,
          speaker: i % 2 === 0 ? "Speaker 1" : "Speaker 2",
        })
      );
      // Update displayed script as well
      const newScript = distributed
        .map((s) => s.text)
        .filter((t) => t.trim())
        .join("\n\n");
      setPodcastScript(newScript);
      return distributed;
    });
    setStatus((prev) => [
      ...prev,
      "✅ Distributed lines: alternating speakers starting with Speaker 1",
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation: remove empty segments and enforce reasonable length
    const cleaned = segments
      .map((s) => ({ ...s, text: (s.text || "").replace(/\r/g, "") }))
      .filter((s) => s.text.trim().length > 0);

    if (cleaned.length === 0) {
      setStatus([
        "⚠️ Validation failed: please add at least one non-empty segment before generating audio.",
      ]);
      return;
    }

    // Max length guard (per segment)
    const tooLong = cleaned.find((s) => s.text.length > 10000);
    if (tooLong) {
      setStatus([
        `⚠️ One of the segments is too long (>10,000 chars). Please shorten it.`,
      ]);
      return;
    }

    setStatus(["Submitting segments to backend..."]);
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
        setStatus((prev) => [
          ...prev,
          `❌ Backend error: ${response.status} ${response.statusText} ${text}`,
        ]);
        setGenerating(false);
        return;
      }

      const data = await response.json();
      // savedFiles may now include a speaker label per segment
      setPodcastFiles(data.savedFiles || []);
      setPodcastScript(data.script || "");
      setStatus((prev) => [
        ...prev,
        `✅ Received ${data.savedFiles?.length ?? 0} audio files from backend.`,
      ]);
    } catch (err) {
      setStatus((prev) => [
        ...prev,
        `❌ Error submitting segments: ${String(err)}`,
      ]);
      console.error(err);
      setGenerating(false);
    } finally {
      setGenerating(false);
    }
  };

  // Import segments from JSON localStorage or file
  const importSegmentsFromLocal = () => {
    try {
      const loaded = loadSegmentsFromLocalStorage(LOCALSTORAGE_SEGMENTS_KEY);
      if (!loaded) {
        setStatus((prev) => [...prev, "⚠️ No segments found in localStorage."]);
        return;
      }
      // Map into Segment type
      const mapped: Segment[] = loaded.map((s, idx) => ({
        id: String(Date.now()) + "-" + idx,
        speaker: s.speakerIndex === 0 ? "Speaker 1" : "Speaker 2",
        text: s.text,
      }));
      setSegments(mapped);
      setStatus((prev) => [
        ...prev,
        `✅ Imported ${mapped.length} segments from localStorage.`,
      ]);
    } catch (e) {
      setStatus((prev) => [
        ...prev,
        "❌ Failed to import segments from localStorage.",
      ]);
    }
  };

  // Enhanced import handler: supports .json (ExportSegment[]) and .txt files
  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    const name = file.name || 'uploaded-file';
    try {
      const text = await file.text();

      // Try JSON first
      try {
        const parsed = JSON.parse(text) as ExportSegment[];
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text !== undefined) {
          const mapped: Segment[] = parsed.map((s, idx) => ({
            id: String(Date.now()) + '-' + idx,
            speaker: s.speakerIndex === 0 ? 'Speaker 1' : 'Speaker 2',
            text: s.text,
          }));
          setSegments(mapped);
          setStatus((prev) => [...prev, `✅ Imported ${mapped.length} segments from JSON file: ${name}`]);
          return;
        }
      } catch (jsonErr) {
        // Not JSON — fallthrough to treat as plain text
      }

      // Plain text: detect separator and split into paragraphs
      // Common separators: double newline, lines starting with dashes, or numbered lists
      let paragraphs: string[] = [];

      // If double-newline present, use that
      if (/\n\s*\n/.test(text)) {
        paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\n/g, ' ').trim()).filter(p => p.length > 0);
      } else if (/^\d+\./m.test(text)) {
        // numbered list
        paragraphs = text.split(/\n\d+\./).map(p => p.replace(/^\d+\./, '').replace(/\n/g, ' ').trim()).filter(p => p.length > 0);
      } else if (/^[-*]\s+/m.test(text)) {
        // bullet list
        paragraphs = text.split(/\n[-*]\s+/).map(p => p.replace(/\n/g, ' ').trim()).filter(p => p.length > 0);
      } else {
        // Fallback: split by punctuation followed by newline or just by sentences of reasonable length
        paragraphs = text.split(/\n/).map(p => p.trim()).filter(p => p.length > 0);
      }

      // Heuristic: if paragraphs include speaker labels like 'Speaker 1:' or 'S1:' or 'Host:' then respect labels
      const labelRegex = /^(?:Speaker\s*1|Speaker\s*2|S1|S2|Host\s*1|Host\s*2|Host):\s*/i;
      const mappedSegments: Segment[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        let p = paragraphs[i];
        let speaker: 'Speaker 1' | 'Speaker 2' = i % 2 === 0 ? 'Speaker 1' : 'Speaker 2';
        const m = p.match(labelRegex);
        if (m) {
          const label = m[0];
          p = p.replace(labelRegex, '').trim();
          if (/1|s1|host\s*1/i.test(label)) speaker = 'Speaker 1';
          else speaker = 'Speaker 2';
        }
        mappedSegments.push({ id: String(Date.now()) + '-' + i, speaker, text: p });
      }

      setSegments(mappedSegments);
      setStatus((prev) => [...prev, `✅ Imported ${mappedSegments.length} segments from text file: ${name}`]);
    } catch (err) {
      setStatus((prev) => [...prev, `❌ Failed to import file: ${String(err)}`]);
    }
  };

  

  const exportSegmentsAsJSON = () => {
    try {
      const exportData: ExportSegment[] = segments.map((s) => ({
        speakerIndex: s.speaker === "Speaker 1" ? 0 : 1,
        text: s.text,
      }));
      saveSegmentsToLocalStorage(LOCALSTORAGE_SEGMENTS_KEY, exportData);
      downloadJSON(exportData, "podcast-segments.json");
      setStatus((prev) => [
        ...prev,
        `✅ Exported ${exportData.length} segments to localStorage and downloaded JSON.`,
      ]);
    } catch (e) {
      setStatus((prev) => [...prev, "❌ Failed to export segments as JSON."]);
    }
  };

  return (
    <div className="min-vh-100 container py-5">
      <NavBar />
      <div
        className="container shadow p-4 m-auto rounded-md"
        style={{ backgroundColor: "#e6f7ff", borderRadius: "20px" }}
      >
        <h1 className="text-center">Podcast Editor</h1>
        <p className="text-center small text-muted">
          Edit your podcast script online, and generate it as spoken audio.
        </p>

        <form onSubmit={handleSubmit}>

          <div className="form-group my-3 text-center">
            <label className="form-label">Voice Assignment</label>
            <div className="d-flex justify-content-center gap-3 align-items-center">
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="peVoiceMode"
                  id="peVoiceRandom"
                  checked={voiceMode === 0}
                  onChange={() => setVoiceMode(0)}
                />
                <label className="form-check-label" htmlFor="peVoiceRandom">
                  Randomize
                </label>
              </div>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="peVoiceMode"
                  id="peVoiceFixed"
                  checked={voiceMode === 1}
                  onChange={() => setVoiceMode(1)}
                />
                <label className="form-check-label" htmlFor="peVoiceFixed">
                  Fixed
                </label>
              </div>
            </div>

            {voiceMode === 1 && (
              <div className="d-flex justify-content-center gap-2 mt-2">
                <select className="form-select form-select-sm" value={speaker1Voice} onChange={(e) => setSpeaker1Voice(e.target.value)}>
                  {AVAILABLE_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select className="form-select form-select-sm" value={speaker2Voice} onChange={(e) => setSpeaker2Voice(e.target.value)}>
                  {AVAILABLE_VOICES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-3">
              <h5>Import / Export Script</h5>
              <div className="d-flex gap-2 justify-content-center">
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={importSegmentsFromLocal}>
                  Import Segments from Local
                </button>

                <label className="btn btn-sm btn-outline-secondary mb-0">
                  Import from File
                  <input
                    type="file"
                    accept=".txt,.json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleImportFile(file);
                    }}
                  />
                </label>

                <button type="button" className="btn btn-sm btn-outline-success" onClick={exportSegmentsAsJSON}>
                  Export Segments (JSON)
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(podcastScript || "");
                      setStatus((prev) => [...prev, "✅ Script copied to clipboard."]);
                    } catch (e) {
                      setStatus((prev) => [...prev, "❌ Failed to copy script to clipboard."]);
                    }
                  }}
                >
                  Copy Script
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3">
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
                  className={`d-flex mb-0 ${
                    isLeft ? "justify-content-start" : "justify-content-end"
                  }`}
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
                          <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => toggleSpeaker(seg.id)}>
                            Swap
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeSegment(seg.id)}>
                            Remove
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="form-control"
                        rows={3}
                        value={seg.text}
                        onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                        placeholder="Enter transcript for this segment"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-outline-primary" onClick={addSegment} disabled={generating}>
              + Add Segment
            </button>
            <button type="button" className="btn btn-outline-info" onClick={distributeLines} disabled={generating || segments.length === 0}>
              🔀 Distribute Lines
            </button>
            <button type="submit" className="btn btn-success" disabled={generating}>
              {generating ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Generating...
                </>
              ) : (
                "Generate Podcast Audio"
              )}
            </button>
          </div>
        </form>

        <div className="mt-4">
          <h5>Status</h5>
          <ul className="list-group">
            {status.map((s, i) => (
              <li key={i} className="list-group-item">
                {s}
              </li>
            ))}
            {generating && (
              <li className="list-group-item d-flex align-items-center">
                <div
                  className="spinner-border text-primary me-2"
                  role="status"
                  aria-hidden="true"
                />
                <div>
                  Generating audio — this can take a minute depending on length.
                </div>
              </li>
            )}
          </ul>
        </div>

        {podcastFiles.length > 0 && (
          <div className="mt-4">
            <h4>Generated Audio</h4>
            <div className="alert alert-info">
              <CombinedAudioPlayer audioFiles={podcastFiles} />
            </div>

            <h6>Individual Segments</h6>
            <div className="row">
              {podcastFiles.map((file, index) => (
                <div key={index} className="col-md-6 mb-3">
                  <div className="card">
                    <div className="card-body">
                      <h6>
                        Segment {index + 1}{" "}
                        {file.speaker ? `— ${file.speaker}` : ""}
                      </h6>
                      <p className="small text-muted">{file.paragraph}</p>
                      <audio
                        controls
                        className="w-100"
                        src={`data:audio/mp3;base64,${file.audioData}`}
                      />
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

        {podcastScript && (
          <div className="mt-4">
            <h5>Generated Script</h5>
            <pre style={{ whiteSpace: "pre-wrap" }}>{podcastScript}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
