-- Submitter email, captured at ticket creation, so a review decision can be emailed back
-- to the officer who filed it (Brevo notification — see backend/src/tickets/tickets.service.ts).
ALTER TABLE tickets ADD COLUMN created_by_email text;
