"use client";

import React, { useState, useEffect, useRef } from "react";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import Link from "next/link";

interface ProcessedWebsite {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  organizationName?: string;
  yoastDescription?: string;
  wpExcerpt?: string;
  podcastScript?: string;
  podcastFiles?: AudioFiles[];
  error?: string;
  progress?: string;
}

type AudioFiles = {
  audioData: string; // Base64 encoded audio data
  fileName: string; // Original file name
  paragraph?: string; // Preview text
}

interface PageBody {
  bodyText: string;
  href: string;
}

// Combined Audio Player Component with automatic merging
function CombinedAudioPlayer({ audioFiles }: { audioFiles: AudioFiles[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [autoMergeAttempted, setAutoMergeAttempted] = useState(false);
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

  // Auto-merge when FFmpeg is loaded and audio files are available
  useEffect(() => {
    if (ffmpegLoaded && audioFiles.length > 0 && !autoMergeAttempted && !mergedAudioUrl) {
      setAutoMergeAttempted(true);
      mergeAudioFiles();
    }
  }, [ffmpegLoaded, audioFiles.length, autoMergeAttempted, mergedAudioUrl]);

  const mergeAudioFiles = async () => {
    if (!ffmpegLoaded || audioFiles.length === 0) return;
    
    setIsMerging(true);
    const ffmpeg = ffmpegRef.current;
    
    try {
      // Write input files to FFmpeg filesystem
      const inputFiles: string[] = [];
      for (let i = 0; i < audioFiles.length; i++) {
        const fileName = `input${i}.mp3`;
        const audioData = audioFiles[i].audioData;
        const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
        await ffmpeg.writeFile(fileName, audioBuffer);
        inputFiles.push(fileName);
      }

      // Create concat file list
      const concatList = inputFiles.map(file => `file '${file}'`).join('\n');
      await ffmpeg.writeFile('filelist.txt', concatList);

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
      const url = URL.createObjectURL(blob);
      setMergedAudioUrl(url);

      // Clean up input files
      for (const file of inputFiles) {
        try {
          await ffmpeg.deleteFile(file);
        } catch (e) {
          console.warn(`Failed to delete ${file}:`, e);
        }
      }
      await ffmpeg.deleteFile('filelist.txt');
      await ffmpeg.deleteFile('output.mp3');

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

export default function BatchProcessor() {
  const [websiteList, setWebsiteList] = useState("");
  const [processedWebsites, setProcessedWebsites] = useState<ProcessedWebsite[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  const [globalLog, setGlobalLog] = useState<string[]>([]);

  // load bootstrap - CSS only (JS disabled to prevent Next.js conflicts)
  // useEffect(() => {
  //   // Using non-null assertion to avoid TypeScript error for missing declaration file
  //   import("bootstrap/dist/js/bootstrap.bundle.min.js" as any);
  // }, []);

  const parseWebsiteList = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Add https:// if no protocol is specified
        if (!line.startsWith('http://') && !line.startsWith('https://')) {
          return 'https://' + line;
        }
        return line;
      });
  };

  const processWebsite = async (website: ProcessedWebsite): Promise<ProcessedWebsite> => {
    const updatedWebsite = { ...website };
    
    try {
      updatedWebsite.status = 'processing';
      updatedWebsite.progress = 'Scraping website...';
      setProcessedWebsites(prev => prev.map(w => w.id === website.id ? updatedWebsite : w));

      // Step 1: Scrape Website
      const scrapeResponse = await fetch("/api/scrapeWebsite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ websiteURL: website.url }),
      });

      if (!scrapeResponse.ok) {
        throw new Error(`Scraping failed: ${scrapeResponse.status} - ${scrapeResponse.statusText}`);
      }

      const scrapeData = await scrapeResponse.json();
      const pageBodiesLiveCopy = [...scrapeData.pageBodies, { bodyText: scrapeData.bodyText, href: website.url }];
      const organizationName = scrapeData.basicInformation?.organizationName || "Organization";
      
      updatedWebsite.organizationName = organizationName;
      updatedWebsite.progress = 'Generating descriptions...';
      setProcessedWebsites(prev => prev.map(w => w.id === website.id ? updatedWebsite : w));

      // Step 2: Generate AI Descriptions
      const descriptionsResponse = await fetch("/api/generateDescriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          pageBodies: pageBodiesLiveCopy, 
          websiteURL: website.url, 
          organizationName 
        }),
      });

      if (descriptionsResponse.ok) {
        const descriptionsData = await descriptionsResponse.json();
        updatedWebsite.yoastDescription = descriptionsData.content || "";
      }

      // Step 3: Generate WP Excerpt
      updatedWebsite.progress = 'Generating excerpt...';
      setProcessedWebsites(prev => prev.map(w => w.id === website.id ? updatedWebsite : w));

      const excerptResponse = await fetch("/api/generateWpExcerpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          pageBodies: pageBodiesLiveCopy, 
          websiteURL: website.url, 
          organizationName 
        }),
      });

      if (excerptResponse.ok) {
        const excerptData = await excerptResponse.json();
        updatedWebsite.wpExcerpt = excerptData.content || "";
      }

      // Step 4: Generate Podcasts
      updatedWebsite.progress = 'Generating podcast...';
      setProcessedWebsites(prev => prev.map(w => w.id === website.id ? updatedWebsite : w));

      const podcastResponse = await fetch("/api/generatePodcasts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          pageBodies: pageBodiesLiveCopy, 
          websiteURL: website.url, 
          organizationName 
        }),
      });

      if (podcastResponse.ok) {
        const podcastData = await podcastResponse.json();
        updatedWebsite.podcastScript = podcastData.script || "";
        updatedWebsite.podcastFiles = podcastData.savedFiles || [];
      }

      updatedWebsite.status = 'completed';
      updatedWebsite.progress = 'Completed successfully!';
      
    } catch (error) {
      updatedWebsite.status = 'error';
      updatedWebsite.error = error instanceof Error ? error.message : 'Unknown error occurred';
      updatedWebsite.progress = 'Error occurred';
    }

    return updatedWebsite;
  };

  const handleBatchProcess = async () => {
    const urls = parseWebsiteList(websiteList);
    
    if (urls.length === 0) {
      alert("Please enter at least one website URL");
      return;
    }

    // Initialize the websites
    const websites: ProcessedWebsite[] = urls.map((url, index) => ({
      id: `website-${index}`,
      url,
      status: 'pending'
    }));

    setProcessedWebsites(websites);
    setIsProcessing(true);
    setGlobalLog([`Starting batch processing of ${urls.length} websites...`]);

    // Process each website sequentially
    for (let i = 0; i < websites.length; i++) {
      setCurrentProcessingIndex(i);
      setGlobalLog(prev => [...prev, `Processing ${i + 1}/${websites.length}: ${websites[i].url}`]);
      
      const processedWebsite = await processWebsite(websites[i]);
      setProcessedWebsites(prev => prev.map(w => w.id === processedWebsite.id ? processedWebsite : w));
      
      if (processedWebsite.status === 'completed') {
        setGlobalLog(prev => [...prev, `✅ Completed: ${processedWebsite.url}`]);
      } else {
        setGlobalLog(prev => [...prev, `❌ Failed: ${processedWebsite.url} - ${processedWebsite.error}`]);
      }
    }

    setCurrentProcessingIndex(-1);
    setIsProcessing(false);
    setGlobalLog(prev => [...prev, '🎉 Batch processing completed!']);
  };

  const getStatusIcon = (status: ProcessedWebsite['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'processing': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const getStatusColor = (status: ProcessedWebsite['status']) => {
    switch (status) {
      case 'pending': return 'text-muted';
      case 'processing': return 'text-primary';
      case 'completed': return 'text-success';
      case 'error': return 'text-danger';
      default: return 'text-muted';
    }
  };

  const downloadAllResults = () => {
    const completedSites = processedWebsites.filter(w => w.status === 'completed');
    
    const csvContent = [
      'Website URL,Organization Name,Yoast Description,WP Excerpt,Podcast Script Available,Audio Files Count',
      ...completedSites.map(site => [
        site.url,
        site.organizationName || '',
        (site.yoastDescription || '').replace(/"/g, '""'),
        (site.wpExcerpt || '').replace(/"/g, '""'),
        site.podcastScript ? 'Yes' : 'No',
        site.podcastFiles?.length || 0
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-processing-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-vh-100 container py-5">
      {/* Header */}
      <div className="container shadow p-4 m-auto rounded-md mb-4" style={{ backgroundColor: "#e6f7ff", borderRadius: "20px" }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h1>📋 Batch Website Processor</h1>
          {/* <a href="/" className="btn btn-outline-primary">← Single Site</a> */}
          <Link href="/" className="btn btn-outline-primary">← Single Site</Link>
        </div>
        <p className="text-muted">Process multiple websites simultaneously. Enter one URL per line.</p>
      </div>

      {/* Input Section */}
      <div className="container shadow p-4 m-auto rounded-md mb-4" style={{ backgroundColor: "#e6f7ff", borderRadius: "20px" }}>
        <div className="row">
          <div className="col-md-6">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <h3>📝 Website List Input</h3>
              <div className="form-group mb-3">
                <label htmlFor="websiteList" className="form-label">
                  Enter Website URLs (one per line):
                </label>
                <textarea
                  className="form-control"
                  id="websiteList"
                  rows={10}
                  placeholder={`example.com\nhttps://another-site.org\nwww.third-website.net`}
                  value={websiteList}
                  onChange={(e) => setWebsiteList(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div className="d-flex gap-2">
                <button 
                  onClick={handleBatchProcess}
                  disabled={isProcessing || !websiteList.trim()}
                  className="btn btn-success"
                >
                  {isProcessing ? '🔄 Processing...' : '🚀 Start Batch Processing'}
                </button>
                {processedWebsites.filter(w => w.status === 'completed').length > 0 && (
                  <button 
                    onClick={downloadAllResults}
                    className="btn btn-outline-primary"
                  >
                    📥 Download CSV Results
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="col-md-6">
            <div className="p-3 bg-white rounded-lg shadow-sm">
              <h3>📊 Progress Log</h3>
              {globalLog.length > 0 ? (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <ul className="list-group">
                    {globalLog.map((entry, index) => (
                      <li className="list-group-item small" key={index}>
                        {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted">No processing logs yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Processing Queue */}
      {processedWebsites.length > 0 && (
        <div className="container shadow p-4 m-auto rounded-md mb-4" style={{ backgroundColor: "#e6f7ff", borderRadius: "20px" }}>
          <h3>🔄 Processing Queue</h3>
          <div className="row">
            {processedWebsites.map((website, index) => (
              <div key={website.id} className="col-md-6 col-lg-4 mb-3">
                <div className={`card ${currentProcessingIndex === index ? 'border-primary' : ''}`}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6 className="card-title">
                        {getStatusIcon(website.status)} Site {index + 1}
                      </h6>
                      <span className={`badge ${getStatusColor(website.status)}`}>
                        {website.status}
                      </span>
                    </div>
                    <p className="card-text small text-muted">{website.url}</p>
                    {website.organizationName && (
                      <p className="card-text small"><strong>{website.organizationName}</strong></p>
                    )}
                    {website.progress && (
                      <p className="card-text small text-info">{website.progress}</p>
                    )}
                    {website.error && (
                      <p className="card-text small text-danger">{website.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {processedWebsites.filter(w => w.status === 'completed').map((website) => (
        <div key={`result-${website.id}`} className="container shadow p-4 m-auto rounded-md mb-4" style={{ backgroundColor: "#f0f8ff", borderRadius: "20px" }}>
          <h3>✅ {website.organizationName || website.url}</h3>
          <p className="text-muted small">{website.url}</p>
          
          {/* Generated Content */}
          <div className="row">
            <div className="col-md-6">
              <div className="mb-3">
                <h5>📝 Yoast Description</h5>
                <p className="small">{website.yoastDescription || "No description available."}</p>
              </div>
              <div className="mb-3">
                <h5>📄 WP Excerpt</h5>
                <p className="small">{website.wpExcerpt || "No excerpt available."}</p>
              </div>
            </div>
            <div className="col-md-6">
              {website.podcastScript && (
                <div className="mb-3">
                  <h5>🎙️ Podcast Script</h5>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <pre className="small text-wrap">{website.podcastScript}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Files */}
          {website.podcastFiles && website.podcastFiles.length > 0 && (
            <div className="mt-3">
              <h5>🎧 Generated Audio Podcast</h5>
              <div className="alert alert-info">
                <h6>🎧 Audio Podcast Player</h6>
                <p className="small">Audio segments are automatically merged into a complete podcast file. You can also play individual segments or download everything:</p>
                <CombinedAudioPlayer audioFiles={website.podcastFiles} />
              </div>
              
              <h6>Individual Segments:</h6>
              <div className="row">
                {website.podcastFiles.map((file, index) => (
                  <div key={index} className="col-md-6 col-lg-4 mb-3">
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
                            download={`${website.organizationName?.replace(/\s+/g, '-') || 'segment'}-${index + 1}.mp3`}
                            className="btn btn-sm btn-outline-primary"
                          >
                            📥 Download MP3
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
      ))}

      {/* Spreadsheet Table */}
      {processedWebsites.filter(w => w.status === 'completed').length > 0 && (
        <div className="container shadow p-4 m-auto rounded-md mb-4" style={{ backgroundColor: "#f8f9fa", borderRadius: "20px" }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3>📊 Spreadsheet Data Table</h3>
            <div className="d-flex gap-2">
              <button 
                onClick={() => {
                  const table = document.getElementById('spreadsheet-table');
                  const range = document.createRange();
                  range.selectNode(table!);
                  window.getSelection()?.removeAllRanges();
                  window.getSelection()?.addRange(range);
                }}
                className="btn btn-outline-primary btn-sm"
              >
                📋 Select All Table Data
              </button>
              <button 
                onClick={downloadAllResults}
                className="btn btn-outline-success btn-sm"
              >
                📥 Download CSV
              </button>
            </div>
          </div>
          
          <p className="text-muted small mb-3">
            Click &quot;Select All Table Data&quot; then Ctrl+C to copy, or use the CSV download. This table is formatted for easy copying into Excel/Google Sheets.
          </p>
          
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table id="spreadsheet-table" className="table table-striped table-bordered table-sm">
              <thead className="table-dark sticky-top">
                <tr>
                  <th style={{ minWidth: '200px' }}>Website URL</th>
                  <th style={{ minWidth: '150px' }}>Organization Name</th>
                  <th style={{ minWidth: '300px' }}>Yoast Description</th>
                  <th style={{ minWidth: '300px' }}>WP Excerpt</th>
                  <th style={{ minWidth: '100px' }}>Audio Files</th>
                  <th style={{ minWidth: '100px' }}>Status</th>
                  <th style={{ minWidth: '400px' }}>Podcast Script (First 200 chars)</th>
                </tr>
              </thead>
              <tbody>
                {processedWebsites.filter(w => w.status === 'completed').map((website, index) => (
                  <tr key={`table-${website.id}`}>
                    <td>{website.url}</td>
                    <td>{website.organizationName || 'N/A'}</td>
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {website.yoastDescription || 'N/A'}
                    </td>
                    <td style={{ maxWidth: '300px', wordWrap: 'break-word' }}>
                      {website.wpExcerpt || 'N/A'}
                    </td>
                    <td className="text-center">
                      {website.podcastFiles?.length || 0}
                    </td>
                    <td>
                      <span className="badge bg-success">Completed</span>
                    </td>
                    <td style={{ maxWidth: '400px', wordWrap: 'break-word', fontSize: '0.8em' }}>
                      {website.podcastScript 
                        ? (website.podcastScript.substring(0, 200) + (website.podcastScript.length > 200 ? '...' : ''))
                        : 'N/A'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {processedWebsites.filter(w => w.status === 'error').length > 0 && (
            <div className="mt-4">
              <h5 className="text-danger">❌ Failed Websites</h5>
              <div className="table-responsive">
                <table className="table table-striped table-bordered table-sm">
                  <thead className="table-danger">
                    <tr>
                      <th>Website URL</th>
                      <th>Error Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedWebsites.filter(w => w.status === 'error').map((website, index) => (
                      <tr key={`error-${website.id}`}>
                        <td>{website.url}</td>
                        <td className="text-danger">{website.error || 'Unknown error'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
