create table "room" ("id" text not null primary key, "creatorId" text not null, "createdAt" bigint not null, "metadata" text not null);

create table "event" ("id" text not null primary key, "roomId" text not null references "room" ("id") on delete cascade, "senderId" text not null, "type" text not null, "stateKey" text, "content" text not null, "timestamp" bigint not null, "sequenceId" bigint not null unique);

create table "eventEdge" ("id" text not null primary key, "eventId" text not null references "event" ("id") on delete cascade, "parentEventId" text not null);

create table "roomState" ("id" text not null primary key, "roomId" text not null references "room" ("id") on delete cascade, "eventType" text not null, "stateKey" text not null, "eventId" text not null references "event" ("id") on delete cascade);

create table "sequence" ("id" text not null primary key, "name" text not null unique, "value" bigint not null);
