
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'editor');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled', 'expired');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Auto-create profile + grant editor role on signup (open editor signup for MVP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'editor') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Templates
CREATE TABLE public.interview_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_duration_seconds INTEGER NOT NULL DEFAULT 300,
  allow_retries BOOLEAN NOT NULL DEFAULT TRUE,
  allow_pause BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_templates TO authenticated;
GRANT ALL ON public.interview_templates TO service_role;
ALTER TABLE public.interview_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors manage templates" ON public.interview_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'editor')) WITH CHECK (public.has_role(auth.uid(), 'editor') AND auth.uid() = created_by);

CREATE TABLE public.template_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.interview_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  follow_up_prompt TEXT,
  follow_up_keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_questions TO authenticated;
GRANT ALL ON public.template_questions TO service_role;
ALTER TABLE public.template_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors manage template questions" ON public.template_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'editor')) WITH CHECK (public.has_role(auth.uid(), 'editor'));

-- Invitations
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.interview_templates(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  leader_name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  email TEXT NOT NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors manage invitations" ON public.invitations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'editor')) WITH CHECK (public.has_role(auth.uid(), 'editor'));

CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_status ON public.invitations(status);

-- Recordings
CREATE TABLE public.interview_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.template_questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  duration_seconds INTEGER,
  transcript TEXT,
  is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_recordings TO authenticated;
GRANT ALL ON public.interview_recordings TO service_role;
ALTER TABLE public.interview_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors read recordings" ON public.interview_recordings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'editor'));

-- Summaries
CREATE TABLE public.interview_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL UNIQUE REFERENCES public.invitations(id) ON DELETE CASCADE,
  executive_summary TEXT,
  key_themes TEXT[] NOT NULL DEFAULT '{}',
  memorable_quotes TEXT[] NOT NULL DEFAULT '{}',
  key_insights TEXT[] NOT NULL DEFAULT '{}',
  pull_quotes TEXT[] NOT NULL DEFAULT '{}',
  suggested_headline TEXT,
  article_title TEXT,
  profile_paragraph TEXT,
  full_transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_summaries TO authenticated;
GRANT ALL ON public.interview_summaries TO service_role;
ALTER TABLE public.interview_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors read summaries" ON public.interview_summaries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'editor'));
