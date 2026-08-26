# ReachInbox Scheduler

## Overview

## Setup

## Architecture

## Rate Limiting & Concurrency

### Dashboard refresh strategy

The **Scheduled Emails** tab **polls every 15 seconds** (TanStack Query
`refetchInterval`) rather than offering a manual refresh button.

Scheduled rows change state on their own as the worker drains the queue —
`QUEUED → SENDING → SENT`, or `→ RESCHEDULED` when the hourly limiter defers a
job. None of those transitions is caused by anything the viewer does, so there
is no user action to hang a refresh off. A manual button would leave a stale
table looking authoritative, which is the worse failure for a page whose job is
to tell you what is about to be sent.

`refetchIntervalInBackground` is left off, so a hidden tab stops polling and
resumes on focus instead of holding an open request loop.

The **Sent Emails** tab does **not** poll. `SENT` and `FAILED` are terminal, so
a row already on screen can never change; new rows arrive on window focus or a
tab switch. Scheduling a campaign also invalidates the scheduled list directly,
so newly created rows appear immediately rather than after the next 15s tick.

## Assumptions & Trade-offs
