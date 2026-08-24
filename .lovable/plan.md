# Fix transcript and subtitle generation

## What's wrong today

Transcription is currently not happening at all. Every recording row in the database has an empty transcript (verified: 7 of 7 recordings, including today's). When the earlier 502/memory problem was fixed, the transcription step was removed from the upload endpoint and never replaced — the recording row is now saved with `transcript: null` always.

Because subtitles are generated from those transcripts, the `.srt` download produces only question headings and no spoken text. The SRT timings are also synthetic (sentences spread evenly over the clip duration), so even with text they would drift out of sync.

## The fix

1. **Capture audio separately while recording.** During each question, the interview page records a second, audio-only stream alongside the video. Audio-only is roughly 1 MB per minute instead of tens of MB, so it can be transcribed without hitting backend memory limits.
2. **Upload the audio directly to storage**, using the same signed-upload approach as the video (browser to storage, never through the backend).
3. **Transcribe from the small audio file** in a background call after the recording row is saved, requesting word/segment timestamps from the speech-to-text model, and store both the plain transcript and the timed segments on the recording.
4. **Build real subtitles from those timestamps** so the `.srt` file is properly in sync, with a fallback to the current even-distribution method when timestamps are unavailable.
5. **Add a "Generate transcript" action** in the interview viewer for recordings that have no transcript yet (for example if the transcription call failed), so the editorial team can retry without re-recording.
6. **Show transcript status** in the viewer: "Transcribing…", "No transcript" with the retry action, or the transcript text.

Note: recordings made before this change have no stored audio, so they cannot be transcribed retroactively. New interviews will have transcripts, and the AI summary (which reads transcripts) will start producing real content again.

## Technical details

- `src/routes/interview.$token.tsx`: add a second `MediaRecorder` over an audio-only `MediaStream` (audio track from the existing stream), started/stopped with the video recorder. On stop, request a signed upload URL for an `.webm` audio path, upload directly, then include `audio_path` in the finalize call.
- `src/routes/api/public/upload-recording.ts`: `get_upload_url` accepts a `kind: "video" | "audio"` so it can mint audio paths; `finalize` stores `audio_path` and then transcribes by streaming the audio object from storage into the Lovable AI Gateway transcription endpoint (`whisper-1`, `response_format: verbose_json`) with a conservative size guard. Store `transcript` plus `transcript_segments` (jsonb). Transcription failure never fails the finalize response.
- Migration: add `audio_path text`, `transcript_segments jsonb`, `transcript_status text` columns to `interview_recordings` (nullable, defaults), no policy changes needed since writes go through the server key.
- New server function `retranscribeRecording` in `src/lib/interview-editor.functions.ts` (auth-protected) to re-run transcription for one recording.
- `src/routes/_authenticated/interviews.$id.tsx`: `downloadSrt` uses `transcript_segments` offsets per recording when present; keep the existing sentence-distribution path as fallback. Add per-recording retry button and status text.
