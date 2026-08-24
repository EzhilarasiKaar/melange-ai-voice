ALTER TABLE public.interview_recordings
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS transcript_segments jsonb,
  ADD COLUMN IF NOT EXISTS transcript_status text NOT NULL DEFAULT 'pending';