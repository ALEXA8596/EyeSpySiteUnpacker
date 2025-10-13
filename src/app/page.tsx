"use client";

import React, { useState, useEffect, useRef } from "react";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import NavBar from '@/components/NavBar';
import { LOCALSTORAGE_SEGMENTS_KEY, ExportSegment, saveSegmentsToLocalStorage, loadSegmentsFromLocalStorage, downloadJSON } from '@/utils/scriptTransfer';
// import "bootstrap/dist/js/bootstrap.bundle.min.js";

type AudioFiles = {
  audioData: string; // Base64 encoded audio data
  fileName: string; // Original file name
  paragraph?: string; // Preview text
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
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegLoaded(true);
        console.log('FFmpeg loaded successfully');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
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
          const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
          // Remove any pre-existing file in FFmpeg FS to avoid EEXIST/FS errors
          try {
            // @ts-ignore - use low-level FS if available
            if ((ffmpeg as any).FS) {
              try { (ffmpeg as any).FS("unlink", fileName); } catch (e) { /* ignore if not present */ }
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
      const concatList = inputFiles.map(file => `file '${file}'`).join('\n');
      // Write concat list as binary to avoid FS text issues
      const encoder = new TextEncoder();
      const concatBytes = encoder.encode(concatList);
      try {
        if ((ffmpeg as any).FS) {
          try { (ffmpeg as any).FS("unlink", 'filelist.txt'); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        // ignore
      }
      await ffmpeg.writeFile('filelist.txt', concatBytes);

      // Run FFmpeg concat command
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'filelist.txt',
        '-c', 'copy',
        'output.mp3'
      ]);

      // Read the output file
      const data = await ffmpeg.readFile('output.mp3');
      const uint8Array = new Uint8Array(data as unknown as ArrayBuffer);
      const blob = new Blob([uint8Array], { type: 'audio/mp3' });
      // Revoke previous merged URL if present
      if (mergedAudioUrl) {
        try { URL.revokeObjectURL(mergedAudioUrl); } catch (e) { /* ignore */ }
      }
      const url = URL.createObjectURL(blob);
      setMergedAudioUrl(url);

      // Clean up FFmpeg FS temporary files
      try {
        if ((ffmpeg as any).FS) {
          try { (ffmpeg as any).FS("unlink", 'output.mp3'); } catch (e) { /* ignore */ }
          try { (ffmpeg as any).FS("unlink", 'filelist.txt'); } catch (e) { /* ignore */ }
          for (const f of inputFiles) {
            try { (ffmpeg as any).FS("unlink", f); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore cleanup errors
      }

    } catch (error) {
      console.error('Error merging audio files:', error);
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

      audioRef.addEventListener('ended', handleEnded);
      return () => audioRef.removeEventListener('ended', handleEnded);
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
          {isPlaying ? `Playing segment ${currentIndex + 1} of ${audioFiles.length}` : 'Ready to play'}
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
          <p className="small mb-2">All audio segments have been automatically merged into a single podcast file:</p>
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

  // load bootstrap - CSS only (JS disabled to prevent Next.js conflicts)
  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js" as any);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setLog(["Starting process for: " + websiteURL]); // Clear previous logs and start new log

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
      pageBodiesLiveCopy = [...data.pageBodies, { bodyText: data.bodyText, href: websiteURL }];

      setPageBodies(
        data.pageBodies
          ? [...data.pageBodies, { bodyText: data.bodyText, href: websiteURL }]
          : [{ bodyText: data.bodyText, href: websiteURL }]
      );
      setBasicInformation(data.basicInformation || {});
    } catch (error) {
      setLog((prev) => [...prev, `❌ Error during fetch: ${error}`]);
      console.error("Error during fetch:", error);
      return;
    }

    // Step 2: Generate AI Descriptions
    try {
      setLog((prev) => [...prev, "Generating AI description..."]);
      if (!pageBodiesLiveCopy || pageBodiesLiveCopy.length === 0) {
        setLog((prev) => [...prev, "⚠️ No page bodies available for AI description generation."]);
        return;
      }

      const aiResponse = await fetch("/api/generateDescriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pageBodies: pageBodiesLiveCopy, websiteURL, organizationName: scrapedData.basicInformation?.organizationName || "Organization Name Not Provided" }),
      });

      if (!aiResponse.ok) {
        setLog((prev) => [...prev, `❌ Error generating AI description: ${aiResponse.status} - ${aiResponse.statusText}`]);
        throw new Error("Network response was not ok");
      }

      const aiData = await aiResponse.json();
      setYoastDescription(aiData.content || "");
      setLog((prev) => [...prev, "✅ AI description generated."]);
    } catch (error) {
      setLog((prev) => [...prev, `❌ Error during AI description generation: ${error}`]);
      console.error("Error during AI description generation:", error);
    }

    // Step 3: Generate WP Excerpt
    try {
      setLog((prev) => [...prev, "Generating WP excerpt..."]);
      if(!pageBodiesLiveCopy || pageBodiesLiveCopy.length === 0) {
        setLog((prev) => [...prev, "⚠️ No page bodies available for WP excerpt generation."]);
        return;
      }

      const aiResponse = await fetch("/api/generateWpExcerpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pageBodies: pageBodiesLiveCopy, websiteURL, organizationName: scrapedData.basicInformation?.organizationName || "Organization Name Not Provided" }),
      });

      if (!aiResponse.ok) {
        setLog((prev) => [...prev, `❌ Error generating WP excerpt: ${aiResponse.status} - ${aiResponse.statusText}`]);
        throw new Error("Network response was not ok");
      }

      const aiData = await aiResponse.json();
      setWpExcerpt(aiData.content || "");
      setLog((prev) => [...prev, "✅ WP excerpt generated."]);
    } catch (error) {
      setLog((prev) => [...prev, `❌ Error during WP excerpt generation: ${error}`]);
      console.error("Error during WP excerpt generation:", error);
    }

    // Step 4: Generate Podcast Files
    try {
      setLog((prev) => [...prev, "Generating podcast script..."]);

      // 1) Generate the script (structure + paragraphs)
      const scriptResp = await fetch('/api/generateScript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageBodies: pageBodiesLiveCopy, websiteURL, organizationName: scrapedData.basicInformation?.organizationName || 'Organization Name Not Provided' }),
      });

      if (!scriptResp.ok) {
        setLog((prev) => [...prev, `❌ Error generating script: ${scriptResp.status} - ${scriptResp.statusText}`]);
        throw new Error('Network response was not ok (generateScript)');
      }

      const scriptData = await scriptResp.json();
      const generatedScript: string = scriptData.script || scriptData.text || '';
      setPodcastScript(generatedScript);
      setLog((prev) => [...prev, '✅ Script generated.']);

      // 2) Build segments array for TTS. Prefer scriptArray from the server if present.
      let segmentsForTTS: Array<{ speaker?: string; text: string }> = [];

      if (Array.isArray(scriptData.scriptArray) && scriptData.scriptArray.length > 0) {
        segmentsForTTS = scriptData.scriptArray
          .map((p: any, idx: number) => {
            const speakerRaw = (p.speaker || '').toString().toLowerCase();
            const speaker = speakerRaw.includes('1') ? 'Speaker 1' : 'Speaker 2';
            return { speaker, text: (p.text || '').toString().replace(/\n/g, ' ').trim() };
          })
          .filter((s: any) => s.text && s.text.length > 0);
      } else if (generatedScript) {
        // Fallback: split by double newline and alternate speakers
        const paragraphs = generatedScript.split('\n\n').map((p) => p.replace(/\n/g, ' ').trim()).filter((p) => p.length > 0);
        segmentsForTTS = paragraphs.map((text, idx) => ({ speaker: idx % 2 === 0 ? 'Speaker 1' : 'Speaker 2', text }));
      }

      if (segmentsForTTS.length === 0) {
        setLog((prev) => [...prev, '⚠️ No script segments available for TTS.']);
        return;
      }

      setLog((prev) => [...prev, `Generating ${segmentsForTTS.length} audio segments from script...`]);

      const ttsResp = await fetch('/api/scriptToAudio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: segmentsForTTS }),
      });

      if (!ttsResp.ok) {
        const text = await ttsResp.text();
        setLog((prev) => [...prev, `❌ Error generating TTS: ${ttsResp.status} ${ttsResp.statusText} ${text}`]);
        throw new Error('Network response was not ok (scriptToAudio)');
      }

      const ttsData = await ttsResp.json();
      setPodcastFiles(ttsData.savedFiles || []);
      setLog((prev) => [...prev, `✅ Generated ${ttsData.savedFiles?.length ?? 0} audio segments.`]);
    } catch (error) {
      setLog((prev) => [...prev, `❌ Error during podcast generation: ${String(error)}`]);
      console.error('Error during podcast generation:', error);
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
        {/* Yoast Description */}
        <div className="mb-3">
          <h4>Yoast Description</h4>
          <p>{yoastDescription || "No description available."}</p>
        </div>
        {/* WP Excerpt */}
        <div className="mb-3">
          <h4>WP Excerpt</h4>
          <p>{wpExcerpt || "No excerpt available."}</p>
        </div>
        
        {/* Podcast Script */}
        <div className="mb-3">
          <h4>Podcast Script</h4>
          <pre className="text-wrap">{podcastScript || "No script available."}</pre>
          <div className="mt-2 d-flex gap-2 align-items-center">
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={() => {
                // save to localStorage and download script as text
                try {
                  const key = 'podcastScript';
                  localStorage.setItem(key, podcastScript || '');
                  const blob = new Blob([podcastScript || ''], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'podcast-script.txt';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  setLog((prev) => [...prev, '✅ Script exported to localStorage and downloaded.']);
                } catch (e) {
                  setLog((prev) => [...prev, '❌ Failed to export script.']);
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
                  await navigator.clipboard.writeText(podcastScript || '');
                  setLog((prev) => [...prev, '✅ Script copied to clipboard.']);
                } catch (e) {
                  setLog((prev) => [...prev, '❌ Failed to copy script to clipboard.']);
                }
              }}
              disabled={!podcastScript}
            >
              Copy Script
            </button>

            {/* Segment JSON export/import symmetry */}
            <button
              className="btn btn-sm btn-outline-info"
              onClick={() => {
                // Export segments derived from the generated script
                if (!podcastScript) {
                  setLog((prev) => [...prev, '⚠️ No script available to export as segments.']);
                  return;
                }
                try {
                  const paragraphs = podcastScript.split('\n\n').map(p => p.replace(/\n/g, ' ').trim()).filter(p => p.length > 0);
                  const exportData: ExportSegment[] = paragraphs.map((text, idx) => ({ speakerIndex: idx % 2 === 0 ? 0 : 1, text }));
                  saveSegmentsToLocalStorage(LOCALSTORAGE_SEGMENTS_KEY, exportData);
                  downloadJSON(exportData, 'podcast-segments.json');
                  setLog((prev) => [...prev, `✅ Exported ${exportData.length} segments as JSON.`]);
                } catch (e) {
                  setLog((prev) => [...prev, '❌ Failed to export segments as JSON.']);
                }
              }}
              disabled={!podcastScript}
            >
              Export Segments (JSON)
            </button>

            {/* <button
              className="btn btn-sm btn-outline-dark"
              onClick={async () => {
                // Import segments from localStorage and synthesize audio
                try {
                  const loaded = loadSegmentsFromLocalStorage(LOCALSTORAGE_SEGMENTS_KEY);
                  if (!loaded || loaded.length === 0) {
                    setLog((prev) => [...prev, '⚠️ No segments found in localStorage.']);
                    return;
                  }
                  setLog((prev) => [...prev, `Importing ${loaded.length} segments from localStorage and generating audio...`]);
                  const segmentsForTTS = loaded.map(s => ({ speaker: s.speakerIndex === 0 ? 'Speaker 1' : 'Speaker 2', text: s.text }));
                  const ttsResp = await fetch('/api/scriptToAudio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments: segmentsForTTS }) });
                  if (!ttsResp.ok) {
                    const text = await ttsResp.text();
                    setLog((prev) => [...prev, `❌ Error generating TTS from imported segments: ${ttsResp.status} ${ttsResp.statusText} ${text}`]);
                    return;
                  }
                  const ttsData = await ttsResp.json();
                  setPodcastFiles(ttsData.savedFiles || []);
                  // Rebuild script from imported segments
                  const rebuiltScript = loaded.map(s => s.text).join('\n\n');
                  setPodcastScript(rebuiltScript);
                  setLog((prev) => [...prev, `✅ Imported segments and generated ${ttsData.savedFiles?.length ?? 0} audio files.`]);
                } catch (e) {
                  setLog((prev) => [...prev, `❌ Failed to import segments from localStorage: ${String(e)}`]);
                }
              }}
            >
              Import Segments (Local)
            </button> */}

            {/* <label className="btn btn-sm btn-outline-secondary mb-0">
              Import Segments (File)
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const parsed = JSON.parse(text) as ExportSegment[];
                    if (!Array.isArray(parsed)) throw new Error('Invalid JSON format');
                    setLog((prev) => [...prev, `Importing ${parsed.length} segments from file and generating audio...`]);
                    const segmentsForTTS = parsed.map(s => ({ speaker: s.speakerIndex === 0 ? 'Speaker 1' : 'Speaker 2', text: s.text }));
                    const ttsResp = await fetch('/api/scriptToAudio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segments: segmentsForTTS }) });
                    if (!ttsResp.ok) {
                      const txt = await ttsResp.text();
                      setLog((prev) => [...prev, `❌ Error generating TTS from imported file: ${ttsResp.status} ${ttsResp.statusText} ${txt}`]);
                      return;
                    }
                    const ttsData = await ttsResp.json();
                    setPodcastFiles(ttsData.savedFiles || []);
                    const rebuiltScript = parsed.map(s => s.text).join('\n\n');
                    setPodcastScript(rebuiltScript);
                    setLog((prev) => [...prev, `✅ Imported segments from file and generated ${ttsData.savedFiles?.length ?? 0} audio files.`]);
                  } catch (err) {
                    setLog((prev) => [...prev, `❌ Failed to import segments from file: ${String(err)}`]);
                  }
                }}
              />
            </label> */}
          </div>
        </div>
        
        {/* Audio Files */}
        {podcastFiles.length > 0 && (
          <div className="mb-3">
            <h4>Generated Audio Segments</h4>
            
            {/* Combined Audio Player */}
            <div className="alert alert-info">
              <h6>🎧 Audio Podcast Player</h6>
              <p className="small">Audio segments are automatically merged into a complete podcast file. You can also play individual segments or download everything:</p>
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
                      <p className="card-text small text-muted">{file.paragraph}</p>
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
      {(yoastDescription || wpExcerpt || podcastScript || podcastFiles.length > 0) && (
        <div className="container shadow p-4 my-2 m-auto rounded-md" style={{ backgroundColor: "#f8f9fa", borderRadius: "20px" }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3>📊 Spreadsheet Data Table</h3>
            <button 
              onClick={() => {
                const table = document.getElementById('single-site-table');
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
            Click &quot;Select Table Data&quot; then Ctrl+C to copy this data for pasting into Excel/Google Sheets.
          </p>
          
          <div className="table-responsive">
            <table id="single-site-table" className="table table-striped table-bordered table-sm">
              <thead className="table-dark">
                <tr>
                  <th>Field</th>
                  <th>Content</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Website URL</strong></td>
                  <td>{websiteURL || 'N/A'}</td>
                </tr>
                {Object.entries(basicInformation).map(([key, value]) => (
                  <tr key={key}>
                    <td><strong>{key}</strong></td>
                    <td>{value || 'N/A'}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Yoast Description</strong></td>
                  <td style={{ maxWidth: '600px', wordWrap: 'break-word' }}>{yoastDescription || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>WP Excerpt</strong></td>
                  <td style={{ maxWidth: '600px', wordWrap: 'break-word' }}>{wpExcerpt || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Audio Files Count</strong></td>
                  <td>{podcastFiles.length}</td>
                </tr>
                <tr>
                  <td><strong>Podcast Script</strong></td>
                  <td style={{ maxWidth: '600px', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {podcastScript || 'N/A'}
                  </td>
                </tr>
                <tr>
                  <td><strong>Pages Scraped Count</strong></td>
                  <td>{pageBodies.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Horizontal format table for easy spreadsheet copying */}
          <div className="mt-4">
            <h5>📋 Horizontal Format (Better for Spreadsheets)</h5>
            <p className="text-muted small">This format is optimized for copying into spreadsheet rows:</p>
            
            <div className="table-responsive">
              <table className="table table-striped table-bordered table-sm">
                <thead className="table-primary">
                  <tr>
                    <th>Website URL</th>
                    {Object.keys(basicInformation).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                    <th>Yoast Description</th>
                    <th>WP Excerpt</th>
                    <th>Audio Files</th>
                    <th>Pages Scraped</th>
                    <th>Podcast Script (First 200 chars)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{websiteURL || 'N/A'}</td>
                    {Object.values(basicInformation).map((value, index) => (
                      <td key={index}>{value || 'N/A'}</td>
                    ))}
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {yoastDescription || 'N/A'}
                    </td>
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {wpExcerpt || 'N/A'}
                    </td>
                    <td className="text-center">{podcastFiles.length}</td>
                    <td className="text-center">{pageBodies.length}</td>
                    <td style={{ maxWidth: '400px', wordWrap: 'break-word', fontSize: '0.8em' }}>
                      {podcastScript 
                        ? (podcastScript.substring(0, 200) + (podcastScript.length > 200 ? '...' : ''))
                        : 'N/A'
                      }
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
