-- Volunteers known to belong to an event (e.g. Pretix ticket holders), whether or not
-- they have signed up for any shifts yet. Filled by the Pretix volunteer import.
create table if not exists "event_volunteer" (
    "event_id" uuid not null references "event" ("id") on delete cascade,
    "user_id" text not null references "user" ("id") on delete cascade,
    "created_at" timestamptz default CURRENT_TIMESTAMP not null,
    primary key ("event_id", "user_id")
);

create index if not exists "event_volunteer_user_id_idx" on "event_volunteer" ("user_id");
