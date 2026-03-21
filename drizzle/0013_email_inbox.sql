create table if not exists mailboxes (
  id text primary key,
  provider text not null default 'nylas',
  email_address text not null,
  display_name text,
  nylas_grant_id text,
  nylas_account_id text,
  grant_status text not null default 'disconnected',
  sync_cursor text,
  last_webhook_cursor text,
  last_synced_at timestamptz,
  provider_metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists mailboxes_email_address_idx on mailboxes (email_address);
create unique index if not exists mailboxes_nylas_grant_id_idx on mailboxes (nylas_grant_id);

create table if not exists email_threads (
  id text primary key,
  mailbox_id text not null references mailboxes(id) on delete cascade,
  nylas_thread_id text not null,
  subject text not null default '',
  snippet text,
  participants jsonb,
  unread boolean not null default true,
  inbound_only boolean not null default false,
  last_message_at timestamptz,
  latest_message_id text,
  status text not null default 'active',
  response_state text not null default 'needs_review',
  no_reply_needed boolean not null default false,
  needs_attention boolean not null default true,
  last_agent_run_id text,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists email_threads_mailbox_thread_idx on email_threads (mailbox_id, nylas_thread_id);
create index if not exists email_threads_mailbox_updated_idx on email_threads (mailbox_id, updated_at);
create index if not exists email_threads_response_state_idx on email_threads (response_state);

create table if not exists email_messages (
  id text primary key,
  thread_id text not null references email_threads(id) on delete cascade,
  mailbox_id text not null references mailboxes(id) on delete cascade,
  nylas_message_id text not null,
  direction text not null,
  subject text not null default '',
  from_name text,
  from_email text,
  to_recipients jsonb,
  cc_recipients jsonb,
  bcc_recipients jsonb,
  participants jsonb,
  sent_at timestamptz,
  body_text text,
  body_html text,
  snippet text,
  raw_payload jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists email_messages_nylas_message_id_idx on email_messages (nylas_message_id);
create index if not exists email_messages_thread_sent_at_idx on email_messages (thread_id, sent_at);

create table if not exists email_thread_campaign_links (
  id text primary key,
  thread_id text not null references email_threads(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  confidence integer not null default 0,
  is_primary boolean not null default false,
  match_reason text not null,
  source text not null default 'auto',
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists email_thread_campaign_links_unique_idx on email_thread_campaign_links (thread_id, campaign_id);
create index if not exists email_thread_campaign_links_campaign_idx on email_thread_campaign_links (campaign_id);

create table if not exists email_agent_runs (
  id text primary key,
  mailbox_id text not null references mailboxes(id) on delete cascade,
  thread_id text not null references email_threads(id) on delete cascade,
  trigger_message_id text,
  status text not null default 'pending',
  model text,
  prompt_version text,
  knowledge_base_hash text,
  knowledge_base_path text,
  confidence integer,
  rationale_summary text,
  missing_data_flags jsonb,
  safety_flags jsonb,
  tool_calls jsonb,
  raw_response jsonb,
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create index if not exists email_agent_runs_thread_created_idx on email_agent_runs (thread_id, created_at);
create index if not exists email_agent_runs_status_idx on email_agent_runs (status);

create table if not exists email_agent_run_steps (
  id text primary key,
  run_id text not null references email_agent_runs(id) on delete cascade,
  step_type text not null,
  title text not null,
  content text,
  citations jsonb,
  payload jsonb,
  created_at timestamptz not null
);

create index if not exists email_agent_run_steps_run_idx on email_agent_run_steps (run_id, created_at);

create table if not exists email_drafts (
  id text primary key,
  mailbox_id text not null references mailboxes(id) on delete cascade,
  thread_id text not null references email_threads(id) on delete cascade,
  run_id text references email_agent_runs(id) on delete set null,
  nylas_draft_id text,
  status text not null default 'generated',
  subject text not null default '',
  body_html text not null default '',
  body_text text,
  explanation text,
  explanation_summary text,
  explanation_payload jsonb,
  is_current boolean not null default true,
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists email_drafts_thread_current_idx on email_drafts (thread_id, is_current);
create index if not exists email_drafts_status_idx on email_drafts (status);

create table if not exists email_webhook_events (
  id text primary key,
  mailbox_id text references mailboxes(id) on delete set null,
  external_event_id text,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null
);

create unique index if not exists email_webhook_events_external_event_idx on email_webhook_events (external_event_id);
create index if not exists email_webhook_events_type_idx on email_webhook_events (event_type, created_at);
